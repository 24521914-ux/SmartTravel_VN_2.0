"""Cloud stack (Neon + Atlas) helper. Run from anywhere: python backend/platform/cloud/manage.py init|check|up|status|down.

Uses the root docker-compose.yml alone (never docker-compose.local.yml) with .env.
"""
import argparse
import json
from pathlib import Path
import subprocess
import sys
from urllib.parse import parse_qs, urlsplit

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE.parent))
from init_env import INTERNAL_SECRETS, PLACEHOLDER, POSTGRES_SERVICES, SERVICES, prepare  # noqa: E402

COMPOSE_FILE = ROOT / 'docker-compose.yml'
TOOLS_FILE = HERE / 'compose.tools.yaml'
ENV_FILE = ROOT / '.env'
# Containers that belong to docker-compose.local.yml (local mode) only.
LOCAL_ONLY_SERVICES = ({f'{s}-db' for s in SERVICES}
                       | {'mongo-init', 'identity-mail', 'community-keygen', 'source-sandbox', 'sandbox-init'})


def _check_jdbc(service, value):
    if not value.startswith('jdbc:postgresql://'):
        raise ValueError(f'{service}: DB_URL must start with jdbc:postgresql://')
    url = urlsplit(value[5:])
    options = parse_qs(url.query)
    if not url.hostname or not url.path.strip('/') or url.username or url.password:
        raise ValueError(f'{service}: use host/database URL and separate credentials')
    if 'YOUR_' in value:
        raise ValueError(f'{service}: fill {service.upper()}_DB_URL in .env')
    if '-pooler.' in url.hostname:
        raise ValueError(f'{service}: use the direct Neon endpoint, not -pooler')
    if options.get('sslmode') != ['verify-full'] or options.get('sslrootcert') != ['/etc/ssl/certs/ca-certificates.crt']:
        raise ValueError(f'{service}: preserve verify-full and container sslrootcert from .env.example')


def _check_atlas(label, value):
    if not value or 'YOUR_' in value:
        raise ValueError(f'{label}: fill the Atlas URI in .env')
    url = urlsplit(value)
    if url.scheme != 'mongodb+srv' or not url.path.strip('/'):
        raise ValueError(f'{label}: use Atlas SRV URI with a database name')
    options = {k.lower(): v[0].lower() for k, v in parse_qs(url.query).items()}
    if any(options.get(k) == 'true' for k in ('tlsinsecure', 'tlsallowinvalidcertificates', 'tlsallowinvalidhostnames')) \
            or any(options.get(k) == 'false' for k in ('tls', 'ssl')):
        raise ValueError(f'{label}: TLS verification must be enabled')


def validate_configuration(config):
    services = config['services']
    leftover = sorted(LOCAL_ONLY_SERVICES & set(services))
    if leftover:
        raise ValueError('Local-only containers must not be in the cloud stack: ' + ', '.join(leftover))
    for name, spec in services.items():
        if spec.get('ports') and name != 'gateway':
            raise ValueError(f'{name}: only the gateway may publish a port')
    for service in SERVICES:
        env = services[service]['environment']
        for key, value in env.items():
            if PLACEHOLDER in str(value):
                raise ValueError(f'{service}: {key} not generated; run manage.py init')
        if service == 'community':
            _check_atlas('community', env.get('MONGODB_URI', ''))
            continue
        _check_jdbc(service, env.get('DB_URL', ''))
        for key in ('DB_PASSWORD', 'DB_MIGRATION_PASSWORD'):
            if not env.get(key) or 'YOUR_' in env[key]:
                raise ValueError(f'{service}: fill the Neon {key.replace("DB_", "").lower()} in .env')
        if env.get('DB_USER') != service + '_runtime' or env.get('DB_MIGRATION_USER') != service + '_migrator':
            raise ValueError(f'{service}: Neon roles must be {service}_runtime and {service}_migrator')
    _check_atlas('community-migrate', services['community-migrate']['environment'].get('COMMUNITY_MONGODB_MIGRATION_URI', ''))
    gateway = services['gateway']['environment']
    if PLACEHOLDER in gateway.get('GATEWAY_EXCHANGE_SECRET', PLACEHOLDER):
        raise ValueError('gateway: GATEWAY_EXCHANGE_SECRET not generated; run manage.py init')


def run(args, **kwargs):
    subprocess.run(args, check=True, cwd=ROOT, **kwargs)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('init', 'check', 'up', 'status', 'down'))
    parser.add_argument('--env-file', type=Path, default=ENV_FILE)
    args = parser.parse_args()
    env_file = args.env_file.resolve()
    if args.action == 'init':
        generated = prepare(env_file, 'cloud')
        print(f'{env_file.name} ready; generated {len(generated)} internal secret(s). '
              'Fill the *_DB_URL, *_PASSWORD and COMMUNITY_MONGODB_* values locally; never send credentials in chat.')
        return 0
    if not env_file.is_file():
        raise ValueError(f'Missing {env_file.name}. Run manage.py init first.')
    compose = ['docker', 'compose', '--env-file', str(env_file), '-f', str(COMPOSE_FILE), '-f', str(TOOLS_FILE)]
    # Capture rendered config (contains credentials); never print or save it.
    result = subprocess.run(compose + ['--profile', 'tools', 'config', '--format', 'json'],
                            capture_output=True, text=True, encoding='utf-8', cwd=ROOT)
    if result.returncode:
        raise ValueError(f'Compose configuration invalid. Check required keys and quoting in {env_file.name}; rendered output hidden.')
    config = json.loads(result.stdout)
    if args.action in ('check', 'up'):
        validate_configuration(config)
    result = subprocess.run(['docker', 'info'], capture_output=True)
    if result.returncode:
        raise ValueError('Docker engine is not running. Start Docker Desktop (Linux containers).')
    if args.action == 'down':
        run(compose + ['--profile', 'tools', 'down'])
    elif args.action == 'status':
        run(compose + ['ps', '-a'])
    else:
        run(compose + ['--profile', 'tools', 'build', 'db-check'])
        run(compose + ['--profile', 'tools', 'run', '--rm', '--no-deps', 'db-check'])
        if args.action == 'up':
            # Builds from source in Docker; waits for init jobs, healthy services and the Gateway.
            run(compose + ['up', '-d', '--build', '--wait', '--wait-timeout', '600'])
            print('Cloud stack healthy. Gateway is the only published entry point (GATEWAY_PUBLISH).')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, FileNotFoundError) as error:
        print(f'ERROR: {error}', file=sys.stderr)
        sys.exit(1)
    except subprocess.CalledProcessError:
        print('ERROR: build/database check/start failed; see the preceding sanitized output.', file=sys.stderr)
        sys.exit(1)
