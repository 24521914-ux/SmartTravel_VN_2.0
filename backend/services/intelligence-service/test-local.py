"""Disposable pgvector PostgreSQL fixture gate; no shared databases or persisted secrets."""
from pathlib import Path
import os
import secrets
import subprocess
import time
import argparse

ROOT = Path(__file__).resolve().parents[3]


def run(args, env, stdin=None):
    p = subprocess.run(args, cwd=ROOT, env=env, input=None if stdin is None else stdin.encode(), capture_output=True)
    output = (p.stdout + p.stderr).decode('utf-8', errors='replace')
    if p.returncode:
        for key, value in env.items():
            if any(k in key for k in ['PASSWORD', 'SECRET', 'TOKEN']) and value:
                output = output.replace(value, '[REDACTED]')
        raise RuntimeError(output[-10000:])
    return p.stdout.decode().strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--transport', action='store_true')
    args = parser.parse_args()
    name = 'smarttravel-intelligence-test-' + secrets.token_hex(6)
    admin, migrator, runtime = [secrets.token_hex(24) for _ in range(3)]
    env = dict(os.environ, POSTGRES_PASSWORD=admin)
    started = False
    broker_started = False
    broker_name = name + '-broker'
    try:
        run(['docker', 'run', '--rm', '-d', '--name', name, '-e', 'POSTGRES_PASSWORD',
             '-e', 'POSTGRES_DB=intelligence_db', '-p', '127.0.0.1::5432', 'pgvector/pgvector:pg16'], env)
        started = True
        for _ in range(60):
            if subprocess.run(['docker', 'exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], capture_output=True).returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError('PostgreSQL not ready')
        run(['docker', 'exec', '-i', name, 'psql', '-U', 'postgres', '-d', 'intelligence_db', '-v', 'ON_ERROR_STOP=1'], env,
            f"CREATE ROLE intelligence_migrator LOGIN PASSWORD '{migrator}';\n"
            f"CREATE ROLE intelligence_runtime LOGIN PASSWORD '{runtime}';\n"
            'ALTER DATABASE intelligence_db OWNER TO intelligence_migrator;\nCREATE EXTENSION vector;\n')
        port = run(['docker', 'port', name, '5432'], env).split(':')[-1]
        test_env = dict(os.environ, INTELLIGENCE_DB_TESTS='true', DB_URL=f'jdbc:postgresql://127.0.0.1:{port}/intelligence_db',
                        DB_USER='intelligence_runtime', DB_PASSWORD=runtime,
                        DB_MIGRATION_USER='intelligence_migrator', DB_MIGRATION_PASSWORD=migrator)
        test_env.pop('SPRING_PROFILES_ACTIVE', None)
        test_env['SPRING_APPLICATION_JSON'] = '{"logging":{"level":{"root":"INFO","org.springframework":"INFO"}}}'
        if args.transport:
            broker_admin, broker_runtime, broker_fixture = [secrets.token_hex(24) for _ in range(3)]
            broker_env = dict(env, RABBITMQ_DEFAULT_USER='platform_admin', RABBITMQ_DEFAULT_PASS=broker_admin,
                              INTELLIGENCE_BROKER_PASSWORD=broker_runtime, IDENTITY_BROKER_PASSWORD=secrets.token_hex(24),
                              BROKER_FIXTURE_PASSWORD=broker_fixture)
            run(['docker', 'run', '-d', '--name', broker_name, '-e', 'RABBITMQ_DEFAULT_USER', '-e', 'RABBITMQ_DEFAULT_PASS',
                 '-e', 'INTELLIGENCE_BROKER_PASSWORD', '-e', 'IDENTITY_BROKER_PASSWORD', '-e', 'BROKER_FIXTURE_PASSWORD',
                 '-e', 'RABBITMQ_SERVER_ADDITIONAL_ERL_ARGS=+S 2:2', '-e', 'RABBITMQ_CTL_ERL_ARGS=+S 2:2',
                 '-p', '127.0.0.1::5672', 'rabbitmq:4.1-management-alpine'], broker_env)
            broker_started = True
            for _ in range(120):
                ready = subprocess.run(['docker', 'exec', '--user', 'rabbitmq', broker_name, 'rabbitmq-diagnostics', '-q', 'check_port_connectivity'], capture_output=True)
                if ready.returncode == 0:
                    break
                time.sleep(1)
            else:
                raise RuntimeError('RabbitMQ not ready')
            run(['docker', 'exec', '--user', 'rabbitmq', '-i', broker_name, 'bash'], broker_env,
                (ROOT / 'backend/infra/rabbit/bootstrap-broker.sh').read_text(encoding='utf-8'))
            broker_port = run(['docker', 'port', broker_name, '5672'], broker_env).split(':')[-1]
            test_env.update(INTELLIGENCE_TRANSPORT_TESTS='true', BROKER_HOST='127.0.0.1', BROKER_PORT=broker_port,
                            BROKER_USERNAME='intelligence_runtime', BROKER_PASSWORD=broker_runtime, BROKER_VHOST='smarttravel',
                            BROKER_ADMIN_PASSWORD=broker_admin, BROKER_FIXTURE_PASSWORD=broker_fixture)
        wrapper = str(ROOT / 'backend' / ('mvnw.cmd' if os.name == 'nt' else 'mvnw'))
        command = [wrapper] if os.name == 'nt' else ['bash', wrapper]
        result = subprocess.run(command + ['-B', '-f', 'backend/services/intelligence-service/pom.xml', 'clean', 'verify'], cwd=ROOT, env=test_env)
        if result.returncode:
            raise RuntimeError('Intelligence verification failed')
    finally:
        if broker_started:
            run(['docker', 'rm', '-f', broker_name], env)
        if started:
            run(['docker', 'stop', name], env)


if __name__ == '__main__':
    main()
