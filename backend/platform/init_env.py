"""Create or complete the Docker Compose environment file. Run from anywhere:

    python backend/platform/init_env.py                 # local stack  -> .env       (from .env.example)
    python backend/platform/init_env.py --mode cloud    # Neon + Atlas -> .env.cloud (from .env.cloud.example)

Only values that are missing, empty or still GENERATED_BY_INIT_ENV are filled; an existing value
is never overwritten (database and broker volumes keep the password they were created with).
Local mode also generates the local database passwords and derives the local connection URLs.
Cloud mode never writes database settings: fill the Neon/Atlas values yourself. Values are never
printed; only variable names are reported.
"""
import argparse
import base64
import os
from pathlib import Path
import secrets
import shutil
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[2]
SERVICES = ('identity', 'catalog', 'community', 'trip', 'ingestion', 'intelligence')
POSTGRES_SERVICES = tuple(s for s in SERVICES if s != 'community')
PLACEHOLDER = 'GENERATED_BY_INIT_ENV'
MODES = {
    'local': (ROOT / '.env', ROOT / '.env.example'),
    'cloud': (ROOT / '.env.cloud', ROOT / '.env.cloud.example'),
}


def _hex(length):
    return lambda: secrets.token_hex(length)


# Secrets internal to the stack (broker users, token exchange, client credentials, keys): both modes.
INTERNAL_SECRETS = {
    'BROKER_ADMIN_PASSWORD': _hex(24),
    **{s.upper() + '_BROKER_PASSWORD': _hex(24) for s in SERVICES},
    'CATALOG_BROKER_OPERATOR_PASSWORD': _hex(24),
    'GATEWAY_EXCHANGE_SECRET': _hex(32),
    **{s.upper() + '_WORKLOAD_SECRET': _hex(32) for s in SERVICES if s != 'identity'},
    'CATALOG_CURSOR_KEY': _hex(32),
    'IDENTITY_MAIL_KEY': lambda: base64.b64encode(secrets.token_bytes(32)).decode(),
    'IDENTITY_FIXTURE_PASSWORD': lambda: secrets.token_urlsafe(24),
}
# Local database passwords: generated only in local mode (in the cloud they come from Neon/Atlas).
LOCAL_DATABASE_SECRETS = {f'{s.upper()}_{role}_PASSWORD': _hex(24)
                          for s in SERVICES for role in ('ADMIN', 'MIGRATION', 'RUNTIME')}
# Connection settings every service reads; databases are configuration, not containers.
DATABASE_SETTINGS = ({f'{s.upper()}_DB_URL' for s in POSTGRES_SERVICES}
                     | {f'{s.upper()}_{role}_PASSWORD' for s in POSTGRES_SERVICES for role in ('RUNTIME', 'MIGRATION')}
                     | {'COMMUNITY_MONGODB_URI', 'COMMUNITY_MONGODB_MIGRATION_URI'})


def local_connections(values):
    """Connection settings pointing at the containers of docker-compose.override.yml."""
    derived = {f'{s.upper()}_DB_URL': f'jdbc:postgresql://{s}-db:5432/{s}_db' for s in POSTGRES_SERVICES}
    for name, user in (('COMMUNITY_MONGODB_URI', 'runtime'), ('COMMUNITY_MONGODB_MIGRATION_URI', 'migrator')):
        password = quote(values['COMMUNITY_' + ('RUNTIME' if user == 'runtime' else 'MIGRATION') + '_PASSWORD'], safe='')
        derived[name] = (f'mongodb://community_{user}:{password}@community-db:27017/community_db'
                         '?authSource=community_db&replicaSet=rs0')
    return derived


def unquote(value):
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in '\'"':
        return value[1:-1]
    return value


def read_env(path):
    values = {}
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            name, value = line.split('=', 1)
            values[name.strip()] = unquote(value)
    return values


def prepare(env_file, mode='local', template=None):
    """Fill missing values in env_file; returns the variable names (never values) it wrote."""
    template = template or MODES[mode][1]
    if not env_file.exists():
        env_file.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(template, env_file)
    generators = dict(INTERNAL_SECRETS, **(LOCAL_DATABASE_SECRETS if mode == 'local' else {}))
    lines = env_file.read_text(encoding='utf-8').splitlines()
    current = read_env(env_file)
    missing = lambda name: current.get(name, '') in ('', PLACEHOLDER)
    written = {name: generator() for name, generator in generators.items() if missing(name)}
    if mode == 'local':
        merged = dict(current, **written)
        written.update({name: value for name, value in local_connections(merged).items() if missing(name)})
    for index, line in enumerate(lines):
        name = line.split('=', 1)[0].strip()
        if '=' in line and not line.lstrip().startswith('#') and name in written:
            lines[index] = f'{name}={written[name]}'
    present = set(current)
    lines += [f'{name}={value}' for name, value in written.items() if name not in present]
    if written:
        temporary = env_file.with_name(env_file.name + '.tmp')
        temporary.write_text('\n'.join(lines) + '\n', encoding='utf-8')
        os.replace(temporary, env_file)
    if os.name != 'nt':
        env_file.chmod(0o600)
    return sorted(written)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--mode', choices=sorted(MODES), default='local')
    parser.add_argument('--env-file', type=Path, help='default: .env (local) or .env.cloud (cloud) at the repository root')
    args = parser.parse_args()
    env_file = (args.env_file or MODES[args.mode][0]).resolve()
    written = prepare(env_file, args.mode)
    print(f'{env_file.name}: filled {len(written)} value(s)' + (': ' + ', '.join(written) if written else ''))
    if args.mode == 'cloud':
        unfilled = sorted(n for n, v in read_env(env_file).items() if n in DATABASE_SETTINGS and (not v or 'YOUR_' in v))
        if unfilled:
            print('Fill these Neon/Atlas settings locally (never paste them in chat): ' + ', '.join(unfilled))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
