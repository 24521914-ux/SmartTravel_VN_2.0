"""Owned, isolated P03 non-AI test stack. Never mounts P02 database volumes.

The Intelligence container remains for privacy/deletion acknowledgements only;
recommendation, model and quality operations are outside this exercise.
"""
import argparse
import base64
from contextlib import contextmanager
import json
import os
from pathlib import Path
import re
import subprocess
import time
from urllib.request import Request, urlopen

import yaml
import p02

ROOT = Path(__file__).resolve().parents[2]
ENVIRONMENTS = Path(__file__).resolve().parent / '.local/p03/environments'
LABEL = 'vn.smarttravel.p03-environment'


def validate_project(project):
    if not isinstance(project, str) or re.fullmatch(r'smarttravel-p03-load-[0-9a-f]{8,16}', project) is None:
        raise ValueError('Expected an owned smarttravel-p03-load-<8..16 hex> project')
    return project


def location(project):
    validate_project(project)
    path = ENVIRONMENTS / project
    for ancestor in [path, *path.parents]:
        if ancestor.is_symlink() or (hasattr(ancestor, 'is_junction') and ancestor.is_junction()):
            raise ValueError('Environment symlink/junction prohibited')
    if not path.resolve().is_relative_to(ENVIRONMENTS.resolve()):
        raise ValueError('Environment outside private root')
    return path


@contextmanager
def provision_context(project):
    previous_local, previous_ports = p02.LOCAL, p02.PORTS
    p02.LOCAL = location(project)
    p02.PORTS = {service: 59101 + i for i, service in enumerate(p02.SERVICES)}
    try:
        yield
    finally:
        p02.LOCAL, p02.PORTS = previous_local, previous_ports


def validate_config(cfg, project):
    validate_project(project)
    if cfg.get('name') != project:
        raise ValueError('Compose project mismatch')
    for name, declaration in cfg.get('volumes', {}).items():
        if declaration and (declaration.get('external') or declaration.get('name') != project + '_' + name
                            or declaration.get('driver_opts') or declaration.get('driver', 'local') != 'local'):
            raise ValueError('Volume must belong exclusively to this project')
    for service in cfg.get('services', {}).values():
        if (service.get('container_name') or service.get('network_mode') or service.get('privileged')
                or service.get('devices') or service.get('volumes_from')):
            raise ValueError('Fixed container names/host networking prohibited')
        for mount in service.get('volumes', []):
            if not isinstance(mount, str):
                raise ValueError('Expected short-syntax mount')
            # Windows drive-colon is legal. All bind mounts must be read-only.
            source = mount.rsplit(':', 2)[0] if mount.endswith(':ro') else mount.rsplit(':', 1)[0]
            if source not in cfg.get('volumes', {}) and not mount.endswith(':ro'):
                raise ValueError('Writable bind mount prohibited')
    for declaration in cfg.get('networks', {}).values():
        if declaration and (declaration.get('external') or declaration.get('name')):
            raise ValueError('Shared external/fixed network prohibited')


def configure(project):
    folder = location(project)
    if (folder / 'compose.yaml').exists():
        cfg = yaml.safe_load((folder / 'compose.yaml').read_text(encoding='utf-8'))
        private_mongo_mounts(cfg, project)
        validate_config(cfg, project)
        (folder / 'compose.yaml').write_text(yaml.safe_dump(cfg, sort_keys=False), encoding='utf-8')
        return cfg
    with provision_context(project):
        values = p02.prepare()
        p02.configuration(values)
    cfg = yaml.safe_load((folder / 'compose.yaml').read_text(encoding='utf-8'))
    cfg['name'] = project
    private_mongo_mounts(cfg, project)
    for name in cfg['volumes']:
        cfg['volumes'][name] = {'name': project + '_' + name, 'labels': {LABEL: project}}
    for name, service in cfg['services'].items():
        service.pop('ports', None)
        service['labels'] = {**service.get('labels', {}), LABEL: project}
        service['restart'] = 'no'
        if name in p02.SERVICES:
            service['ports'] = [f'127.0.0.1:{59101 + p02.SERVICES.index(name)}:{8101 + p02.SERVICES.index(name)}']
        elif name == 'gateway':
            service['ports'] = ['127.0.0.1:59080:8080']
        elif name == 'identity-broker':
            service['ports'] = ['127.0.0.1:59673:15672']
        elif name == 'identity-mail':
            service['ports'] = ['127.0.0.1:59925:8025']
    validate_config(cfg, project)
    (folder / 'compose.yaml').write_text(yaml.safe_dump(cfg, sort_keys=False), encoding='utf-8')
    return cfg


def private_mongo_mounts(cfg, project):
    # Mongo's image declares two VOLUMEs even for the one-shot key generator.
    # Name every volume so safety checks/cleanup never have to trust anonymous disks.
    for service, mounts in [('community-db', [('community-config', '/data/configdb')]),
                            ('community-keygen', [('community-keygen-data', '/data/db'),
                                                  ('community-keygen-config', '/data/configdb')])]:
        if service not in cfg['services']:
            continue
        for name, destination in mounts:
            cfg['volumes'][name] = {'name': project + '_' + name, 'labels': {LABEL: project}}
            volumes = cfg['services'][service].setdefault('volumes', [])
            volumes[:] = [mount for mount in volumes if not mount.endswith(':' + destination)]
            volumes.append(name + ':' + destination)
    for service in ('community-db', 'identity-broker'):
        if service in cfg['services'] and cfg['services'][service].get('healthcheck'):
            cfg['services'][service]['healthcheck'].update(interval='15s', timeout='15s', start_period='20s')


def command(project, *args, content=None):
    folder = location(project)
    cfg = yaml.safe_load((folder / 'compose.yaml').read_text(encoding='utf-8'))
    validate_config(cfg, project)
    values = json.loads((folder / 'secrets.json').read_text(encoding='utf-8'))
    result = subprocess.run(['docker', 'compose', '-p', project, '-f', str(folder / 'compose.yaml'), *args],
                            env=dict(os.environ, **values), input=content, capture_output=True)
    if result.returncode:
        # Compose output can include environment/provider secrets.
        raise RuntimeError('Isolated compose operation failed: ' + args[0])
    return result.stdout


def broker(project, path, body=None, method='GET'):
    values = json.loads((location(project) / 'secrets.json').read_text(encoding='utf-8'))
    auth = base64.b64encode(('platform_admin:' + values['BROKER_ADMIN_PASSWORD']).encode()).decode()
    req = Request('http://127.0.0.1:59673/api/' + path, method=method,
                  data=None if body is None else json.dumps(body).encode(),
                  headers={'Authorization': 'Basic ' + auth, 'Content-Type': 'application/json'})
    with urlopen(req, timeout=15) as response:
        raw = response.read()
        return json.loads(raw) if raw else None


def readiness(project):
    pending = {**{s: 59101 + i for i, s in enumerate(p02.SERVICES)}, 'gateway': 59080}
    deadline = time.monotonic() + 240
    while pending and time.monotonic() < deadline:
        for name, port in list(pending.items()):
            try:
                if p02.request(f'http://127.0.0.1:{port}', '/actuator/health/readiness')[0] == 200:
                    del pending[name]
                    print('READY isolated ' + name, flush=True)
            except (OSError, ValueError):
                pass
        if pending:
            time.sleep(2)
    if pending:
        raise RuntimeError('Isolated readiness deadline: ' + ','.join(pending))


def start(project):
    configure(project)
    command(project, 'up', '-d', '--wait', *[s + '-db' for s in p02.SERVICES], 'identity-broker', 'identity-mail')
    command(project, 'exec', '-T', 'community-db', 'mongosh', '--quiet', '/p01/bootstrap.js')
    command(project, 'exec', '-T', 'community-db', 'mongosh', '--quiet', '/p01/migrate.js')
    previous_broker = p02.broker_request
    try:
        p02.broker_request = lambda *args, **kwargs: broker(project, *args, **kwargs)
        with provision_context(project):
            p02.topology()
    finally:
        p02.broker_request = previous_broker
    command(project, 'up', '-d', *p02.SERVICES, 'gateway', 'source-sandbox')
    readiness(project)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['up', 'status', 'stop'])
    parser.add_argument('--project', required=True)
    args = parser.parse_args()
    validate_project(args.project)
    if args.action == 'up':
        start(args.project)
    elif args.action == 'status':
        print(command(args.project, 'ps').decode('utf-8', errors='replace'))
    else:
        command(args.project, 'stop')


if __name__ == '__main__':
    main()
