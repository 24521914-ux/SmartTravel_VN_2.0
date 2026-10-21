"""Real HTTP/broker integration assertions; results exclude credentials and PII.

Uses synthetic accounts/data in P02 only, actual Identity issuer and all six apps.
"""
import json
import re
import time
import uuid
from datetime import datetime, timezone

from jsonschema import Draft202012Validator, FormatChecker
from p02 import ROOT, LOCAL, PORTS, SERVICES, prepare, request, workload, broker_request, compose

GATEWAY = 'http://127.0.0.1:58080'
EVIDENCE = []
TRACE = str(uuid.uuid4())
SESSIONS = {}


def call(service, path, method='GET', body=None, token=None, expected=200, version=None, key=None):
    headers = {'X-Correlation-ID': TRACE,
               'traceparent': '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01'}
    if version is not None:
        headers['If-Match'] = '"'+str(version)+'"'
    if key:
        headers['Idempotency-Key'] = key
    code, data, response_headers = request(GATEWAY, '/api/'+service+path, method, body, token, headers)
    assert code == expected, f'{service} {method} {path}: expected {expected}, got {code}, code={(data or {}).get("code")}'
    correlation = {key.lower(): value for key, value in response_headers.items()}.get('x-correlation-id')
    assert correlation == TRACE, 'Gateway/service correlation header changed or missing'
    contract = json.loads((ROOT / f'backend/contracts/openapi/{service}.yaml').read_text(encoding='utf-8'))
    matching = [v for p, v in contract['paths'].items()
                if re.fullmatch(re.sub(r'\{[^}]+\}', '[^/]+', p), path.split('?')[0])]
    if matching and method.lower() in matching[0]:
        schema = matching[0][method.lower()]['responses'].get(str(code), {}).get('content', {}).get('application/json', {}).get('schema')
        if schema:
            Draft202012Validator(schema, format_checker=FormatChecker()).validate(data)
    EVIDENCE.append({'service': service, 'method': method, 'path': path, 'status': code, 'correlation_id': correlation})
    return data


def eventually(function, predicate, label, seconds=30):
    deadline = time.monotonic()+seconds
    while time.monotonic() < deadline:
        value = function()
        if predicate(value):
            print('PASS '+label, flush=True)
            return value
        time.sleep(.5)
    raise AssertionError('Integration deadline: '+label)


def login(alias):
    body = call('identity', '/api/v1/auth/login', 'POST',
                {'email': 'fixture-'+alias+'@example.invalid', 'password': prepare()['IDENTITY_FIXTURE_PASSWORD']})
    assert len(body['access_token']) <= 1024
    SESSIONS[alias] = body
    return body['access_token']


def internal(service, path, method='GET', body=None, scopes=None, expected=200):
    token = workload('platform-integration', service, scopes or [service+':internal'])
    code, data, _ = request('http://127.0.0.1:'+str(PORTS[service]), path, method, body, token)
    assert code == expected, f'{service} internal {path}: {code}, {(data or {}).get("code")}'
    return data


def diagnostic_sql(service, statement):
    """Operator-only evidence, never used by application business logic."""
    result=compose('exec','-T',service+'-db','psql','-U',service+'_admin','-d',service+'_db','-At','-c',statement)
    return result.stdout.strip()


def smoke():
    EVIDENCE.clear()
    run_id = str(uuid.uuid4())
    admin, user, other = login('admin'), login('u1'), login('u2')
    # Same original real Identity token reaches each service via destination exchange.
    for service, path in [('identity', '/api/v1/me'), ('trip', '/api/v1/me/trips'),
                          ('community', '/api/v1/me/favorites'), ('intelligence', '/api/v1/me/interactions')]:
        call(service, path, token=user)
    call('ingestion', '/api/v1/admin/data-sources', token=admin)
    call('catalog', '/api/v1/admin/places', token=admin)
    call('ingestion', '/api/v1/admin/data-sources', token=user, expected=403)
    for service in SERVICES:
        code = request(GATEWAY, '/api/'+service+'/internal/v1/forbidden', token=admin)[0]
        assert code in [403, 404], 'Gateway exposed internal route'
    print('PASS Identity issuer -> six services; role and internal boundaries', flush=True)

    categories = call('catalog', '/api/v1/categories')['items']
    category = categories[0]['id']
    preferences = call('identity', '/api/v1/me/preferences', token=user)
    preferences_body = {k: v for k, v in preferences.items() if k != 'version'}
    preferences_body.update(category_ids=[category], personalization_enabled=True)
    # Contract method discovered rather than inventing a second route.
    api = json.loads((ROOT / 'backend/contracts/openapi/identity.yaml').read_text(encoding='utf-8'))
    preference_method = next(m for m in ['put', 'patch'] if m in api['paths']['/api/v1/me/preferences'])
    call('identity', '/api/v1/me/preferences', preference_method.upper(), preferences_body, user, version=preferences['version'], key=run_id)
    place_body = dict(name='P02 integration '+run_id, latitude=10.762622, longitude=106.660172,
        category_ids=[category], tag_ids=[], amenity_ids=[], geographic_unit_id='10000000-0000-0000-0000-000000000002',
        destination_ids=[], price=10000, currency='VND', opening_hours=[], media_keys=[])
    place = call('catalog', '/api/v1/admin/places', 'POST', place_body, admin, expected=201, key=run_id)
    place_id = place['place_id']
    place = call('catalog', '/api/v1/admin/places/'+place_id+'/status', 'PUT', {'status': 'PUBLISHED'}, admin, version=place['version'])
    call('catalog', '/api/v1/places/'+place_id)
    review = call('community', '/api/v1/places/'+place_id+'/reviews', 'POST',
                  {'rating': 5, 'content': 'P02 integration rating', 'media_keys': []}, user, expected=201, key=run_id)
    call('community', '/api/v1/admin/reviews/'+review['review_id']+'/moderate', 'POST',
         {'action': 'APPROVE', 'reason': 'Integration verification'}, admin, expected=202, version=review['version'])
    eventually(lambda: internal('community', '/internal/v1/ratings/batch', 'POST', {'ids': [place_id]}, ['community:ratings:read']),
               lambda v: bool(v['items']) and v['items'][0].get('review_count', v['items'][0].get('count', 0)) == 1,
               'review moderation -> real rating summary')
    eventually(lambda: diagnostic_sql('catalog', "SELECT review_count FROM catalog.place_rating_summary WHERE place_id='"+place_id+"'"),
               lambda value: value == '1', 'Community rating event -> Catalog persisted summary')
    internal('intelligence', '/internal/v1/features/rebuild', 'POST', {})
    recommendations = eventually(lambda: call('intelligence', '/api/v1/recommendations', 'POST',
                                  {'topN': 50, 'currency': 'VND'}, user),
                                  lambda v: any(i['place_id'] == place_id for i in v['items']),
                                  'Catalog + preferences + ratings -> real recommendations')
    trip = call('trip', '/api/v1/me/trips', 'POST', {'name': 'P02 '+run_id, 'start_date': '2026-11-01',
                'end_date': '2026-11-02', 'timezone': 'Asia/Ho_Chi_Minh', 'currency': 'VND', 'budget': 1000000}, user, expected=201)
    trip_path = '/api/v1/trips/'+trip['trip_id']
    day = call('trip', trip_path+'/days', 'POST', {'date': '2026-11-01'}, user, expected=201, version=trip['version'])
    trip = call('trip', trip_path, token=user)
    item_body = {'place_id': place_id, 'note': 'Selected recommendation', 'duration_minutes': 60,
                 'locked': True, 'recommendation_request_id': recommendations['request_id']}
    item = call('trip', trip_path+'/days/'+day['day_id']+'/items', 'POST', item_body, user,
                expected=201, version=trip['version'], key=run_id)
    assert item['locked'] is True and item['snapshot']['place_id'] == place_id
    call('trip', trip_path, token=other, expected=404)
    eventually(lambda: diagnostic_sql('intelligence', "SELECT count(*) FROM intelligence.interactions WHERE event_type='TRIP_ITEM_ADDED' AND context->>'item_id'='"+item['item_id']+"'"),
               lambda v: v=='1',
               'recommendation -> Trip item -> Intelligence history')
    eventually(lambda: call('identity', '/api/v1/me/notifications', token=user),
               lambda v: bool(v['items']), 'real domain event -> Identity notification')

    source = call('ingestion', '/api/v1/admin/data-sources', 'POST',
                  {'name': 'P02 source '+run_id, 'uri': 'http://source-sandbox:8080/records?run='+run_id,
                   'secret_reference': 'none', 'license_version': 'synthetic-p02-v1',
                   'allow_storage': True, 'allow_training': True}, admin, expected=201)
    source_id = source['source_id']
    jobs = []
    for mode in ['FULL', 'REPLAY']:
        job = call('ingestion', '/api/v1/admin/data-sources/'+source_id+'/import-jobs', 'POST',
                   {'mode': mode}, admin, expected=202, key=run_id+'-'+mode)
        job_path = '/api/v1/admin/import-jobs/'+job['job_id']
        def settle_job():
            current = call('ingestion', job_path, token=admin)
            if current['status'] in ['RUNNING', 'QUEUED']:
                items = call('ingestion', job_path+'/items', token=admin)['items']
                for row in items:
                    if row['status'] == 'NEEDS_REVIEW':
                        call('ingestion', '/api/v1/admin/import-items/'+row['item_id']+'/decision', 'POST',
                             {'action': 'CREATE', 'place_id': None, 'reason': 'P02 synthetic source'}, admin, expected=200, version=row['version'])
            return current
        eventually(settle_job, lambda v: v['status'] == 'SUCCEEDED', 'source '+mode+' -> Catalog commit -> import ack', seconds=45)
        jobs.append(call('ingestion', job_path+'/items', token=admin)['items'])
    first_ids = {i['proposed_place_id'] for i in jobs[0] if i.get('proposed_place_id')}
    second_ids = {i['proposed_place_id'] for i in jobs[1] if i.get('proposed_place_id')}
    assert first_ids and first_ids == second_ids, 'Replay duplicated imported place'
    print('PASS import replay preserves real Catalog place IDs', flush=True)

    call('identity', '/api/v1/auth/logout', 'POST', {'refresh_token': SESSIONS['u2']['refresh_token']}, other, expected=204)
    call('trip', '/api/v1/me/trips', token=other, expected=401)
    print('PASS revoked Identity session rejected by downstream service', flush=True)
    # Dedicated registered account allows repeated smoke without deleting seeded users.
    deletion_flow(run_id)
    queues = broker_request('queues/smarttravel')
    failures = [q['name'] for q in queues if q['name'].endswith('.dlq') and q.get('messages', 0)]
    assert not failures, 'Unexpected dead letters: '+', '.join(failures)
    report = {'status': 'PASS', 'timestamp': datetime.now(timezone.utc).isoformat(), 'correlation_id': TRACE,
              'services': SERVICES, 'requests': EVIDENCE, 'providers': {'email': 'Mailpit sandbox',
              'source': 'licensed synthetic sandbox', 'routing': 'application fallback'}, 'unexpected_dlq': failures}
    (LOCAL / 'smoke-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print('PASS P02 core integration; evidence backend/infra/.local/p02/smoke-report.json', flush=True)


def deletion_flow(run_id,before_poll=None):
    import urllib.request
    password = prepare()['IDENTITY_FIXTURE_PASSWORD']
    email = 'p02-'+run_id+'@example.invalid'
    call('identity', '/api/v1/auth/register', 'POST', {'email': email, 'password': password, 'display_name': 'P02 deletion'}, expected=202, key=run_id)
    def verification_mail():
        with urllib.request.urlopen('http://127.0.0.1:59025/api/v1/messages', timeout=5) as response:
            return json.load(response).get('messages', [])
    mail = eventually(verification_mail,
                      lambda messages: any(email in json.dumps(m) for m in messages), 'real SMTP verification mail')
    message = next(m for m in mail if email in json.dumps(m))
    with urllib.request.urlopen('http://127.0.0.1:59025/api/v1/message/'+message['ID'], timeout=5) as response:
        content = json.load(response)
    matches = re.findall(r'[A-Za-z0-9_-]{32,}', content.get('Text', ''))
    assert matches, 'Verification token not found in sandbox mail'
    call('identity', '/api/v1/auth/verify-email', 'POST', {'token': matches[-1]}, key=run_id, expected=202)
    session = call('identity', '/api/v1/auth/login', 'POST', {'email': email, 'password': password})
    deletion = call('identity', '/api/v1/me/deletion-requests', 'POST', {'policy_version': 1},
                    session['access_token'], expected=202, key=run_id)
    request_id = deletion.get('request_id')
    if before_poll:
        before_poll(request_id)
    eventually(lambda: internal('identity', '/internal/v1/deletion-requests/'+request_id,
                                  scopes=['identity:deletion:read']),
               lambda value: value['status'] == 'COMPLETED', 'real deletion -> five service ack + Identity local ack')
    call('trip', '/api/v1/me/trips', token=session['access_token'], expected=401)


if __name__ == '__main__':
    smoke()
