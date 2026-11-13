"""Integration test and operations harness for the running local stack. Never starts or builds it.

The default stack is docker-compose.yml with Neon/Atlas settings from the repository .env:
    python backend/platform/init_env.py && docker compose up -d --build --wait
This harness then verifies and operates it: smoke, monitor, manifest, renew, replay-catalog-dlq.
It reads credentials from the repository .env and signs test-only workload tokens with the
Identity key that the key-init job keeps in its volume. Evidence files are Git-ignored.
P03 isolated projects (p03_environment.py) still generate their own compose via configuration().
"""
import argparse
import base64
import hashlib
import html
import importlib.util
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import yaml
from configure_mail import load_mail_settings

ROOT = Path(__file__).resolve().parents[2]
INFRA = Path(__file__).resolve().parent
# Shared with the compose init containers (backend/platform/init).
sys.path.insert(0, str(ROOT / 'backend/platform/init'))
import broker_topology  # noqa: E402
import identity_keys  # noqa: E402

LOCAL = INFRA / '.local/p02'
DEFAULT_LOCAL = LOCAL
COMPOSE_FILES = [ROOT / 'docker-compose.yml']
DB_PORTS_FILE = ROOT / 'docker-compose.db-ports.yml'
ENV_FILE = Path(os.environ.get('P02_ENV_FILE', str(ROOT / '.env')))
if not ENV_FILE.is_absolute():
    ENV_FILE = ROOT / ENV_FILE
SERVICES = ['identity', 'catalog', 'community', 'trip', 'ingestion', 'intelligence']
PORTS = dict(identity=58101, catalog=58102, community=58103, trip=58104,
             ingestion=58105, intelligence=58106)


# Client-credentials callers; Identity holds every secret, each caller only its own.
WORKLOAD_SECRETS = [s.upper()+'_WORKLOAD_SECRET' for s in SERVICES if s != 'identity']
# Identity signing key read from the key-init volume (default stack), cached per process.
SIGNING_KEYS = {}


def exclusive(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('x', encoding='utf-8') as stream:
        stream.write(content)
    if os.name != 'nt':
        path.chmod(0o600)


def read_env(path):
    values = {}
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            name, value = line.split('=', 1)
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in '\'"':
                value = value[1:-1]
            values[name.strip()] = value
    return values


def prepare():
    """Credentials of the stack under test (values never printed).

    Default stack: the repository .env written by backend/platform/init_env.py (read only).
    P03 isolated projects: a private secrets.json and signing key generated on first use.
    """
    LOCAL.mkdir(parents=True, exist_ok=True)
    if LOCAL == DEFAULT_LOCAL:
        if not ENV_FILE.exists():
            raise SystemExit('Missing environment file: run init_env.py for the selected cloud/local-test mode first.')
        values = read_env(ENV_FILE)
        values.update(load_mail_settings())
        return values
    secret_file = LOCAL / 'secrets.json'
    if not secret_file.exists():
        values = {f'{s.upper()}_{r}_PASSWORD': secrets.token_hex(24)
                  for s in SERVICES for r in ['ADMIN', 'MIGRATION', 'RUNTIME', 'BROKER']}
        values.update(BROKER_ADMIN_PASSWORD=secrets.token_hex(24),
                      GATEWAY_EXCHANGE_SECRET=secrets.token_hex(32),
                      IDENTITY_FIXTURE_PASSWORD=secrets.token_urlsafe(24),
                      IDENTITY_MAIL_KEY=base64.b64encode(secrets.token_bytes(32)).decode(),
                      CATALOG_CURSOR_KEY=secrets.token_hex(32))
        exclusive(secret_file, json.dumps(values, indent=2))
    values = json.loads(secret_file.read_text(encoding='utf-8'))
    # Values added after a volume set was first provisioned are appended, never rotated.
    added = {name: secrets.token_hex(32 if name.endswith('_WORKLOAD_SECRET') else 24)
             for name in ['CATALOG_BROKER_OPERATOR_PASSWORD', *WORKLOAD_SECRETS] if name not in values}
    if added:
        values.update(added)
        secret_file.write_text(json.dumps(values, indent=2), encoding='utf-8')
    key_file = LOCAL / 'keys.json'
    if not key_file.exists():
        exclusive(key_file, json.dumps(identity_keys.generate('p02-identity-1')))
    values.update(load_mail_settings())
    return values


def run(arguments, values=None, check=True):
    result = subprocess.run(arguments, cwd=ROOT, capture_output=True, text=True,
                            encoding='utf-8', errors='replace', env=dict(os.environ, **(values or {})))
    if check and result.returncode:
        output = result.stdout + result.stderr
        for value in (values or {}).values():
            if len(str(value)) > 12:
                output = output.replace(str(value), '[REDACTED]')
        raise RuntimeError(output[-6000:])
    return result


def compose(*arguments, check=True):
    """docker compose against the stack under test (default: the repository files and .env)."""
    values = prepare()
    if LOCAL != DEFAULT_LOCAL:
        return run(['docker', 'compose', '-p', 'smarttravel-p02', '-f',
                    str(LOCAL / 'compose.yaml'), *arguments], values, check)
    selected = list(COMPOSE_FILES)
    if os.environ.get('COMPOSE_FILE'):
        separator = os.environ.get('COMPOSE_PATH_SEPARATOR', os.pathsep)
        selected = [Path(p) if Path(p).is_absolute() else ROOT / p
                    for p in os.environ['COMPOSE_FILE'].split(separator) if p]
    if os.environ.get('P02_DB_PORTS') == '1':
        if ROOT / 'docker-compose.local.yml' not in selected:
            raise ValueError('P02_DB_PORTS requires explicitly selected docker-compose.local.yml and .env.local')
        selected.append(DB_PORTS_FILE)
    files = [arg for path in selected for arg in ('-f', str(path))]
    # Values are passed only to redact command output; Compose itself reads .env.
    return run(['docker', 'compose', '--env-file', str(ENV_FILE), *files, *arguments], values, check)


def configuration(values):
    # Reuse reviewed database images/init scripts, with a different project, volumes and ports.
    cfg = yaml.safe_load((INFRA / 'compose.p01.yaml').read_text(encoding='utf-8'))
    cfg['name'] = 'smarttravel-p02'
    for service in cfg['services'].values():
        for index, volume in enumerate(service.get('volumes', [])):
            if isinstance(volume, str) and volume.startswith('.'):
                source, *rest = volume.split(':')
                service['volumes'][index] = str((INFRA / source).resolve()).replace('\\', '/') + ':' + ':'.join(rest)
        service['ports'] = [p.replace('55672:', '56672:').replace('55673:', '56673:')
                            .replace('51025:', '52025:').replace('58025:', '59025:')
                            .replace('5643', '5743').replace('57117:', '58117:')
                            for p in service.get('ports', [])]
    broker = cfg['services']['identity-broker']
    # P02 has no fixture publisher. Broker topology is installed by the platform once.
    broker['environment'].pop('BROKER_FIXTURE_PASSWORD', None)
    broker['volumes'] = [v for v in broker['volumes'] if 'bootstrap-broker.sh' not in v]
    for service in SERVICES:
        env = dict(SPRING_PROFILES_ACTIVE='p02-local', PORT=str(8101 + SERVICES.index(service)),
                   JWT_ISSUER='http://identity:8101', JWT_JWKS_URI='http://identity:8101/.well-known/jwks.json',
                   JWT_AUDIENCE=service, BROKER_HOST='identity-broker', BROKER_PORT='5672',
                   BROKER_USERNAME=service+'_runtime', BROKER_PASSWORD=values[service.upper()+'_BROKER_PASSWORD'],
                   BROKER_VHOST='smarttravel', IDENTITY_SESSION_URI='http://identity:8101/internal/v1/security/session',
                   IDENTITY_SESSION_CACHE_SECONDS='15',
                   GATEWAY_EXCHANGE_SECRET=values['GATEWAY_EXCHANGE_SECRET'],
                   CATALOG_BASE_URL='http://catalog:8102', CATALOG_URL='http://catalog:8102',
                   INGESTION_URL='http://ingestion:8105', IDENTITY_URL='http://identity:8101',
                   COMMUNITY_URL='http://community:8103', TRIP_URL='http://trip:8104',
                   TRANSPORT_ENABLED='true', **{service.upper()+'_TRANSPORT_ENABLED': 'true',
                   service.upper()+'_BROKER_PASSWORD': values[service.upper()+'_BROKER_PASSWORD']})
        if service == 'community':
            env['MONGODB_URI'] = ('mongodb://community_runtime:'+values['COMMUNITY_RUNTIME_PASSWORD']+
                                 '@community-db:27017/community_db?authSource=community_db&replicaSet=rs0')
        else:
            env.update(DB_URL=f'jdbc:postgresql://{service}-db:5432/{service}_db',
                       DB_USER=service+'_runtime', DB_PASSWORD=values[service.upper()+'_RUNTIME_PASSWORD'],
                       DB_MIGRATION_USER=service+'_migrator',
                       DB_MIGRATION_PASSWORD=values[service.upper()+'_MIGRATION_PASSWORD'])
        volumes = [f'{service}-objects:/app/.local']
        if service == 'intelligence':
            volumes = ['intelligence-objects:/app/artifacts']
        if service == 'identity':
            env.update(IDENTITY_KEYS_FILE='/run/identity/keys.json', IDENTITY_ACTIVE_KID='p02-identity-1',
                       IDENTITY_MAIL_KEY=values['IDENTITY_MAIL_KEY'], MAIL_HOST='identity-mail', MAIL_PORT='1025',
                       IDENTITY_NOTIFICATION_EMAIL_ENABLED='true', IDENTITY_FIXTURES_ENABLED='true',
                       IDENTITY_FIXTURE_PASSWORD=values['IDENTITY_FIXTURE_PASSWORD'],
                       **{name: values[name] for name in WORKLOAD_SECRETS})
            env.update({key: values[key] for key in (
                'MAIL_HOST', 'MAIL_PORT', 'MAIL_USERNAME', 'MAIL_PASSWORD', 'MAIL_AUTH',
                'MAIL_TLS_REQUIRED', 'MAIL_TIMEOUT_MS', 'IDENTITY_MAIL_FROM',
                'IDENTITY_NOTIFICATION_EMAIL_ENABLED') if key in values})
            cfg['volumes']['identity-signing-keys'] = {'name': 'smarttravel-p02_identity-signing-keys'}
            volumes.append('identity-signing-keys:/run/identity:ro')
        if service == 'catalog':
            env['CATALOG_CURSOR_KEY'] = values['CATALOG_CURSOR_KEY']
        properties = {'catalog.base-url': 'http://catalog:8102',
                      'ingestion.base-url': 'http://ingestion:8105',
                      'intelligence.community-url': 'http://community:8103',
                      'intelligence.identity-url': 'http://identity:8101',
                      'intelligence.trip-url': 'http://trip:8104',
                      'catalog.cursor-key': values['CATALOG_CURSOR_KEY']}
        if service != 'identity':
            # Identity issues 10-minute client-credentials tokens; services renew them in memory (F-32).
            env.update(WORKLOAD_TOKEN_URI='http://identity:8101/internal/v1/security/workload-token',
                       WORKLOAD_CLIENT_ID=service, WORKLOAD_CLIENT_SECRET=values[service.upper()+'_WORKLOAD_SECRET'])
        if service == 'ingestion':
            env.update(WORKER_ENABLED='true', CONNECTOR_ALLOWED_HOSTS='source-sandbox')
        env['SPRING_APPLICATION_JSON'] = json.dumps(properties)
        cfg['volumes'][service+'-objects'] = None
        cfg['services'][service] = dict(image=f'smarttravel-{service}:p02-local', environment=env,
            ports=[f'127.0.0.1:{PORTS[service]}:{env["PORT"]}'], volumes=volumes,
            restart='unless-stopped')
    gateway_env = dict(SPRING_PROFILES_ACTIVE='p02-local', PORT='8080',
        JWT_ISSUER='http://identity:8101', JWT_JWKS_URI='http://identity:8101/.well-known/jwks.json',
        GATEWAY_EXCHANGE_SECRET=values['GATEWAY_EXCHANGE_SECRET'],
        GATEWAY_IDENTITY_EXCHANGE_URI='http://identity:8101/internal/v1/security/exchange',
        CORS_ALLOWED_ORIGINS='http://localhost:5173,http://127.0.0.1:5173,http://localhost:58080,http://127.0.0.1:58080',
        **{s.upper()+'_URL': f'http://{s}:{8101+SERVICES.index(s)}' for s in SERVICES})
    cfg['services']['gateway'] = dict(image='smarttravel-api-gateway:p02-local', environment=gateway_env,
        ports=['127.0.0.1:58080:8080'], restart='unless-stopped')
    cfg['services']['source-sandbox'] = dict(image='python:3.12-alpine', user='10001:10001',
        command=['python', '/provider/source_sandbox.py'],
        volumes=[str(INFRA / 'providers/source_sandbox.py').replace('\\', '/')+':/provider/source_sandbox.py:ro'],
        restart='unless-stopped')
    (LOCAL / 'compose.yaml').write_text(yaml.safe_dump(cfg, sort_keys=False), encoding='utf-8')


def signing_keys():
    """Identity key set: the key-init volume of the default stack, or a P03 project's own file."""
    if LOCAL != DEFAULT_LOCAL:
        return json.loads((LOCAL / 'keys.json').read_text(encoding='utf-8'))
    if 'default' not in SIGNING_KEYS:
        # Read through the key-init job image (no network); the key stays in memory only.
        result = compose('run', '--rm', '--no-deps', '-T', '--entrypoint', 'cat', 'key-init', '/keys/keys.json')
        SIGNING_KEYS['default'] = json.loads(result.stdout)
    return SIGNING_KEYS['default']


def workload(client, audience, scopes):
    """Test-harness workload token signed with the real Identity key (smoke, faults, restore).

    Running services obtain their own short-lived tokens from Identity (client credentials);
    the harness needs internal scopes no runtime client is granted, so it signs its own.
    Cached until near expiry; separate destination credentials.
    """
    sys.path.insert(0, str(ROOT / 'backend/platform'))
    from provision_workload_token import issue
    path = LOCAL / ('token-'+client+'-'+audience+'.json')
    if path.exists():
        cached = json.loads(path.read_text(encoding='utf-8'))
        if cached['expires_at'] > time.time()+3600 and cached['scopes'] == scopes:
            return cached['token']
    token = issue(signing_keys(), 'p02-identity-1', 'http://identity:8101', client, audience, scopes, ttl=86400)
    path.write_text(json.dumps({'token': token, 'expires_at': int(time.time())+86400, 'scopes': scopes}), encoding='utf-8')
    if os.name != 'nt':
        path.chmod(0o600)
    return token


def broker_request(path, body=None, method='GET'):
    values = prepare()
    auth = base64.b64encode(('platform_admin:'+values['BROKER_ADMIN_PASSWORD']).encode()).decode()
    request = Request('http://127.0.0.1:56673/api/'+path,
        data=None if body is None else json.dumps(body).encode(), method=method,
        headers={'Authorization': 'Basic '+auth, 'Content-Type': 'application/json'})
    with urlopen(request, timeout=10) as response:
        raw = response.read()
        return json.loads(raw) if raw else None


def topology():
    registry = json.loads((ROOT / 'backend/contracts/registry.json').read_text(encoding='utf-8'))
    for method, path, body in broker_topology.plan(registry, prepare()):
        broker_request(path, body, method)


def request(base, path, method='GET', body=None, token=None, headers=None):
    h = {'Content-Type': 'application/json', **(headers or {})}
    if token:
        h['Authorization'] = 'Bearer '+token
    req = Request(base+path, data=None if body is None else json.dumps(body).encode(), method=method, headers=h)
    try:
        response = urlopen(req, timeout=15)
    except HTTPError as error:
        response = error
    with response:
        raw = response.read()
        return response.status, json.loads(raw) if raw else None, dict(response.headers)


def wait_ready():
    deadline = time.monotonic()+180
    pending = dict(PORTS, gateway=58080)
    while pending and time.monotonic() < deadline:
        for name, port in list(pending.items()):
            try:
                if request(f'http://127.0.0.1:{port}', '/actuator/health/readiness')[0] == 200:
                    print('READY '+name, flush=True)
                    del pending[name]
            except (OSError, ValueError):
                pass
        if pending:
            time.sleep(2)
    if pending:
        raise RuntimeError('Readiness deadline: '+', '.join(pending))


def monitor():
    states = []
    alarms = []
    for name, port in dict(PORTS, gateway=58080).items():
        try:
            code, body, _ = request(f'http://127.0.0.1:{port}', '/actuator/health/readiness')
            ready = code == 200 and body.get('status') == 'UP'
        except (OSError, ValueError):
            ready = False
        states.append({'service': name, 'ready': ready})
        if not ready:
            alarms.append(name+' readiness down')
    queues = [{'name': q['name'], 'ready': q.get('messages_ready', 0), 'unacknowledged': q.get('messages_unacknowledged', 0),
               'consumers': q.get('consumers', 0)} for q in broker_request('queues/smarttravel')]
    for queue in queues:
        if queue['name'].endswith('.dlq') and queue['ready']:
            alarms.append(queue['name']+' contains rejected events')
        if queue['name'].endswith('.inbox') and (queue['consumers'] == 0 or queue['ready'] > 1000):
            alarms.append(queue['name']+' consumer down/backlog')
    for path in LOCAL.glob('token-*.json'):
        # Files left by services before client credentials (F-32) are no longer used.
        if path.name.split('-')[1] in SERVICES:
            continue
        if json.loads(path.read_text(encoding='utf-8'))['expires_at']-time.time() < 3600:
            alarms.append('Workload credentials expire soon: run p02.py renew')
    report = {'timestamp': time.time(), 'services': states, 'queues': queues, 'alarms': alarms}
    (LOCAL / 'monitor.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    rows = ''.join('<tr><td>'+html.escape(s['service'])+'</td><td>'+('UP' if s['ready'] else 'DOWN')+'</td></tr>' for s in states)
    queue_rows = ''.join('<tr><td>'+html.escape(q['name'])+f'</td><td>{q["ready"]}</td><td>{q["unacknowledged"]}</td><td>{q["consumers"]}</td></tr>' for q in queues)
    (LOCAL / 'dashboard.html').write_text('<!doctype html><meta charset="utf-8"><title>P02 runtime</title>'
        '<style>body{font:16px system-ui;max-width:1000px;margin:40px auto}table{border-collapse:collapse;width:100%}'
        'td,th{padding:10px;border-bottom:1px solid #ddd;text-align:left}</style><h1>P02 runtime</h1>'
        '<p>Snapshot: '+time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())+'</p><p>Alerts: '+html.escape('; '.join(alarms) or 'none')+'</p>'
        '<table><tr><th>Service</th><th>Readiness</th></tr>'+rows+'</table><h2>RabbitMQ</h2>'
        '<table><tr><th>Queue</th><th>Ready</th><th>Unacknowledged</th><th>Consumers</th></tr>'+queue_rows+'</table>', encoding='utf-8')
    print(json.dumps(report, indent=2))
    return not alarms


def manifest():
    packages = {}
    for service in SERVICES+['api-gateway']:
        source = ROOT / ('backend/platform/api-gateway' if service=='api-gateway' else f'backend/services/{service}-service')
        files = [source / 'pom.xml', source / 'Dockerfile'] + sorted((source / 'src').rglob('*'))
        digest = hashlib.sha256()
        for path in files:
            if path.is_file():
                digest.update(path.relative_to(ROOT).as_posix().encode())
                digest.update(path.read_bytes())
        image = 'smarttravel-'+service+':p02-local'
        image_id = run(['docker', 'image', 'inspect', '--format', '{{.Id}}', image]).stdout.strip()
        container = compose('ps', '-q', 'gateway' if service=='api-gateway' else service).stdout.strip()
        assert container, 'No running container for '+service
        running_image_id = run(['docker', 'inspect', '--format', '{{.Image}}', container]).stdout.strip()
        assert running_image_id == image_id, 'Running image differs from verified tag: '+service
        jar_hash = run(['docker', 'run', '--rm', '--entrypoint', 'sha256sum', image,
                       '/app/app.jar' if service=='api-gateway' else '/app/application.jar']).stdout.split()[0]
        packages[service] = {'source_sha256': digest.hexdigest(), 'image': image, 'image_id': image_id,
                             'running_image_id': running_image_id, 'jar_sha256': jar_hash}
    contracts = ROOT / 'backend/contracts/checksums.json'
    report = {'git_head': run(['git', 'rev-parse', 'HEAD']).stdout.strip(),
              'working_tree_dirty': bool(run(['git', 'status', '--porcelain']).stdout.strip()),
              'contract_manifest_sha256': hashlib.sha256(contracts.read_bytes()).hexdigest(), 'packages': packages}
    (LOCAL / 'manifest.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print('Exact source/image/JAR hashes saved to ignored P02 manifest; Git state recorded accurately.')


def replay_catalog_dlq():
    result = compose('run', '--rm', '--no-deps', '-e', 'CATALOG_BROKER_OPERATOR_PASSWORD',
        '-e', 'CATALOG_BROKER_OPERATOR_USER=catalog_operator', '--entrypoint', 'java', 'catalog',
        '-jar', '/app/application.jar', '--server.address=127.0.0.1', '--server.port=0',
        '--catalog.operator.enabled=true', '--catalog.workers-enabled=false',
        '--catalog.transport.enabled=false', '--management.health.rabbit.enabled=false',
        '--catalog.fixtures.enabled=false', '--spring.flyway.enabled=false',
        '--catalog.operator.action=replay-dlq')
    assert 'Catalog operator replay-dlq:' in result.stdout
    print(next(line for line in result.stdout.splitlines() if 'Catalog operator replay-dlq:' in line), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('action', choices=['smoke', 'monitor', 'manifest', 'renew', 'replay-catalog-dlq', 'apply-mail'])
    args = parser.parse_args()
    if args.action == 'apply-mail':
        values = prepare()
        if not load_mail_settings():
            raise SystemExit('Configure Gmail with configure_mail.py before applying it.')
        if LOCAL != DEFAULT_LOCAL:
            configuration(values)
        compose('up', '-d', '--no-deps', 'identity')
        print('Identity restarted with verified local SMTP settings; other services retained.')
    elif args.action == 'smoke':
        from p02_smoke import smoke
        smoke()
    elif args.action == 'monitor':
        if not monitor():
            raise SystemExit(1)
    elif args.action == 'manifest':
        manifest()
    elif args.action == 'renew':
        # Only the test harness caches tokens; services renew theirs from Identity (F-32).
        for path in LOCAL.glob('token-*.json'):
            cached = json.loads(path.read_text(encoding='utf-8'))
            cached['expires_at'] = 0
            path.write_text(json.dumps(cached), encoding='utf-8')
        print('Harness workload tokens will be reissued on next use.')
    else:
        replay_catalog_dlq()


if __name__ == '__main__':
    main()
