"""P01 local setup/check runner. Real isolated databases, never drop volumes.
Usage: python backend/infra/p01.py {up|smoke|verify|down}
Secrets are generated once into ignored .env.local (not production credentials).
"""
import argparse
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
INFRA = Path(__file__).resolve().parent
SERVICES = ['identity', 'catalog', 'community', 'trip', 'ingestion', 'intelligence']
RELATIONAL = [s for s in SERVICES if s != 'community']
ENV_FILE = INFRA / '.env.local'


def environment():
    if not ENV_FILE.exists():
        content = '# Generated local-only credentials. Never commit or use in production.\n'
        for service in SERVICES:
            for role in ['ADMIN', 'MIGRATION', 'RUNTIME']:
                content += f'{service.upper()}_{role}_PASSWORD={secrets.token_hex(24)}\n'
        # Exclusive creation prevents replacing an existing credential file.
        with ENV_FILE.open('x', encoding='utf-8') as file:
            file.write(content)
        if os.name != 'nt':
            ENV_FILE.chmod(0o600)
    # Extend local setup without replacing existing database credentials.
    existing = ENV_FILE.read_text(encoding='utf-8')
    present = {line.split('=', 1)[0] for line in existing.splitlines() if line and not line.startswith('#')}
    additions = ''.join(f'{key}={secrets.token_hex(24)}\n' for key in
                        ['BROKER_ADMIN_PASSWORD', 'IDENTITY_BROKER_PASSWORD', 'BROKER_FIXTURE_PASSWORD',
                         'BROKER_OPERATOR_PASSWORD'] + [s.upper()+'_BROKER_PASSWORD' for s in SERVICES if s!='identity'] +
                        [s.upper()+'_BROKER_OPERATOR_PASSWORD' for s in SERVICES if s!='identity'] if key not in present)
    if additions:
        with ENV_FILE.open('a', encoding='utf-8') as file:
            file.write(('' if existing.endswith('\n') else '\n') + additions)
    env = os.environ.copy()
    for line in ENV_FILE.read_text(encoding='utf-8').splitlines():
        if line and not line.startswith('#'):
            key, value = line.split('=', 1)
            env[key] = value
    return env


def run(args, env, text=None, expected=True):
    result = subprocess.run(args, input=text, text=True, encoding='utf-8',
                            errors='replace', capture_output=True, env=env, cwd=ROOT)
    if expected and result.returncode:
        output = result.stdout + result.stderr
        for key, value in env.items():
            if any(marker in key for marker in ['PASSWORD', 'SECRET', 'TOKEN']) and value:
                output = output.replace(value, '[REDACTED]')
        # Do not include command arguments: they can contain connection credentials.
        raise RuntimeError(output[-12000:])
    return result


def compose(env, *args, text=None, expected=True):
    return run(['docker', 'compose', '--env-file', str(ENV_FILE), '-f',
                str(INFRA / 'compose.p01.yaml'), *args], env, text, expected)


def published_port(env, service, container_port):
    address = compose(env, 'port', service, str(container_port)).stdout.strip().splitlines()
    if len(address) != 1 or not address[0].startswith('127.0.0.1:'):
        raise RuntimeError('Expected one loopback Docker port for '+service)
    port = int(address[0].rsplit(':', 1)[1])
    if not 1 <= port <= 65535:
        raise RuntimeError('Invalid Docker published port for '+service)
    return str(port)


def sql(env, service, statement, host=None, database=None, expected=True, login_as=None):
    # docker exec inherits only this password, not all services' secrets.
    child_env = dict(env, PGPASSWORD=env[f'{service.upper()}_RUNTIME_PASSWORD'])
    return compose(child_env, 'exec', '-T', '-e', 'PGPASSWORD', f'{host or service}-db',
                   'psql', '-h', f'{host or service}-db', '-U', f'{login_as or service}_runtime',
                   '-d', database or f'{host or service}_db', '-v', 'ON_ERROR_STOP=1', '-At',
                   text=statement, expected=expected)


def expect_denied(env, service, statement, **kwargs):
    result = sql(env, service, statement, expected=False, **kwargs)
    assert result.returncode != 0, f'Expected permission denial: {service}'
    assert any(value in result.stderr.lower() for value in
               ['permission denied', 'password authentication failed', 'must be owner', 'does not exist']), result.stderr


def verify(env, selected=None):
    for service in ([selected] if selected and selected != 'community' else [] if selected else RELATIONAL):
        migrations = ROOT / f'backend/services/{service}-service/src/main/resources/db/migration'
        count = sum(len(re.findall(rf'CREATE TABLE {service}\.', file.read_text(encoding='utf-8')))
                    for file in migrations.glob('V*__*.sql'))
        result = sql(env, service, f"SELECT count(*) FROM information_schema.tables WHERE table_schema='{service}';")
        assert result.stdout.strip() == str(count), f'{service} domain table count mismatch'
        # A real authenticated runtime role can read/write domain data, but cannot DDL,
        # mutate audit records, access Flyway history, connect to postgres, or authenticate cross-service.
        for statement in [f'CREATE TABLE {service}.forbidden(id int);', 'CREATE TABLE public.forbidden(id int);',
                          'CREATE SCHEMA forbidden;', 'SELECT * FROM public.flyway_schema_history;',
                          f'UPDATE {service}.audit_logs SET action=action;', f'DELETE FROM {service}.audit_logs;',
                          f'TRUNCATE {service}.audit_logs;']:
            expect_denied(env, service, statement)
        expect_denied(env, service, 'SELECT 1;', database='postgres')
        for other in ([] if selected else RELATIONAL):
            if other != service:
                expect_denied(env, service, 'SELECT 1;', host=other)
                expect_denied(env, service, 'SELECT 1;', host=other, login_as=other)
        # Verify technical primary keys and real transaction rollback (not an in-memory substitute).
        event = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
        sql(env, service, f"""BEGIN;
INSERT INTO {service}.inbox_events(consumer_name,event_id) VALUES ('p01-storage-probe','{event}');
DO $$ BEGIN
  BEGIN INSERT INTO {service}.inbox_events(consumer_name,event_id) VALUES ('p01-storage-probe','{event}');
  RAISE EXCEPTION 'duplicate inbox accepted'; EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
ROLLBACK;
""")
        assert sql(env, service, f"SELECT count(*) FROM {service}.inbox_events WHERE event_id='{event}';").stdout.strip() == '0'
        probe = INFRA / 'tests' / f'{service}.sql'
        sql(env, service, probe.read_text(encoding='utf-8'))
        print(f'PASS {service}: {count} tables; runtime DML, no DDL/history/audit mutation/cross-DB; constraints/rollback', flush=True)
    if not selected or selected == 'community':
        print(compose(env, 'exec', '-T', 'community-db', 'mongosh', '--quiet', '/p01/migrate.js').stdout.strip())
        print(compose(env, 'exec', '-T', 'community-db', 'mongosh', '--quiet', '/p01/storage-test.js').stdout.strip())
    if selected:
        print('Single-service mode: cross-container credential isolation tested by full verify, not this run.')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['up', 'smoke', 'verify', 'down'])
    parser.add_argument('--service', choices=SERVICES, help='Start/smoke/verify just one service independently')
    args = parser.parse_args()
    env = environment()
    if args.action == 'up':
        compose(env, 'config', '--quiet')
        dependencies = [f'{s}-db' for s in ([args.service] if args.service else SERVICES)]
        dependencies.append('identity-broker')  # Shared local transport, no partner service runtime/DB required.
        if not args.service or args.service == 'identity':
            dependencies.append('identity-mail')
        compose(env, 'up', '-d', '--wait', *dependencies)
        compose(env, 'exec', '-T', '--user', 'rabbitmq', 'identity-broker', 'bash', '/p01/bootstrap-broker.sh')
        if not args.service or args.service == 'community':
            print(compose(env, 'exec', '-T', 'community-db', 'mongosh', '--quiet', '/p01/bootstrap.js').stdout.strip())
            print(compose(env, 'exec', '-T', 'community-db', 'mongosh', '--quiet', '/p01/migrate.js').stdout.strip())
        print('P01 databases ready. Build jars, then run smoke to execute/validate Flyway migrations.')
    elif args.action == 'smoke':
        sys.path.insert(0, str(ROOT / 'backend/platform'))
        from check_service_skeletons import check
        previous = os.environ.copy()
        try:
            os.environ.update(env)
            if not args.service or args.service == 'catalog':
                os.environ['P01_CATALOG_DB_PORT'] = published_port(env, 'catalog-db', 5432)
            for service in [args.service] if args.service else SERVICES:
                check(service, p01=True)
        finally:
            os.environ.clear()
            os.environ.update(previous)
    elif args.action == 'verify':
        verify(env, args.service)
    else:
        compose(env, 'down')  # deliberately never --volumes
        print('Stopped P01 dependencies; volumes retained.')


if __name__ == '__main__':
    main()
