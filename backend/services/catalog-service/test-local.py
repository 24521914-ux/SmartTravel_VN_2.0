"""Catalog DB tests in a disposable PostGIS container; existing volumes are untouched."""
from pathlib import Path
import os
import secrets
import subprocess
import time
import argparse
import sys

ROOT = Path(__file__).resolve().parents[3]

def run(args, env, text=None):
    result = subprocess.run(args, cwd=ROOT, env=env, input=None if text is None else text.encode(), capture_output=True)
    output = (result.stdout + result.stderr).decode('utf-8', errors='replace')
    if result.returncode:
        for key, value in env.items():
            if any(marker in key for marker in ['PASSWORD','SECRET','TOKEN']) and value:
                output = output.replace(value, '[REDACTED]')
        raise RuntimeError(output[-12000:])
    return result.stdout.decode('utf-8', errors='replace').strip()

def wait_for_database(container, env, timeout=90):
    """The final server must authenticate over TCP and query the actual app DB."""
    probe_env = dict(env, PGPASSWORD=env['POSTGRES_PASSWORD'], PGCONNECT_TIMEOUT='2')
    command = ['docker', 'exec', '-e', 'PGPASSWORD', '-e', 'PGCONNECT_TIMEOUT', container,
               'psql', '-h', '127.0.0.1', '-p', '5432', '-U', 'postgres',
               '-d', 'catalog_db', '-v', 'ON_ERROR_STOP=1', '-Atc', 'SELECT 1']
    deadline = time.monotonic() + timeout
    while (remaining := deadline - time.monotonic()) > 0:
        try:
            result = subprocess.run(command, env=probe_env, capture_output=True,
                                    timeout=min(5, remaining))
            if result.returncode == 0 and result.stdout.strip() == b'1':
                return
        except subprocess.TimeoutExpired:
            pass
        remaining = deadline - time.monotonic()
        if remaining > 0:
            time.sleep(min(0.5, remaining))
    # Do not expose authentication values or raw client errors.
    raise RuntimeError('Catalog PostGIS did not accept an authenticated TCP query to catalog_db before the deadline')


def main():
    if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8',errors='replace')
    parser=argparse.ArgumentParser()
    parser.add_argument('--transport',action='store_true')
    args=parser.parse_args()
    sys.path.insert(0,str(ROOT/'backend/platform'))
    from local_broker_fixture import BrokerFixture
    broker=BrokerFixture('catalog',run)
    name = 'smarttravel-catalog-test-' + secrets.token_hex(6)
    admin, migrator, runtime = [secrets.token_hex(24) for _ in range(3)]
    env = dict(os.environ, POSTGRES_PASSWORD=admin, DB_MIGRATION_PASSWORD=migrator, DB_PASSWORD=runtime)
    env['SPRING_APPLICATION_JSON']='{"debug":false,"logging":{"level":{"root":"WARN","org.springframework":"WARN"}}}'
    started = False
    try:
        run(['docker','run','--rm','-d','--name',name,'-e','POSTGRES_PASSWORD','-e','POSTGRES_DB=catalog_db','-p','127.0.0.1::5432','postgis/postgis:16-3.5'], env)
        started = True
        wait_for_database(name, env)
        run(['docker','exec','-i',name,'psql','-U','postgres','-d','catalog_db','-v','ON_ERROR_STOP=1'],env,
            f"CREATE ROLE catalog_migrator LOGIN PASSWORD '{migrator}';\nCREATE ROLE catalog_runtime LOGIN PASSWORD '{runtime}';\nALTER DATABASE catalog_db OWNER TO catalog_migrator;\nGRANT CREATE ON SCHEMA public TO catalog_migrator;\n")
        port = run(['docker','port',name,'5432'],env).split(':')[-1]
        env.update(CATALOG_DB_TESTS='true',DB_URL=f'jdbc:postgresql://127.0.0.1:{port}/catalog_db',DB_USER='catalog_runtime',DB_MIGRATION_USER='catalog_migrator')
        if args.transport:env.update(broker.start())
        wrapper = ROOT/'backend'/('mvnw.cmd' if os.name=='nt' else 'mvnw')
        command = [str(wrapper)] if os.name=='nt' else ['bash',str(wrapper)]
        print(run(command+['-B','-f','backend/services/catalog-service/pom.xml','clean','verify'],env))
        print('Catalog disposable PostGIS tests PASS')
    finally:
        broker.close()
        if started:
            run(['docker','stop',name],env)

if __name__=='__main__':
    main()
