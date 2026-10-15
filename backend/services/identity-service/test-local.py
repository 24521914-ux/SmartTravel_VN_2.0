"""Real PostgreSQL auth tests in an owned disposable container; never touches P00/P01 volumes.
Run: python backend/services/identity-service/test-local.py
Docker + Java21 required. Container and random credentials are destroyed in finally.
"""
from pathlib import Path
import os
import argparse
import secrets
import subprocess
import time
import shutil
import tempfile

ROOT = Path(__file__).resolve().parents[3]


def run(args, env, text=None):
    # Binary stdin preserves LF for scripts passed to Docker from Windows.
    result = subprocess.run(args, cwd=ROOT, env=env, input=None if text is None else text.encode('utf-8'), capture_output=True)
    stdout = result.stdout.decode('utf-8', errors='replace')
    stderr = result.stderr.decode('utf-8', errors='replace')
    if result.returncode:
        output = stdout + stderr
        for key, value in env.items():
            if any(marker in key for marker in ['PASSWORD', 'KEY', 'SECRET']) and value:
                output = output.replace(value, '[REDACTED]')
        raise RuntimeError(output[-10000:])
    return stdout.strip()


def maven_command(windows=None):
    """Use bash on POSIX: Git/archives may not preserve mvnw's executable bit."""
    windows = os.name == 'nt' if windows is None else windows
    wrapper = str(ROOT / 'backend' / ('mvnw.cmd' if windows else 'mvnw'))
    return [wrapper] if windows else ['bash', wrapper]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--transport', action='store_true', help='Also run real RabbitMQ fault/DLQ tests')
    parser.add_argument('--isolated-source', action='store_true', help='Build a temporary source copy without touching a running checkout jar')
    args = parser.parse_args()
    name = 'smarttravel-identity-test-' + secrets.token_hex(6)
    broker_name = name + '-broker'
    broker_started = False
    admin, migrator, runtime = [secrets.token_hex(24) for _ in range(3)]
    env = dict(os.environ, POSTGRES_PASSWORD=admin, DB_MIGRATION_PASSWORD=migrator, DB_PASSWORD=runtime)
    started = False
    source_copy = None
    build_root = ROOT
    try:
        if args.isolated_source:
            source_copy = tempfile.TemporaryDirectory(prefix='smarttravel-identity-source-')
            build_root = Path(source_copy.name)
            service = build_root / 'backend/services/identity-service'
            service.mkdir(parents=True)
            shutil.copy2(ROOT / 'backend/services/pom.xml', service.parent / 'pom.xml')
            shutil.copy2(ROOT / 'backend/services/identity-service/pom.xml', service / 'pom.xml')
            shutil.copytree(ROOT / 'backend/services/identity-service/src', service / 'src')
            shutil.copytree(ROOT / 'backend/contracts', build_root / 'backend/contracts')
        run(['docker', 'run', '--rm', '-d', '--name', name,
             '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_DB=identity_db',
             '-p', '127.0.0.1::5432', 'postgres:16-alpine'], env)
        started = True
        for _ in range(60):
            ready = subprocess.run(['docker', 'exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], capture_output=True)
            if ready.returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError('Test PostgreSQL did not become ready')
        run(['docker', 'exec', '-i', name, 'psql', '-U', 'postgres', '-d', 'identity_db', '-v', 'ON_ERROR_STOP=1'], env,
            f"CREATE ROLE identity_migrator LOGIN PASSWORD '{migrator}';\n"
            f"CREATE ROLE identity_runtime LOGIN PASSWORD '{runtime}';\n"
            "ALTER DATABASE identity_db OWNER TO identity_migrator;\n")
        port = run(['docker', 'port', name, '5432'], env).split(':')[-1]
        test_env = dict(os.environ, IDENTITY_DB_TESTS='true', DB_URL=f'jdbc:postgresql://127.0.0.1:{port}/identity_db',
                        DB_USER='identity_runtime', DB_PASSWORD=runtime,
                        DB_MIGRATION_USER='identity_migrator', DB_MIGRATION_PASSWORD=migrator)
        test_env.pop('SPRING_PROFILES_ACTIVE', None)
        test_env.pop('JWT_JWKS_URI', None)
        test_env.pop('IDENTITY_KEYS_FILE', None)
        test_env.pop('IDENTITY_MAIL_KEY', None)
        if args.transport:
            broker_admin, broker_runtime, fixture, operator_password = [secrets.token_hex(24) for _ in range(4)]
            broker_env = dict(env, RABBITMQ_DEFAULT_USER='platform_admin', RABBITMQ_DEFAULT_PASS=broker_admin,
                              IDENTITY_BROKER_PASSWORD=broker_runtime, BROKER_FIXTURE_PASSWORD=fixture,
                              BROKER_OPERATOR_PASSWORD=operator_password)
            run(['docker', 'run', '-d', '--name', broker_name,
                 '-e', 'RABBITMQ_SERVER_ADDITIONAL_ERL_ARGS=+S 2:2', '-e', 'RABBITMQ_CTL_ERL_ARGS=+S 2:2',
                 '-e', 'RABBITMQ_DEFAULT_USER', '-e', 'RABBITMQ_DEFAULT_PASS',
                 '-e', 'IDENTITY_BROKER_PASSWORD', '-e', 'BROKER_FIXTURE_PASSWORD',
                 '-e', 'BROKER_OPERATOR_PASSWORD',
                 '-p', '127.0.0.1::5672', 'rabbitmq:4.1-management-alpine'], broker_env)
            broker_started = True
            for _ in range(120):
                ready = subprocess.run(['docker', 'exec', '--user', 'rabbitmq', broker_name, 'bash', '-ec',
                                        'rabbitmq-diagnostics -q check_running && rabbitmq-diagnostics -q check_port_connectivity'], capture_output=True)
                if ready.returncode == 0:
                    break
                time.sleep(1)
            else:
                raise RuntimeError('Test RabbitMQ did not become ready: ' + run(['docker', 'logs', broker_name], broker_env)[-4000:])
            run(['docker', 'exec', '--user', 'rabbitmq', '-i', broker_name, 'bash'], broker_env,
                (ROOT / 'backend/infra/rabbit/bootstrap-broker.sh').read_text(encoding='utf-8'))
            broker_port = run(['docker', 'port', broker_name, '5672'], broker_env).split(':')[-1]
            test_env.update(IDENTITY_TRANSPORT_TESTS='true', BROKER_HOST='127.0.0.1', BROKER_PORT=broker_port,
                            BROKER_USERNAME='identity_runtime', BROKER_PASSWORD=broker_runtime, BROKER_VHOST='smarttravel',
                            BROKER_FIXTURE_PASSWORD=fixture, BROKER_ADMIN_PASSWORD=broker_admin,
                            BROKER_OPERATOR_PASSWORD=operator_password)
        result = subprocess.run(maven_command() + ['-B', '-f', str(build_root / 'backend/services/identity-service/pom.xml'), 'clean', 'verify'],
                                cwd=build_root, env=test_env)
        if result.returncode:
            raise RuntimeError('Identity test build failed; see test output')
        if source_copy:
            artifacts = ROOT / 'backend/services/identity-service/.local/verified-build'
            artifacts.mkdir(parents=True, exist_ok=True)
            target = build_root / 'backend/services/identity-service/target'
            shutil.copy2(target / 'identity-service-0.0.1-SNAPSHOT.jar', artifacts / 'identity-service-0.0.1-SNAPSHOT.jar')
            shutil.copytree(target / 'surefire-reports', artifacts / 'surefire-reports', dirs_exist_ok=True)
            print('Verified isolated build saved in ignored identity-service/.local/verified-build', flush=True)
    finally:
        try:
            if broker_started:
                run(['docker', 'rm', '-f', broker_name], env)
        finally:
            if started:
                run(['docker', 'stop', name], env)
            if source_copy:
                source_copy.cleanup()


if __name__ == '__main__':
    main()
