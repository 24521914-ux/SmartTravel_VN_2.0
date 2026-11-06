"""Real non-AI recovery exercises on P02. Requires explicit outage opt-in.

Only synthetic records are mutated. Every stopped service is restarted in a
finally block. This script never invokes recommendation, model or AI rebuild APIs.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import uuid
from contextlib import contextmanager

import p02
import p02_smoke as http
from p02_faults import replay
from p03_candidate import ROOT, candidate_manifest

OUTPUT = Path(__file__).resolve().parent / '.local/p03/resilience-report.json'


def recovery_item_body(place_id):
    return {'place_id': place_id, 'note': 'Saved place for Catalog recovery probe'}


def wait_for_catalog_read(path, token, place_id, probe=p02.request, poll=http.eventually):
    """Observe recovery through Community's actual Catalog client, using GET only."""
    def read():
        status, data, _ = probe(http.GATEWAY, '/api/community' + path, 'GET',
                                token=token, headers={'X-Correlation-ID': http.TRACE})
        assert status in {200, 503, 504}, 'Unexpected recovery probe status: ' + str(status)
        http.EVIDENCE.append({'service': 'community', 'method': 'GET', 'path': path,
                              'status': status, 'purpose': 'catalog-path-recovery'})
        if status == 200:
            assert any(row.get('place_id') == place_id for row in data.get('items', [])), 'Recovery collection lost its saved place'
        return status
    return poll(read, lambda status: status == 200,
                'Community Catalog read path recovers after restart', seconds=30)


@contextmanager
def disrupted(disrupt, service, action='stop', ready=p02.wait_ready):
    """Restore even when the disruption command partially succeeds then fails."""
    try:
        disrupt(action, service)
        yield
    finally:
        disrupt('start', service)
        ready()


@contextmanager
def paused(service, compose=p02.compose):
    try:
        compose('pause', service)
        yield
    finally:
        compose('unpause', service)


def resume_existing(service, compose=p02.compose):
    """Recover the stopped container without reapplying its dependency configuration."""
    compose('start', '--wait', '--wait-timeout', '120', service)


def mongo(expression):
    """Read-only operator diagnostics, authentication stays inside container env."""
    script = ("assert(db.getSiblingDB('admin').auth('community_admin',process.env.MONGO_INITDB_ROOT_PASSWORD));"
              "const c=db.getSiblingDB('community_db');print(JSON.stringify(" + expression + '));')
    result = p02.compose('exec', '-T', 'community-db', 'mongosh', '--quiet', '--eval', script)
    def normalize(value):
        if isinstance(value, dict):
            if set(value) == {'high', 'low', 'unsigned'}:
                number = (value['high'] << 32) + (value['low'] & 0xffffffff)
                return number & ((1 << 64) - 1) if value['unsigned'] else number
            return {key: normalize(item) for key, item in value.items()}
        if isinstance(value, list):
            return [normalize(item) for item in value]
        return value
    return normalize(json.loads(result.stdout.strip().splitlines()[-1]))


def run(release_id, output=OUTPUT):
    before = candidate_manifest()['sha256']
    http.EVIDENCE.clear()
    http.TRACE = str(uuid.uuid4())
    checks, disruptions = [], []
    run_id = str(uuid.uuid4())

    def mark(name, assertion):
        checks.append({'id': name, 'status': 'PASS', 'assertion': assertion,
                       'evidence': [output.resolve().as_posix() + '#requests', output.resolve().as_posix() + '#disruptions'],
                       'correlation_id': http.TRACE})
        print('PASS non-AI resilience ' + name, flush=True)

    def disrupt(action, service):
        disruptions.append({'action': action, 'service': service, 'timestamp': datetime.now(timezone.utc).isoformat()})
        if action == 'kill':
            p02.compose('kill', '-s', 'SIGKILL', service)
        elif action == 'start':
            resume_existing(service)
            assert p02.compose('ps', '-q', 'identity').stdout.strip() == identity_container, \
                'Fault recovery unexpectedly replaced Identity outside the disruption scope'
        else:
            p02.compose(action, service)

    def projection(place):
        return mongo('c.place_visibility_projections.findOne({_id:' + json.dumps(place) + '})')

    sql, eventually = http.diagnostic_sql, http.eventually
    def call(service, path, method='GET', body=None, token=None, expected=200, version=None, key=None):
        if method in {'POST', 'PUT', 'PATCH'} and key is None:
            key = str(uuid.uuid4())
        return http.call(service, path, method, body, token, expected, version, key)
    try:
        identity_container = p02.compose('ps', '-q', 'identity').stdout.strip()
        assert identity_container, 'Identity container must exist before recovery exercises'
        admin, user = http.login('admin'), http.login('u1')
        category = call('catalog', '/api/v1/categories')['items'][0]['id']
        place = call('catalog', '/api/v1/admin/places', 'POST', {'name': 'P03 recovery ' + run_id,
                     'latitude': 10.762622, 'longitude': 106.660172, 'category_ids': [category], 'tag_ids': [],
                     'amenity_ids': [], 'geographic_unit_id': '10000000-0000-0000-0000-000000000002',
                     'destination_ids': [], 'price': 10000, 'currency': 'VND', 'opening_hours': [], 'media_keys': []},
                     admin, expected=201)
        place_id = place['place_id']
        path = '/api/v1/admin/places/' + place_id
        place = call('catalog', path + '/status', 'PUT', {'status': 'PUBLISHED'}, admin, version=place['version'])
        eventually(lambda: projection(place_id), lambda value: value and value['source_version'] == place['version'], 'initial Community visibility')
        old = json.loads(sql('catalog', "SELECT payload FROM catalog.outbox_events WHERE aggregate_id='" + place_id +
                             "' AND event_type='catalog.place.upserted.v1' ORDER BY aggregate_version DESC LIMIT 1"))

        with disrupted(disrupt, 'rabbitmq'):
            place = call('catalog', path + '/status', 'PUT', {'status': 'HIDDEN'}, admin, version=place['version'])
            assert int(sql('catalog', "SELECT count(*) FROM catalog.outbox_events WHERE aggregate_id='" + place_id +
                           "' AND aggregate_version=" + str(place['version']) + ' AND published_at IS NULL')) > 0
        eventually(lambda: projection(place_id), lambda value: value and value['source_version'] == place['version'] and value['status'] == 'HIDDEN',
                   'broker recovery publishes durable Catalog outbox', seconds=90)
        eventually(lambda: sql('catalog', "SELECT count(*) FROM catalog.outbox_events WHERE aggregate_id='" + place_id + "' AND published_at IS NULL"),
                   lambda value: value == '0', 'source outbox fully confirmed', seconds=90)
        mark('broker_outage', 'Catalog commits while broker stopped; pending durable outbox later confirmed and Community version converges')

        replay(old)
        replay(old)
        eventually(lambda: p02.broker_request('queues/smarttravel/community.inbox'),
                   lambda value: value.get('messages', 0) == 0, 'stale duplicate delivery consumed')
        state = projection(place_id)
        assert state['status'] == 'HIDDEN' and state['source_version'] == place['version']
        assert mongo('c.inbox_events.countDocuments({event_id:' + json.dumps(old['event_id']) + '})') == 1
        mark('duplicate_out_of_order', 'Redeliver original published event twice after newer hidden version; inbox dedup and newer state preserved')

        with disrupted(disrupt, 'community', action='kill'):
            place = call('catalog', path + '/status', 'PUT', {'status': 'PUBLISHED'}, admin, version=place['version'])
        eventually(lambda: projection(place_id), lambda value: value and value['status'] == 'PUBLISHED' and value['source_version'] == place['version'],
                   'SIGKILL consumer recovers source commit', seconds=60)
        mark('crash_retry', 'Actual SIGKILL of Community consumer followed by restart delivers durable Catalog mutation exactly to latest version')

        with paused('community'):
            for index in range(24):
                place = call('catalog', path, 'PATCH', {'name': 'P03 stalled consumer ' + run_id + str(index)},
                             admin, version=place['version'])
            backlog = eventually(lambda: p02.broker_request('queues/smarttravel/community.inbox'),
                                 lambda value: value.get('messages_ready', 0) > 0,
                                 'stalled consumer durable backlog', seconds=20)
            assert backlog.get('messages_unacknowledged', 0) <= 20, 'Community prefetch/concurrency bound exceeded'
            disruptions.append({'action': 'paused-consumer-backlog', 'service': 'community',
                                'ready': backlog['messages_ready'], 'unacknowledged': backlog.get('messages_unacknowledged', 0),
                                'prefetch_per_consumer': 10, 'max_consumers': 2})
        eventually(lambda: projection(place_id), lambda value: value and value['source_version'] == place['version'],
                   'stalled consumer catches up to latest version', seconds=60)
        eventually(lambda: p02.broker_request('queues/smarttravel/community.inbox'),
                   lambda value: value.get('messages', 0) == 0, 'stalled consumer backlog drained', seconds=60)
        mark('slow_consumer_backpressure', 'Paused real consumer accumulates durable backlog with at most20 unacked, then drains and reaches latest version')

        trip = call('trip', '/api/v1/me/trips', 'POST', {'name': 'P03 snapshot ' + run_id,
                    'start_date': '2026-11-01', 'end_date': '2026-11-01', 'timezone': 'Asia/Ho_Chi_Minh',
                    'currency': 'VND', 'budget': 1000000}, user, expected=201)
        trip_path = '/api/v1/trips/' + trip['trip_id']
        day = call('trip', trip_path + '/days', 'POST', {'date': '2026-11-01'}, user, expected=201, version=trip['version'])
        trip = call('trip', trip_path, token=user)
        item_path = trip_path + '/days/' + day['day_id'] + '/items'
        item = call('trip', item_path, 'POST', {'place_id': place_id, 'note': 'Manual saved snapshot',
                    'duration_minutes': 60, 'locked': True, 'recommendation_request_id': None}, user,
                    expected=201, version=trip['version'], key=run_id)
        collection = call('community', '/api/v1/me/collections', 'POST',
                          {'name': 'P03 recovery probe ' + run_id, 'visibility': 'PRIVATE'},
                          user, expected=201)
        collection_path = '/api/v1/collections/' + collection['collection_id'] + '/items'
        call('community', collection_path, 'POST', recovery_item_body(place_id),
             user, expected=201, version=collection['version'])
        with disrupted(disrupt, 'catalog'):
            read = call('trip', item_path + '/' + item['item_id'], token=user)
            assert read['snapshot'] == item['snapshot'] and read['source_version'] == item['source_version']
            status, error, _ = p02.request(http.GATEWAY, '/api/community/api/v1/me/favorites/' + place_id,
                                         'PUT', token=user)
            assert status in {503, 504}, 'Dependency outage must fail as unavailable or bounded Gateway timeout'
            assert isinstance(error.get('code'), str) and isinstance(error.get('traceId'), str)
            http.EVIDENCE.append({'service': 'community', 'method': 'PUT',
                                  'path': '/api/v1/me/favorites/' + place_id, 'status': status,
                                  'failure_code': error['code']})
        mark('snapshot_read', 'Trip saved item snapshot and source version remain readable unchanged while Catalog unavailable')
        mark('downstream_outage', 'Unavailable Catalog fails explicitly with service503 or bounded Gateway504; downstream restarted in finally')

        wait_for_catalog_read(collection_path, user, place_id)
        review = call('community', '/api/v1/places/' + place_id + '/reviews', 'POST',
                      {'rating': 4, 'content': 'P03 rating convergence', 'media_keys': []}, user, expected=201, key=run_id)
        call('community', '/api/v1/admin/reviews/' + review['review_id'] + '/moderate', 'POST',
             {'action': 'APPROVE', 'reason': 'P03 rating reconciliation'}, admin, expected=202, version=review['version'])
        def reconciled():
            expected = mongo('c.rating_summaries.findOne({_id:' + json.dumps(place_id) + '})')
            actual = sql('catalog', "SELECT review_count||':'||rating_sum||':'||source_version FROM catalog.place_rating_summary WHERE place_id='" + place_id + "'")
            return expected, actual
        eventually(reconciled, lambda pair: pair[0] and pair[0]['count'] == 1 and
                   pair[1] == str(pair[0]['count']) + ':' + str(pair[0]['sum']) + ':' + str(pair[0]['version']),
                   'Community full rating snapshot and Catalog sum/count/version reconcile')
        mark('rating_reconciliation', 'Mongo rating snapshot count/sum/version exactly equals Catalog projection after actual moderation event')

        source = call('ingestion', '/api/v1/admin/data-sources', 'POST', {'name': 'P03 DLQ ' + run_id,
                      'uri': 'http://source-sandbox:8080/records?run=' + run_id, 'secret_reference': 'none',
                      'license_version': 'synthetic-p03-recovery-v1', 'allow_storage': True, 'allow_training': False}, admin, expected=201)
        source_id = source['source_id']
        eventually(lambda: sql('catalog', "SELECT source_version FROM catalog.source_policy_projections WHERE source_id='" + source_id + "'"),
                   lambda value: value == str(source['version']), 'initial storage-only source policy')
        assert p02.broker_request('queues/smarttravel/catalog.dlq')['messages'] == 0
        audit_before = int(sql('catalog', "SELECT count(*) FROM catalog.audit_logs WHERE action='DLQ_REPLAY_REQUESTED'"))
        with disrupted(disrupt, 'catalog-db'):
            revoked = call('ingestion', '/api/v1/admin/data-sources/' + source_id + '/policy', 'PATCH',
                           {'allow_training': False, 'allow_storage': False, 'status': 'REVOKED'}, admin, version=source['version'])
            eventually(lambda: p02.broker_request('queues/smarttravel/catalog.dlq')['messages_ready'],
                       lambda value: value > 0, 'real source-policy event exhausts bounded retry', seconds=60)
        p02.replay_catalog_dlq()
        eventually(lambda: sql('catalog', "SELECT status||':'||source_version FROM catalog.source_policy_projections WHERE source_id='" + source_id + "'"),
                   lambda value: value == 'REVOKED:' + str(revoked['source_version']), 'scoped DLQ replay commits original event')
        eventually(lambda: p02.broker_request('queues/smarttravel/catalog.dlq')['messages_ready'], lambda value: value == 0, 'DLQ drained')
        assert int(sql('catalog', "SELECT count(*) FROM catalog.audit_logs WHERE action='DLQ_REPLAY_REQUESTED'")) > audit_before
        mark('dlq_replay', 'Real storage-policy event reaches DLQ during DB outage, scoped confirmed replay drains DLQ and creates operator audit')
        success, error = True, None
    except Exception as failure:
        success, error = False, type(failure).__name__
        if isinstance(failure, (AssertionError, KeyError)):
            error += ': ' + str(failure)[:500]
        print('FAIL non-AI resilience ' + error, flush=True)
    after = candidate_manifest()['sha256']
    stable = before == after
    if not stable:
        success = False
        error = 'SOURCE_CHANGED_DURING_RUN'
    sources = ['backend/infra/p03_nonai_resilience.py', 'backend/infra/p02.py', 'backend/infra/p02_smoke.py', 'backend/infra/p02_faults.py']
    report = {'scope': 'non-ai', 'release_id': release_id, 'timestamp': datetime.now(timezone.utc).isoformat(),
              'candidate_before_sha256': before, 'candidate_sha256': after,
              'source_hashes': {path: hashlib.sha256((ROOT / path).read_bytes()).hexdigest() for path in sources},
              'pass': success, 'status': 'PASS' if success else 'FAIL', 'source_stable': stable, 'reconciliation_pass': success,
              'checks': checks, 'requests': http.EVIDENCE, 'disruptions': disruptions, 'error': error}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2), encoding='utf-8')
    return 0 if success and before == after else 2


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--release-id', required=True)
    parser.add_argument('--output', type=Path, default=OUTPUT)
    parser.add_argument('--allow-p02-outages', action='store_true', help='Explicitly authorize stops/restarts on the P02 project')
    args = parser.parse_args()
    if not args.allow_p02_outages:
        parser.error('Real resilience run requires --allow-p02-outages')
    return run(args.release_id, args.output)


if __name__ == '__main__':
    raise SystemExit(main())
