"""Run from repository root: python backend/platform/cloud/manage.py init|check|up|status|down."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import sys
import time
from urllib.error import URLError
from urllib.parse import parse_qs, urlsplit
from urllib.request import urlopen

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SERVICES = ('identity', 'catalog', 'community', 'trip', 'ingestion', 'intelligence')


def validate_configuration(config):
    for service in SERVICES:
        env = config['services'][service]['environment']
        required = ('MONGODB_URI',) if service == 'community' else ('DB_URL', 'DB_USER', 'DB_PASSWORD')
        for key in required:
            value = env.get(key, '')
            if not value or 'YOUR_' in value:
                raise ValueError(f'{service}: fill {key} in .env')
        if service == 'community':
            url = urlsplit(env['MONGODB_URI'])
            if url.scheme != 'mongodb+srv' or not url.path.strip('/'):
                raise ValueError('community: use Atlas SRV URI with a database name')
            options = {k.lower(): v[0].lower() for k, v in parse_qs(url.query).items()}
            if any(options.get(k) == 'true' for k in (
                'tlsinsecure', 'tlsallowinvalidcertificates', 'tlsallowinvalidhostnames'
            )) or any(options.get(k) == 'false' for k in ('tls', 'ssl')):
                raise ValueError('community: TLS verification must be enabled')
        else:
            value = env['DB_URL']
            if not value.startswith('jdbc:postgresql://'):
                raise ValueError(f'{service}: DB_URL must start with jdbc:postgresql://')
            url = urlsplit(value[5:])
            options = parse_qs(url.query)
            if not url.hostname or not url.path.strip('/') or url.username or url.password:
                raise ValueError(f'{service}: use host/database URL and separate credentials')
            if '-pooler.' in url.hostname:
                raise ValueError(f'{service}: use the direct Neon endpoint, not -pooler')
            if options.get('sslmode') != ['verify-full'] or options.get('sslrootcert') != ['/etc/ssl/certs/ca-certificates.crt']:
                raise ValueError(f'{service}: preserve verify-full and container sslrootcert from .env.example')


def run(args, **kwargs):
    subprocess.run(args, check=True, cwd=ROOT, **kwargs)


def wait_for_health(timeout=180):
    pending = dict(zip(SERVICES, range(8101, 8107)))
    deadline = time.monotonic() + timeout
    while pending and time.monotonic() < deadline:
        for service, port in list(pending.items()):
            try:
                with urlopen(f'http://127.0.0.1:{port}/actuator/health', timeout=3) as response:
                    if json.load(response).get('status') == 'UP':
                        print(f'{service}: health UP', flush=True)
                        del pending[service]
            except (URLError, TimeoutError, ValueError, OSError):
                pass
        if pending:
            time.sleep(3)
    if pending:
        raise ValueError('Health timeout: ' + ', '.join(pending) + '. Inspect local logs; do not share unredacted logs.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('init', 'check', 'up', 'status', 'down'))
    parser.add_argument('--env-file', type=Path, default=HERE / '.env')
    args = parser.parse_args()
    env_file = args.env_file.resolve()
    if args.action == 'init':
        if env_file.exists():
            print('Environment file already exists; left unchanged.')
        else:
            env_file.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(HERE / '.env.example', env_file)
            print('Created environment file. Fill it locally; never send credentials in chat.')
        return 0
    if not env_file.is_file():
        raise ValueError('Missing .env. Run manage.py init first.')
    compose = ['docker', 'compose', '--env-file', str(env_file), '-f', str(HERE / 'compose.yaml')]
    # Capture rendered config (contains credentials); never print or save it.
    result = subprocess.run(compose + ['config', '--format', 'json'], capture_output=True, text=True, encoding='utf-8', cwd=ROOT)
    if result.returncode:
        raise ValueError('Compose configuration invalid. Check required keys and quoting in .env; rendered output hidden.')
    config = json.loads(result.stdout)
    if args.action in ('check', 'up'):
        validate_configuration(config)
    result = subprocess.run(['docker', 'info'], capture_output=True)
    if result.returncode:
        raise ValueError('Docker engine is not running. Start Docker Desktop (Linux containers).')
    if args.action == 'down':
        run(compose + ['--profile', 'tools', 'down'])
    elif args.action == 'status':
        run(compose + ['ps'])
    else:
        run(compose + ['build', 'dev-issuer'])
        run(compose + ['--profile', 'tools', 'run', '--rm', '--no-deps', 'db-check'])
        if args.action == 'up':
            wrapper = ROOT / 'backend' / ('mvnw.cmd' if sys.platform == 'win32' else 'mvnw')
            run([str(wrapper), '-B', '-f', 'backend/services/pom.xml', 'clean', 'verify'])
            run(compose + ['build', *SERVICES])
            run(compose + ['up', '-d', 'dev-issuer', *SERVICES])
            wait_for_health()
            print('All six services healthy. Development setup only; no business APIs are implemented yet.')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, FileNotFoundError) as error:
        print(f'ERROR: {error}', file=sys.stderr)
        sys.exit(1)
    except subprocess.CalledProcessError:
        print('ERROR: build/database check failed; see the preceding sanitized check or build output.', file=sys.stderr)
        sys.exit(1)
