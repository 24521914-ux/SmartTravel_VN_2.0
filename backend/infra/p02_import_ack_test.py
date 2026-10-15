"""Catalog commit with acknowledgement outage: original import command retries safely."""
import json
import time
import uuid
from p02 import LOCAL, broker_request
from p02_faults import replay
from p02_smoke import call, diagnostic_sql, eventually, login


def import_ack():
    admin, run_id = login('admin'), str(uuid.uuid4())
    source = call('ingestion', '/api/v1/admin/data-sources', 'POST',
        {'name': 'P02 ack '+run_id, 'uri': 'http://source-sandbox:8080/records?run='+run_id,
         'secret_reference': 'none', 'license_version': 'synthetic-p02-ack-v1',
         'allow_storage': True, 'allow_training': True}, admin, expected=201)
    permissions = broker_request('topic-permissions/smarttravel/catalog_runtime')
    permission = next(row for row in permissions if row['exchange'] == 'catalog.events')
    restore = {key: permission[key] for key in ['exchange', 'write', 'read']}
    broker_request('topic-permissions/smarttravel/catalog_runtime',
        dict(restore, write='^$'), 'PUT')
    try:
        job = call('ingestion', '/api/v1/admin/data-sources/'+source['source_id']+'/import-jobs',
            'POST', {'mode': 'FULL'}, admin, expected=202, key=run_id)
        path = '/api/v1/admin/import-jobs/'+job['job_id']
        def committed():
            items = call('ingestion', path+'/items', token=admin)['items']
            for row in items:
                if row['status'] == 'NEEDS_REVIEW':
                    call('ingestion', '/api/v1/admin/import-items/'+row['item_id']+'/decision', 'POST',
                        {'action': 'CREATE', 'place_id': None, 'reason': 'P02 ack outage'}, admin,
                        version=row['version'])
            return diagnostic_sql('catalog', "SELECT place_id||':'||version FROM catalog.places WHERE name_vi='P02 source "+run_id+"'")
        state = eventually(committed, lambda value: bool(value), 'Catalog commits import while acknowledgement publishing is unavailable', seconds=45)
        assert call('ingestion', path, token=admin)['status'] != 'SUCCEEDED'
        payload = diagnostic_sql('ingestion', "SELECT payload FROM ingestion.outbox_events WHERE event_type='ingestion.place.upsert-requested.v1' AND payload->'payload'->>'source_id'='"+source['source_id']+"' ORDER BY occurred_at DESC LIMIT 1")
        event = json.loads(payload)
        replay(event)
        time.sleep(2)
        assert committed() == state, 'Command redelivery duplicated or updated committed place'
        assert diagnostic_sql('catalog', "SELECT count(*) FROM catalog.inbox_events WHERE event_id='"+event['event_id']+"'") == '1'
    finally:
        broker_request('topic-permissions/smarttravel/catalog_runtime', restore, 'PUT')
    eventually(lambda: call('ingestion', path, token=admin), lambda value: value['status'] == 'SUCCEEDED',
        'durable acknowledgement retry completes the original import job', seconds=45)
    assert committed() == state
    (LOCAL/'import-ack-report.json').write_text(json.dumps({'status': 'PASS',
        'cases': ['catalog-commit-with-ack-outage', 'original-command-dedup', 'unchanged-place-version',
                  'durable-result-retry']}, indent=2), encoding='utf-8')
    print('PASS connected import commit, missing acknowledgement and safe retry', flush=True)


if __name__ == '__main__':
    import_ack()
