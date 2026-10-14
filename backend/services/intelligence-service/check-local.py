"""Packaged-image smoke on an owned disposable pgvector DB; no shared volumes."""
import argparse
from http.client import HTTPException
import importlib.util
import json
import os
from pathlib import Path
import secrets
import subprocess
import time
from urllib.request import Request, urlopen
from urllib.error import URLError

spec = importlib.util.spec_from_file_location('intelligence_tests', Path(__file__).with_name('test-local.py'))
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--image', default='smarttravel-intelligence:p01-finish-local')
    args = parser.parse_args()
    name = 'intelligence-image-smoke-' + secrets.token_hex(5)
    database, app = name + '-db', name + '-app'
    admin, migrator, runtime = [secrets.token_hex(24) for _ in range(3)]
    env = dict(os.environ, POSTGRES_PASSWORD=admin, DB_PASSWORD=runtime, DB_MIGRATION_PASSWORD=migrator,
               DB_USER='intelligence_runtime', DB_MIGRATION_USER='intelligence_migrator',
               DB_URL=f'jdbc:postgresql://{database}:5432/intelligence_db',
               JWT_JWKS_URI='http://127.0.0.1:1/jwks', JWT_ISSUER='image-fixture', SPRING_PROFILES_ACTIVE='p01local')
    network_created = db_started = app_started = False
    try:
        helper.run(['docker', 'network', 'create', name], env)
        network_created = True
        helper.run(['docker', 'run', '-d', '--name', database, '--network', name,
                    '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_DB=intelligence_db', 'pgvector/pgvector:pg16'], env)
        db_started = True
        for _ in range(60):
            if subprocess.run(['docker', 'exec', database, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], capture_output=True).returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError('DB not ready')
        helper.run(['docker', 'exec', '-i', database, 'psql', '-U', 'postgres', '-d', 'intelligence_db', '-v', 'ON_ERROR_STOP=1'], env,
                   f"CREATE ROLE intelligence_migrator LOGIN PASSWORD '{migrator}';\n"
                   f"CREATE ROLE intelligence_runtime LOGIN PASSWORD '{runtime}';\n"
                   'ALTER DATABASE intelligence_db OWNER TO intelligence_migrator;\nCREATE EXTENSION vector;\n')
        command = ['docker', 'run', '-d', '--name', app, '--network', name, '-p', '127.0.0.1::8106']
        for key in ['DB_URL', 'DB_USER', 'DB_PASSWORD', 'DB_MIGRATION_USER', 'DB_MIGRATION_PASSWORD', 'JWT_JWKS_URI', 'JWT_ISSUER', 'SPRING_PROFILES_ACTIVE']:
            command += ['-e', key]
        helper.run(command + [args.image], env)
        app_started = True
        port = helper.run(['docker', 'port', app, '8106'], env).split(':')[-1]
        base = f'http://127.0.0.1:{port}'
        for _ in range(90):
            try:
                with urlopen(base + '/actuator/health', timeout=2) as response:
                    if json.load(response)['status'] == 'UP':
                        break
            except (URLError, TimeoutError, OSError, HTTPException):
                pass
            time.sleep(1)
        else:
            raise RuntimeError('Image health did not become UP')
        for probe in ('readiness', 'liveness'):
            with urlopen(base + '/actuator/health/' + probe, timeout=3) as response:
                assert response.status == 200 and json.load(response)['status'] == 'UP'
        migration_count = helper.run(['docker', 'exec', database, 'psql', '-U', 'postgres', '-d', 'intelligence_db',
                                     '-Atc', 'select count(*) from public.flyway_schema_history where success and version is not null'], env)
        assert migration_count == '9', f'Expected V1-V9, applied {migration_count} migrations'
        request = Request(base + '/api/v1/recommendations', data=b'{"topN":5,"currency":"VND"}', headers={'Content-Type': 'application/json'}, method='POST')
        with urlopen(request, timeout=5) as response:
            body = json.load(response)
            assert response.status == 200 and set(body) == {'request_id', 'version', 'data_as_of', 'fallback', 'items'}
            assert body['version'] == 'basic-v1' and body['items'] == []
        assert helper.run(['docker', 'exec', app, 'sh', '-c', 'test -w /app/artifacts && id -u'], env) == '10001'
        print('Intelligence image PASS: Flyway V1-V9, PostgreSQL/pgvector, UP health, guest frozen recommendation response, nonroot writable artifacts')
    finally:
        if app_started:
            helper.run(['docker', 'rm', '-f', app], env)
        if db_started:
            helper.run(['docker', 'rm', '-f', database], env)
        if network_created:
            helper.run(['docker', 'network', 'rm', name], env)


if __name__ == '__main__':
    main()
