"""Full local application recovery from a synthetic isolated P03 checkpoint.

Only p03_environment-owned projects are accepted. P02 volumes are never mounted.
Backups contain test credentials and remain in ignored private directories.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
import time
import uuid
import re
from urllib.request import urlopen

import yaml
from p02 import SERVICES, ROOT, request
from p03_candidate import candidate_manifest
from p03_environment import location, command, start, validate_config, provision_context, broker, LABEL
from p03_nonai_load import Environment, validate_mounts
from p03_restore import docker, pg_snapshot, mongo_snapshot, canonical_schema


def container(project, service):
    value = command(project, 'ps', '-q', service).decode().strip()
    if not value:
        raise RuntimeError('Missing isolated container: ' + service)
    return value


def clone_config(source, target):
    source_path, target_path = location(source), location(target)
    if target_path.exists():
        raise ValueError('Restore target must be a new isolated project')
    existing = docker('ps', '-aq', '--filter', 'label=com.docker.compose.project=' + target).strip()
    volumes = docker('volume', 'ls', '--format', '{{.Name}}').decode().splitlines()
    if existing or any(name.startswith(target + '_') for name in volumes):
        raise ValueError('Restore target Docker resources already exist')
    target_path.mkdir(parents=True)
    for name in ('keys.json', 'secrets.json'):
        shutil.copy2(source_path / name, target_path / name)
    cfg = yaml.safe_load((source_path / 'compose.yaml').read_text(encoding='utf-8'))
    cfg['name'] = target
    for name in cfg['volumes']:
        cfg['volumes'][name] = {'name': target + '_' + name, 'labels': {LABEL: target}}
    for service in cfg['services'].values():
        service['labels'] = {LABEL: target}
        service['volumes'] = [mount.replace(source_path.as_posix(), target_path.as_posix()) for mount in service.get('volumes', [])]
    if 'identity' in cfg['services']:
        environment = cfg['services']['identity'].setdefault('environment', {})
        properties = json.loads(environment.get('SPRING_APPLICATION_JSON', '{}'))
        properties.update({'identity.retention.poll-ms': 1000, 'identity.retention.initial-delay-ms': 1000})
        environment['SPRING_APPLICATION_JSON'] = json.dumps(properties)
    validate_config(cfg, target)
    (target_path / 'compose.yaml').write_text(yaml.safe_dump(cfg, sort_keys=False), encoding='utf-8')
    return cfg


def cleanup_target(target):
    ids = docker('ps', '-aq', '--filter', 'label=com.docker.compose.project=' + target).decode().split()
    if ids:
        containers = json.loads(docker('inspect', *ids))
        # Recover pre-fix Mongo keygen anonymous volumes only when the stopped,
        # owned one-shot container is their sole reference. Never relax app guards.
        for item in containers:
            labels = item.get('Config', {}).get('Labels', {})
            if (labels.get('com.docker.compose.service') == 'community-keygen'
                    and labels.get('com.docker.compose.project') == target
                    and not item.get('State', {}).get('Running')):
                for mount in item.get('Mounts', []):
                    name = mount.get('Name', '')
                    if mount.get('RW') and not name.startswith(target + '_'):
                        if mount.get('Type') != 'volume' or mount.get('Destination') not in {'/data/db', '/data/configdb'}:
                            raise RuntimeError('Unexpected keygen mount; cleanup refused')
                        refs = docker('ps', '-aq', '--filter', 'volume=' + name).decode().split()
                        if len(refs) != 1 or not item['Id'].startswith(refs[0]):
                            raise RuntimeError('Shared anonymous volume; cleanup refused')
                docker('rm', '-v', item['Id'])
        ids = docker('ps', '-aq', '--filter', 'label=com.docker.compose.project=' + target).decode().split()
        if ids:
            validate_mounts(target, json.loads(docker('inspect', *ids)))
    cfg = yaml.safe_load((location(target) / 'compose.yaml').read_text(encoding='utf-8'))
    validate_config(cfg, target)
    for name in cfg['volumes']:
        info = docker('volume', 'ls', '--filter', 'name=^' + target + '_' + name + '$', '--format', '{{.Name}}').decode().split()
        for volume in info:
            inspected = json.loads(docker('volume', 'inspect', volume))[0]
            if inspected.get('Labels', {}).get(LABEL) != target:
                raise RuntimeError('Restore volume ownership mismatch; cleanup refused')
    command(target, 'down', '--volumes')


def snapshot(project):
    return {service: mongo_snapshot(container(project, service + '-db'), True) if service == 'community'
            else pg_snapshot(container(project, service + '-db'), service) for service in SERVICES}


def rating_checkpoint(project):
    env = Environment(location(project) / 'compose.yaml', project)
    existing = env.sql('catalog', "SELECT row_to_json(r) FROM catalog.place_rating_summary r WHERE place_id='a2000000-0000-4000-8000-000000000001';").strip()
    if existing:
        row = json.loads(existing)
        if row['review_count'] >= 1 and row['source_version'] >= 1:
            return row
    values = env.secrets
    base = 'http://127.0.0.1:59080'
    sessions = {}
    for alias in ('u1', 'admin'):
        status, data, _ = request(base, '/api/identity/api/v1/auth/login', 'POST',
            {'email': 'fixture-' + alias + '@example.invalid', 'password': values['IDENTITY_FIXTURE_PASSWORD']})
        if status != 200:
            raise RuntimeError('Rating recovery fixture login failed')
        sessions[alias] = data['access_token']
    place = 'a2000000-0000-4000-8000-000000000001'
    status, review, _ = request(base, '/api/community/api/v1/places/' + place + '/reviews', 'POST',
        {'rating': 5, 'content': 'P03 synthetic recovery rating', 'media_keys': []}, sessions['u1'],
        {'Idempotency-Key': str(uuid.uuid4())})
    if status != 201:
        raise RuntimeError('Rating recovery fixture creation failed: ' + str(status) + ' ' + str(review.get('code')))
    status, _, _ = request(base, '/api/community/api/v1/admin/reviews/' + review['review_id'] + '/moderate',
        'POST', {'action': 'APPROVE', 'reason': 'Synthetic recovery checkpoint'}, sessions['admin'],
        {'If-Match': '"' + str(review['version']) + '"'})
    if status != 202:
        raise RuntimeError('Rating recovery fixture moderation failed')
    deadline = time.monotonic() + 40
    while time.monotonic() < deadline:
        raw = env.sql('catalog', "SELECT row_to_json(r) FROM catalog.place_rating_summary r WHERE place_id='" + place + "';").strip()
        if raw:
            row = json.loads(raw)
            if row['review_count'] >= 1 and row['source_version'] >= 1:
                return row
        time.sleep(.5)
    raise RuntimeError('Rating projection checkpoint did not converge')


def retention_fixture(target):
    env = Environment(location(target) / 'compose.yaml', target)
    expired, recent = str(uuid.uuid4()), str(uuid.uuid4())
    env.sql('identity', "INSERT INTO identity.inbox_events(consumer_name,event_id,processed_at) VALUES "
            "('p03-recovery-retention','" + expired + "',now()-interval '91 days'),"
            "('p03-recovery-retention','" + recent + "',now());")
    return expired, recent


def privacy_after_recovery(target, retention_ids=None):
    import p02
    env = Environment(location(target) / 'compose.yaml', target)
    base = 'http://127.0.0.1:59080'
    evidence = []
    def call(service, path, method='GET', body=None, token=None, expected=200, version=None):
        headers = {'Idempotency-Key': str(uuid.uuid4())}
        if version is not None:
            headers['If-Match'] = '"' + str(version) + '"'
        status, data, _ = request(base, '/api/' + service + '/api/v1' + path, method, body, token, headers)
        evidence.append({'service': service, 'method': method, 'status': status, 'expected': expected})
        if status != expected:
            raise RuntimeError('Recovered privacy API failed: ' + service + ' ' + str(status))
        return data
    email = 'p03-dr-' + uuid.uuid4().hex + '@example.invalid'
    password = env.secrets['IDENTITY_FIXTURE_PASSWORD']
    call('identity', '/auth/register', 'POST', {'email': email, 'password': password,
         'display_name': 'Synthetic restore privacy'}, expected=202)
    deadline = time.monotonic() + 30
    message = None
    while time.monotonic() < deadline:
        with urlopen('http://127.0.0.1:59925/api/v1/messages', timeout=10) as response:
            messages = json.load(response).get('messages', [])
        message = next((item for item in messages if email in json.dumps(item)), None)
        if message:
            break
        time.sleep(.5)
    if not message:
        raise RuntimeError('Isolated SMTP verification mail missing')
    with urlopen('http://127.0.0.1:59925/api/v1/message/' + message['ID'], timeout=10) as response:
        verification = re.findall(r'[A-Za-z0-9_-]{32,}', json.load(response).get('Text', ''))
    if not verification:
        raise RuntimeError('Isolated verification token missing')
    call('identity', '/auth/verify-email', 'POST', {'token': verification[-1]}, expected=202)
    session = call('identity', '/auth/login', 'POST', {'email': email, 'password': password})
    token = session['access_token']
    profile = call('identity', '/me', token=token)
    user = profile['user_id']
    active_event = json.loads(env.sql('identity', "SELECT payload FROM identity.outbox_events WHERE aggregate_id='" + user + "' AND event_type='identity.user.status-changed.v1' ORDER BY aggregate_version LIMIT 1;").strip())
    call('trip', '/me/trips', 'POST', {'name': 'P03 restored deletion proof', 'start_date': '2026-12-01',
         'end_date': '2026-12-02', 'timezone': 'Asia/Ho_Chi_Minh', 'currency': 'VND', 'budget': 100000}, token, 201)
    call('community', '/places/a2000000-0000-4000-8000-000000000001/reviews',
         'POST', {'rating': 4, 'content': 'Synthetic privacy recovery review', 'media_keys': []}, token, 201)
    deletion = call('identity', '/me/deletion-requests', 'POST', {'policy_version': 1}, token, 202)
    with provision_context(target):
        internal = p02.workload('p03-restore', 'identity', ['identity:deletion:read'])
    deadline = time.monotonic() + 60
    completed = False
    while time.monotonic() < deadline:
        status, state, _ = request('http://127.0.0.1:59101', '/internal/v1/deletion-requests/' + deletion['request_id'], token=internal)
        if status == 200 and state['status'] == 'COMPLETED':
            completed = True
            break
        time.sleep(.5)
    if not completed:
        raise RuntimeError('Restored deletion did not receive all service acknowledgements')
    call('trip', '/me/trips', token=token, expected=401)
    if int(env.sql('trip', "SELECT count(*) FROM trip.trips WHERE user_id='" + user + "' AND deleted_at IS NULL;").strip()) != 0:
        raise RuntimeError('Restored deletion left an active owned trip')
    if int(env.mongo('print(c.reviews.countDocuments({user_id:' + json.dumps(user) + '}));').splitlines()[-1]) != 0:
        raise RuntimeError('Restored deletion left owned reviews')
    if retention_ids:
        expired, recent = retention_ids
        deadline = time.monotonic() + 15
        retained = False
        while time.monotonic() < deadline:
            values = env.sql('identity', "SELECT count(*) FILTER(WHERE event_id='" + expired + "'),count(*) FILTER(WHERE event_id='" + recent + "') FROM identity.inbox_events WHERE consumer_name='p03-recovery-retention';").strip()
            if values == '0|1':
                retained = True
                break
            time.sleep(.5)
        if not retained:
            raise RuntimeError('Restored retention worker failed expiry/recent-record boundary')
    admin = call('identity', '/auth/login', 'POST', {'email': 'fixture-admin@example.invalid',
                 'password': env.secrets['IDENTITY_FIXTURE_PASSWORD']})['access_token']
    source = call('ingestion', '/admin/data-sources', 'POST', {'name': 'P03 recovered storage license ' + uuid.uuid4().hex,
        'uri': 'http://source-sandbox:8080/records', 'secret_reference': 'none',
        'license_version': 'synthetic-p03-recovery-v1', 'allow_storage': True, 'allow_training': False}, admin, 201)
    permitted_event = json.loads(env.sql('ingestion', "SELECT payload FROM ingestion.outbox_events WHERE aggregate_id='" + source['source_id'] + "' AND event_type='ingestion.source-policy.changed.v1' ORDER BY aggregate_version LIMIT 1;").strip())
    revoked = call('ingestion', '/admin/data-sources/' + source['source_id'] + '/policy', 'PATCH',
        {'allow_storage': False, 'allow_training': False, 'status': 'REVOKED'}, admin, version=source['version'])
    deadline = time.monotonic() + 30
    propagated = False
    while time.monotonic() < deadline:
        value = env.sql('catalog', "SELECT status||':'||source_version FROM catalog.source_policy_projections WHERE source_id='" + source['source_id'] + "';").strip()
        if value == 'REVOKED:' + str(revoked['source_version']):
            propagated = True
            break
        time.sleep(.5)
    if not propagated:
        raise RuntimeError('Restored revoked storage license did not propagate to Catalog')
    call('ingestion', '/admin/data-sources/' + source['source_id'] + '/import-jobs', 'POST', {'mode': 'FULL'}, admin, 422)
    return {'checks': [{'id': name, 'status': 'PASS', 'evidence': ['restored-privacy-http-and-database-assertions'],
                       'requests': evidence} for name in ['retention_deletion', 'license_revocation']],
            'marker': {'deleted_user_id': user, 'revoked_source_id': source['source_id'],
                       'source_version': revoked['source_version'], 'active_event': active_event,
                       'permitted_event': permitted_event}}


def check_preserved_privacy(target, marker):
    env = Environment(location(target) / 'compose.yaml', target)
    user, source = marker['deleted_user_id'], marker['revoked_source_id']
    deliveries = {}
    for field, exchange in [('active_event', 'identity'), ('permitted_event', 'ingestion')]:
        event = dict(marker[field], event_id=str(uuid.uuid4()))
        deliveries[exchange] = event['event_id']
        result = broker(target, 'exchanges/smarttravel/' + exchange + '.events/publish',
                        {'properties': {'content_type': 'application/json', 'delivery_mode': 2},
                         'routing_key': event['event_type'], 'payload': json.dumps(event), 'payload_encoding': 'string'}, 'POST')
        if not result.get('routed'):
            raise RuntimeError('Stale privacy event was not routed')
    deadline = time.monotonic() + 30
    received = False
    while time.monotonic() < deadline:
        identity_event, policy_event = deliveries['identity'], deliveries['ingestion']
        if (all(env.sql(service, "SELECT count(*) FROM " + service + ".inbox_events WHERE event_id='" + identity_event + "';").strip() == '1'
                for service in ['catalog', 'trip', 'ingestion'])
                and env.sql('catalog', "SELECT count(*) FROM catalog.inbox_events WHERE event_id='" + policy_event + "';").strip() == '1'
                and env.mongo('print(c.inbox_events.countDocuments({event_id:' + json.dumps(identity_event) + '}));').splitlines()[-1] == '1'):
            received = True
            break
        time.sleep(.5)
    if not received:
        raise RuntimeError('Restored consumers did not persist every stale privacy replay')
    for service, table in [('identity', 'identity.users'), ('catalog', 'catalog.user_status_projections')]:
        if env.sql(service, "SELECT status FROM " + table + " WHERE user_id='" + user + "';").strip() != 'DELETED':
            raise RuntimeError('Pre-checkpoint user deletion resurrected after restore/stale event')
    # Trip purges the status projection on deletion; its durable tombstone is
    # authoritative even if an old ACTIVE event recreates that projection.
    if env.sql('trip', "SELECT count(*) FROM trip.user_tombstones WHERE user_id='" + user + "';").strip() != '1':
        raise RuntimeError('Restored Trip deletion tombstone missing')
    if env.sql('trip', "SELECT count(*) FROM trip.trips WHERE user_id='" + user + "';").strip() != '0':
        raise RuntimeError('Restored Trip deletion left owned trips')
    if env.sql('ingestion', "SELECT count(*) FROM ingestion.user_tombstones WHERE user_id='" + user + "';").strip() != '1':
        raise RuntimeError('Restored ingestion deletion tombstone missing')
    if env.mongo('print(c.audit_logs.find({aggregate_id:' + json.dumps(user) + ',action:"USER_STATUS"}).sort({source_version:-1}).limit(1).toArray()[0].status);').splitlines()[-1] != 'DELETED':
        raise RuntimeError('Restored Community user status resurrected')
    if env.sql('catalog', "SELECT status||':'||source_version FROM catalog.source_policy_projections WHERE source_id='" + source + "';").strip() != 'REVOKED:' + str(marker['source_version']):
        raise RuntimeError('Pre-checkpoint revoked license resurrected after restore/stale event')
    return {'deleted_user_state_preserved': True, 'revoked_storage_license_preserved': True,
            'stale_versions_replayed_with_new_event_ids': 2, 'original_ids': {'user': user, 'source': source}}


def exercise(source, target, release_id):
    if source == target:
        raise ValueError('Source and target must differ')
    source_path = location(source)
    Environment(source_path / 'compose.yaml', source).safe()
    before_candidate = candidate_manifest()
    cfg = clone_config(source, target)
    artifacts = source_path / ('checkpoint-' + target)
    artifacts.mkdir(exist_ok=False)
    app_names = SERVICES + ['gateway', 'source-sandbox']
    checks, object_hashes = [], {}
    source_stopped = False
    target_started = False
    checkpoint = time.time()
    try:
        privacy_marker = privacy_after_recovery(source)['marker']
        rating_watermark = rating_checkpoint(source)
        for service in SERVICES:
            # Nonempty, clearly synthetic object proves byte restoration independently of DB counts.
            data = ('P03 non-AI recovery canary ' + service + '\n').encode()
            docker('run', '--rm', '-i', '--network', 'none', '-v', source + '_' + service + '-objects:/objects',
                   'python:3.12-alpine', 'sh', '-c', 'cat > /objects/p03-recovery-canary.txt', data=data)
            object_hashes[service] = hashlib.sha256(data).hexdigest()
        source_stopped = True
        command(source, 'stop', *app_names)
        checkpoint = time.time()
        before = snapshot(source)
        for service in SERVICES:
            db = container(source, service + '-db')
            if service == 'community':
                raw = docker('exec', db, 'sh', '-ec', 'exec mongodump --archive --db community_db -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin')
            else:
                raw = docker('exec', db, 'pg_dump', '-U', service + '_admin', '-d', service + '_db', '-Fc')
            (artifacts / (service + '.dump')).write_bytes(raw)
            raw = docker('run', '--rm', '--network', 'none', '-v', source + '_' + service + '-objects:/objects:ro',
                         'python:3.12-alpine', 'tar', '-C', '/objects', '-cf', '-', '.')
            (artifacts / (service + '.tar')).write_bytes(raw)
        hashes = {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in artifacts.iterdir() if path.is_file()}
        (artifacts / 'checkpoint.json').write_text(json.dumps({'source': before, 'artifact_hashes': hashes,
                                                              'checkpoint_epoch': checkpoint}, indent=2), encoding='utf-8')
        # Free only this disposable stack's fixed host ports; original P02 remains running.
        command(source, 'stop')
        restore_started = time.monotonic()
        target_started = True
        command(target, 'up', '-d', '--wait', *[service + '-db' for service in SERVICES])
        command(target, 'exec', '-T', 'community-db', 'mongosh', '--quiet', '/p01/bootstrap.js')
        command(target, 'exec', '-T', 'community-db', 'mongosh', '--quiet', '/p01/migrate.js')
        for service in SERVICES:
            db = container(target, service + '-db')
            raw = (artifacts / (service + '.dump')).read_bytes()
            if service == 'community':
                command(target, 'exec', '-T', 'community-db', 'sh', '-ec',
                        'exec mongorestore --archive --drop -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin', content=raw)
            else:
                reference = service + '_schema_reference'
                docker('exec', db, 'createdb', '-U', service + '_admin', '-T', 'template0', reference)
                docker('exec', '-i', db, 'pg_restore', '-U', service + '_admin', '-d', reference,
                       '--schema-only', '--clean', '--if-exists', '--exit-on-error', data=raw)
                normalized = docker('exec', db, 'pg_dump', '-U', service + '_admin', '-d', reference,
                                    '--schema-only', '--no-owner', '--no-privileges')
                before[service]['schema'] = hashlib.sha256(canonical_schema(normalized)).hexdigest()
                docker('exec', '-i', db, 'pg_restore', '-U', service + '_admin', '-d', service + '_db',
                       '--clean', '--if-exists', '--exit-on-error', data=raw)
            docker('volume', 'create', '--label', LABEL + '=' + target, target + '_' + service + '-objects')
            docker('run', '--rm', '-i', '--network', 'none', '-v', target + '_' + service + '-objects:/objects',
                   'python:3.12-alpine', 'tar', '-C', '/objects', '-xf', '-', data=(artifacts / (service + '.tar')).read_bytes())
            restored = docker('run', '--rm', '--network', 'none', '-v', target + '_' + service + '-objects:/objects:ro',
                              'python:3.12-alpine', 'cat', '/objects/p03-recovery-canary.txt')
            if hashlib.sha256(restored).hexdigest() != object_hashes[service]:
                raise RuntimeError('Nonempty object checksum mismatch')
        after = snapshot(target)
        if before != after:
            raise RuntimeError('Six-database content/schema/index comparison failed')
        checks.extend([{'id': name, 'status': 'PASS', 'evidence': ['checkpoint.json']}
                       for name in ['six_databases', 'nonempty_objects']])
        restored_rating = Environment(location(target) / 'compose.yaml', target).sql('catalog',
            "SELECT row_to_json(r) FROM catalog.place_rating_summary r WHERE place_id='" + rating_watermark['place_id'] + "';").strip()
        if json.loads(restored_rating) != rating_watermark:
            raise RuntimeError('Restored rating projection watermark differs from checkpoint')
        checks.append({'id': 'projection_watermark', 'status': 'PASS', 'evidence': ['checkpoint-rating-version'],
                       'source_version': rating_watermark['source_version']})
        retention_ids = retention_fixture(target)
        start(target)
        Environment(location(target) / 'compose.yaml', target).safe()
        values = json.loads((location(target) / 'secrets.json').read_text(encoding='utf-8'))
        if command(target, 'port', 'gateway', '8080').decode().strip() != '127.0.0.1:59080':
            raise RuntimeError('Restored Gateway port is not bound to target project')
        code, session, _ = request('http://127.0.0.1:59080', '/api/identity/api/v1/auth/login', 'POST',
            {'email': 'p03-load-1@example.invalid', 'password': values['IDENTITY_FIXTURE_PASSWORD']})
        if code != 200:
            raise RuntimeError('Restored application authentication failed')
        token = session['access_token']
        for service, path in [('catalog', '/places'), ('trip', '/me/trips'), ('community', '/me/favorites')]:
            if request('http://127.0.0.1:59080', '/api/' + service + '/api/v1' + path, token=token)[0] != 200:
                raise RuntimeError('Restored application API failed: ' + service)
        duration = time.monotonic() - restore_started
        if duration > 14400 or time.time() - checkpoint > 86400:
            raise RuntimeError('Local checkpoint RPO/RTO exceeded')
        checks.extend([{'id': name, 'status': 'PASS', 'evidence': ['restored-login-api-readiness']}
                       for name in ['application_recovery', 'rpo_rto']])
        preservation = check_preserved_privacy(target, privacy_marker)
        checks.extend(privacy_after_recovery(target, retention_ids)['checks'])
        # These cases require dedicated measured exercises; this script never invents them.
        candidate = candidate_manifest()
        report = dict(scope='non-ai', release_id=release_id, timestamp=datetime.now(timezone.utc).isoformat(),
                      candidate_before_sha256=before_candidate['sha256'], candidate_sha256=candidate['sha256'],
                      source_hashes={'backend/infra/p03_nonai_restore.py': candidate['files']['backend/infra/p03_nonai_restore.py']},
                      status='PASS' if before == after and before_candidate['sha256'] == candidate['sha256'] else 'FAIL',
                      pass_checks=before == after and before_candidate['sha256'] == candidate['sha256'],
                      application_disaster_recovery_verified=True, checks=checks,
                      storage_and_application_restore_seconds=duration, checkpoint_age_seconds=time.time() - checkpoint,
                      object_checksums=object_hashes, original_p02_untouched=True,
                      privacy_state_preservation=preservation,
                      pending_cases=[],
                      source=before, restored=after, artifact_sha256=hashes,
                      limitations=['Local synthetic application DR; not production PITR or offsite backup certification.'])
        destination = Path(__file__).resolve().parent / '.local/p03/restore-report.json'
        destination.write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps({key: report[key] for key in ['pass_checks', 'application_disaster_recovery_verified',
                         'storage_and_application_restore_seconds', 'pending_cases']}), flush=True)
        return report
    finally:
        try:
            if target_started:
                cleanup_target(target)
        finally:
            if source_stopped:
                start(source)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True)
    parser.add_argument('--target', required=True)
    parser.add_argument('--release-id', required=True)
    args = parser.parse_args()
    exercise(args.source, args.target, args.release_id)
