"""Run from repository root: python backend/platform/cloud/manage.py init|check|up|status|down."""
import argparse
import base64
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
from urllib.parse import parse_qs, urlsplit

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SERVICES = ('identity', 'catalog', 'community', 'trip', 'ingestion', 'intelligence')
POSTGRES_SERVICES = tuple(s for s in SERVICES if s != 'community')
PLACEHOLDER = 'GENERATED_BY_MANAGE_INIT'
# Internal secrets only. Neon/Atlas credentials (NEON_*, ATLAS_*) are never generated or rewritten.
INTERNAL_SECRETS = {
    'BROKER_ADMIN_PASSWORD': lambda: secrets.token_hex(24),
    **{s.upper() + '_BROKER_PASSWORD': (lambda: secrets.token_hex(24)) for s in SERVICES},
    'CATALOG_BROKER_OPERATOR_PASSWORD': lambda: secrets.token_hex(24),
    'GATEWAY_EXCHANGE_SECRET': lambda: secrets.token_hex(32),
    **{s.upper() + '_WORKLOAD_SECRET': (lambda: secrets.token_hex(32)) for s in SERVICES if s != 'identity'},
    'CATALOG_CURSOR_KEY': lambda: secrets.token_hex(32),
    'IDENTITY_MAIL_KEY': lambda: base64.b64encode(secrets.token_bytes(32)).decode(),
    'IDENTITY_FIXTURE_PASSWORD': lambda: secrets.token_urlsafe(24),
}
LOCAL_ONLY_SERVICES = {f'{s}-db' for s in SERVICES} | {'mongo-init', 'identity-mail', 'community-keygen', 'dev-issuer'}


def prepare(env_file):
    """Create .env from the example and fill internal secrets that are still placeholders or empty.

    Existing values are never overwritten and cloud database variables are never touched.
    Returns the names (not values) that were generated.
    """
    if not env_file.exists():
        env_file.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(HERE / '.env.example', env_file)
    lines = env_file.read_text(encoding='utf-8').splitlines()
    present, generated = set(), []
    for index, line in enumerate(lines):
        name, separator, value = line.partition('=')
        name = name.strip()
        if not separator or name.startswith('#') or name not in INTERNAL_SECRETS:
            continue
        present.add(name)
        if value.strip().strip("'\"") in ('', PLACEHOLDER):
            lines[index] = f'{name}={INTERNAL_SECRETS[name]()}'
            generated.append(name)
    for name in INTERNAL_SECRETS:
        if name not in present:
            lines.append(f'{name}={INTERNAL_SECRETS[name]()}')
            generated.append(name)
    if generated:
        temporary = env_file.with_name(env_file.name + '.tmp')
        temporary.write_text('\n'.join(lines) + '\n', encoding='utf-8')
        os.replace(temporary, env_file)
    if os.name != 'nt':
        env_file.chmod(0o600)
    return generated


def _check_jdbc(service, value):
    if not value.startswith('jdbc:postgresql://'):
        raise ValueError(f'{service}: DB_URL must start with jdbc:postgresql://')
    url = urlsplit(value[5:])
    options = parse_qs(url.query)
    if not url.hostname or not url.path.strip('/') or url.username or url.password:
        raise ValueError(f'{service}: use host/database URL and separate credentials')
    if 'YOUR_' in value:
        raise ValueError(f'{service}: fill NEON_{service.upper()}_DB_URL in .env')
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
    _check_atlas('community-migrate', services['community-migrate']['environment'].get('ATLAS_MONGODB_MIGRATION_URI', ''))
    gateway = services['gateway']['environment']
    if PLACEHOLDER in gateway.get('GATEWAY_EXCHANGE_SECRET', PLACEHOLDER):
        raise ValueError('gateway: GATEWAY_EXCHANGE_SECRET not generated; run manage.py init')


def run(args, **kwargs):
    subprocess.run(args, check=True, cwd=ROOT, **kwargs)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('init', 'check', 'up', 'status', 'down'))
    parser.add_argument('--env-file', type=Path, default=HERE / '.env')
    args = parser.parse_args()
    env_file = args.env_file.resolve()
    if args.action == 'init':
        generated = prepare(env_file)
        print(f'Environment file ready; generated {len(generated)} internal secret(s). '
              'Fill NEON_* and ATLAS_* locally; never send credentials in chat.')
        return 0
    if not env_file.is_file():
        raise ValueError('Missing .env. Run manage.py init first.')
    compose = ['docker', 'compose', '--env-file', str(env_file), '-f', str(HERE / 'compose.yaml')]
    # Capture rendered config (contains credentials); never print or save it.
    result = subprocess.run(compose + ['--profile', 'tools', 'config', '--format', 'json'],
                            capture_output=True, text=True, encoding='utf-8', cwd=ROOT)
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
