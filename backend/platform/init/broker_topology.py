"""RabbitMQ topology from the contract registry: vhost, least-privilege users, exchanges, bindings.

`plan()` is pure (used by p02.py and tests); `main()` is the rabbit-init container entrypoint.
Every request is an idempotent PUT/POST, so running it again changes nothing.
Passwords only come from the environment and are never printed.
"""
import base64
import json
import os
from pathlib import Path
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

SERVICES = ['identity', 'catalog', 'community', 'trip', 'ingestion', 'intelligence']
VHOST = 'smarttravel'


def _producers(rule):
    return [rule['producer']] if isinstance(rule['producer'], str) else rule['producer']


def _keys(kinds):
    return '^('+'|'.join(k.replace('.', r'\.').replace('-', r'\-') for k in kinds)+')$'


def plan(registry, passwords):
    """Return [(method, path, body)] for the management API.

    `passwords` maps `<SERVICE>_BROKER_PASSWORD` and `CATALOG_BROKER_OPERATOR_PASSWORD`.
    """
    v = VHOST
    requests = [('PUT', 'vhosts/'+v, {})]
    for service in SERVICES:
        requests.append(('PUT', 'users/'+service+'_runtime',
                         {'password': passwords[service.upper()+'_BROKER_PASSWORD'], 'tags': ''}))
        requests.append(('PUT', f'permissions/{v}/{service}_runtime',
                         {'configure': '^'+service+r'\..*', 'write': '^'+service+r'\.(events|inbox|dlq|deadletters)$',
                          'read': '^'+service+r'\..*'}))
        published = [kind for kind, rule in registry['messages'].items() if service in _producers(rule)]
        requests.append(('PUT', f'topic-permissions/{v}/{service}_runtime',
                         {'exchange': service+'.events', 'write': _keys(published), 'read': '.*'}))
        requests.append(('PUT', f'topic-permissions/{v}/{service}_runtime',
                         {'exchange': service+'.inbound', 'write': '^$', 'read': '.*'}))
        for suffix in ['events', 'inbound']:
            requests.append(('PUT', f'exchanges/{v}/{service}.{suffix}',
                             {'type': 'topic', 'durable': True, 'auto_delete': False, 'internal': False, 'arguments': {}}))
    for kind, rule in registry['messages'].items():
        for producer in _producers(rule):
            for consumer in rule['consumers']:
                if producer == consumer:
                    continue
                requests.append(('POST', f'bindings/{v}/e/{producer}.events/e/{consumer}.inbound',
                                 {'routing_key': kind, 'arguments': {}}))
    requests.append(('PUT', 'users/catalog_operator',
                     {'password': passwords['CATALOG_BROKER_OPERATOR_PASSWORD'], 'tags': ''}))
    requests.append(('PUT', f'permissions/{v}/catalog_operator',
                     {'configure': '^$', 'write': '^catalog\\.inbound$', 'read': '^catalog\\.dlq$'}))
    accepted = [kind for kind, rule in registry['messages'].items() if 'catalog' in rule['consumers']]
    requests.append(('PUT', f'topic-permissions/{v}/catalog_operator',
                     {'exchange': 'catalog.inbound', 'write': _keys(accepted), 'read': '^$'}))
    # Registered self-owned events still have a real durable audit sink rather than a test capture.
    requests.append(('PUT', f'queues/{v}/platform.audit', {'durable': True, 'auto_delete': False, 'arguments': {}}))
    requests.append(('PUT', f'policies/{v}/platform-audit-retention',
                     {'pattern': '^platform\\.audit$', 'definition': {'max-length': 10000, 'message-ttl': 2592000000},
                      'priority': 1, 'apply-to': 'queues'}))
    for service in SERVICES:
        requests.append(('POST', f'bindings/{v}/e/{service}.events/q/platform.audit',
                         {'routing_key': '#', 'arguments': {}}))
    return requests


def client(base, user, password):
    auth = base64.b64encode((user+':'+password).encode()).decode()

    def call(path, body=None, method='GET'):
        request = Request(base.rstrip('/')+'/api/'+path,
            data=None if body is None else json.dumps(body).encode(), method=method,
            headers={'Authorization': 'Basic '+auth, 'Content-Type': 'application/json'})
        with urlopen(request, timeout=10) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    return call


def main():
    env = os.environ
    names = [s.upper()+'_BROKER_PASSWORD' for s in SERVICES]+['CATALOG_BROKER_OPERATOR_PASSWORD']
    missing = [name for name in ['BROKER_ADMIN_PASSWORD']+names if not env.get(name)]
    if missing:
        sys.exit('rabbit-init: missing '+', '.join(missing))
    call = client(env.get('BROKER_API_URL', 'http://rabbitmq:15672'),
                  env.get('BROKER_ADMIN_USER', 'platform_admin'), env['BROKER_ADMIN_PASSWORD'])
    registry = json.loads(Path(env.get('REGISTRY_FILE', '/contracts/registry.json')).read_text(encoding='utf-8'))
    # The broker healthcheck covers AMQP; the management API may start a little later.
    deadline = time.monotonic()+120
    while True:
        try:
            call('overview')
            break
        except (HTTPError, URLError, OSError) as error:
            if isinstance(error, HTTPError) and error.code in (401, 403) or time.monotonic() > deadline:
                raise
            time.sleep(2)
    requests = plan(registry, {name: env[name] for name in names})
    for method, path, body in requests:
        call(path, body, method)
    print(f'rabbit-init: applied {len(requests)} topology requests to vhost {VHOST}', flush=True)


if __name__ == '__main__':
    main()
