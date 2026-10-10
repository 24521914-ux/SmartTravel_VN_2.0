"""Real PostgreSQL auth tests in an owned disposable container; never touches P00/P01 volumes.
Run: python backend/services/identity-service/test-local.py
Docker + Java21 required. Container and random credentials are destroyed in finally.
"""
from pathlib import Path
import os
import secrets
import subprocess
import time

ROOT = Path(__file__).resolve().parents[3]


def run(args, env, text=None):
    result = subprocess.run(args, cwd=ROOT, env=env, input=text, text=True,
                            encoding='utf-8', errors='replace', capture_output=True)
    if result.returncode:
        output = result.stdout + result.stderr
        for key, value in env.items():
            if any(marker in key for marker in ['PASSWORD', 'KEY', 'SECRET']) and value:
                output = output.replace(value, '[REDACTED]')
        raise RuntimeError(output[-10000:])
    return result.stdout.strip()


def main():
    name = 'smarttravel-identity-test-' + secrets.token_hex(6)
    admin, migrator, runtime = [secrets.token_hex(24) for _ in range(3)]
    env = dict(os.environ, POSTGRES_PASSWORD=admin, DB_MIGRATION_PASSWORD=migrator, DB_PASSWORD=runtime)
    started = False
    try:
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
        wrapper = str(ROOT / 'backend' / ('mvnw.cmd' if os.name == 'nt' else 'mvnw'))
        result = subprocess.run([wrapper, '-B', '-f', 'backend/services/identity-service/pom.xml', 'clean', 'verify'],
                                cwd=ROOT, env=test_env)
        if result.returncode:
            raise RuntimeError('Identity test build failed; see test output')
    finally:
        if started:
            run(['docker', 'stop', name], env)


if __name__ == '__main__':
    main()
