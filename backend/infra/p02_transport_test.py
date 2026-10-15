"""Real producer -> bounded retries -> DLQ -> scoped operator replay on P02 only."""
import json
import uuid
from p02 import LOCAL, broker_request, compose, replay_catalog_dlq, topology, wait_ready
from p02_smoke import call, diagnostic_sql, eventually, login


def transport():
    topology()
    admin = login('admin')
    audit_before = int(diagnostic_sql('catalog', "SELECT count(*) FROM catalog.audit_logs WHERE action='DLQ_REPLAY_REQUESTED'"))
    assert broker_request('queues/smarttravel/catalog.dlq')['messages'] == 0
    source = call('ingestion', '/api/v1/admin/data-sources', 'POST',
        {'name': 'P02 recovery '+str(uuid.uuid4()), 'uri': 'http://source-sandbox:8080/records',
         'secret_reference': 'none', 'license_version': 'synthetic-p02-recovery-v1',
         'allow_storage': True, 'allow_training': True}, admin, expected=201)
    source_id = source['source_id']
    eventually(lambda: diagnostic_sql('catalog', "SELECT source_version FROM catalog.source_policy_projections WHERE source_id='"+source_id+"'"),
        lambda value: value == str(source['version']), 'initial source policy reached Catalog')
    compose('stop', 'catalog-db')
    try:
        changed = call('ingestion', '/api/v1/admin/data-sources/'+source_id+'/policy', 'PATCH',
            {'allow_training': False, 'allow_storage': False, 'status': 'REVOKED'},
            admin, version=source['version'])
        eventually(lambda: broker_request('queues/smarttravel/catalog.dlq')['messages_ready'],
            lambda value: value > 0, 'real policy event exhausts retries while Catalog DB is down', seconds=45)
    finally:
        compose('up', '-d', '--wait', 'catalog-db')
        wait_ready()
    replay_catalog_dlq()
    eventually(lambda: diagnostic_sql('catalog', "SELECT status||':'||source_version FROM catalog.source_policy_projections WHERE source_id='"+source_id+"'"),
        lambda value: value == 'REVOKED:'+str(changed['source_version']), 'scoped operator replay commits original policy event')
    eventually(lambda: broker_request('queues/smarttravel/catalog.dlq')['messages_ready'],
        lambda value: value == 0, 'DLQ drained after confirmed replay')
    assert int(diagnostic_sql('catalog', "SELECT count(*) FROM catalog.audit_logs WHERE action='DLQ_REPLAY_REQUESTED'")) > audit_before
    (LOCAL/'transport-report.json').write_text(json.dumps({'status': 'PASS',
        'cases': ['real-producer-bounded-retry', 'durable-dlq', 'scoped-confirmed-replay', 'operator-audit']}, indent=2), encoding='utf-8')
    print('PASS connected bounded retry, DLQ and operator replay', flush=True)


if __name__ == '__main__':
    transport()
