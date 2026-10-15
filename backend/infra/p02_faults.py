"""Actual connected runtime recovery tests; stops/restarts only P02-owned apps."""
import json
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from p02 import compose, wait_ready, broker_request, LOCAL, PORTS, request, workload
from p02_smoke import call, login, eventually, diagnostic_sql, deletion_flow, internal


def replay(event):
    result=broker_request('exchanges/smarttravel/'+event['producer']+'.events/publish',
        {'routing_key':event['event_type'],'properties':{'content_type':'application/json','delivery_mode':2},
         'payload':json.dumps(event),'payload_encoding':'string'},'POST')
    assert result['routed']


def concurrent_rebuild():
    code, body, _ = request('http://127.0.0.1:'+str(PORTS['intelligence']),
        '/internal/v1/features/rebuild', 'POST', {},
        workload('platform-integration', 'intelligence', ['intelligence:internal']))
    # Changed source fingerprint rolls back the snapshot; retry after the source settles.
    assert code == 200 or (code == 400 and body['code'] == 'SNAPSHOT_WATERMARK_CHANGED'), body.get('code')
    if code != 200:
        internal('intelligence', '/internal/v1/features/rebuild', 'POST', {})


def faults():
    run_id=str(uuid.uuid4());admin,user=login('admin'),login('u1')
    ids=diagnostic_sql('catalog',"SELECT place_id FROM catalog.places WHERE name_vi LIKE 'P02 source %' AND coalesce((field_precedence->>'price_min')::int,0)<3 ORDER BY created_at DESC LIMIT 1")
    assert ids;place_id=ids
    catalog=call('catalog','/api/v1/admin/places/'+place_id,token=admin)
    if catalog['status']!='PUBLISHED':
        catalog=call('catalog','/api/v1/admin/places/'+place_id+'/status','PUT',{'status':'PUBLISHED'},admin,version=catalog['version'])
    contribution=call('community','/api/v1/contributions','POST',
        {'type':'EDIT','target_id':place_id,'expected_version':catalog['version'],'fields':{'price':12345}},user,expected=201,key=run_id)
    call('community','/api/v1/admin/contributions/'+contribution['contribution_id']+'/moderate','POST',
        {'action':'APPROVE','reason':'Connected contribution test'},admin,expected=202,version=contribution['version'])
    eventually(lambda:call('community','/api/v1/me/contributions',token=user),
        lambda p:any(c['contribution_id']==contribution['contribution_id'] and c['status']=='APPLIED' for c in p['items']),
        'Community contribution -> Catalog change -> result ack')
    # Redeliver actual persisted producer event, preserving the same event ID.
    payload=diagnostic_sql('trip',"SELECT payload FROM trip.outbox_events WHERE event_type='trip.item.added.v1' ORDER BY occurred_at DESC LIMIT 1")
    event=json.loads(payload);item_id=event['payload']['item_id']
    before=diagnostic_sql('intelligence',"SELECT count(*) FROM intelligence.interactions WHERE context->>'item_id'='"+item_id+"'")
    replay(event);replay(event)
    eventually(lambda:diagnostic_sql('intelligence',"SELECT count(*) FROM intelligence.inbox_events WHERE event_id='"+event['event_id']+"'"),lambda v:v=='1','duplicate real event inbox dedup')
    assert diagnostic_sql('intelligence',"SELECT count(*) FROM intelligence.interactions WHERE context->>'item_id'='"+item_id+"'")==before
    # A newer hidden projection cannot be undone by an old published event.
    previous=diagnostic_sql('catalog',"SELECT payload FROM catalog.outbox_events WHERE event_type='catalog.place.upserted.v1' AND aggregate_id='"+place_id+"' ORDER BY aggregate_version DESC LIMIT 1")
    old=json.loads(previous);catalog=call('catalog','/api/v1/admin/places/'+place_id,token=admin)
    hidden=call('catalog','/api/v1/admin/places/'+place_id+'/status','PUT',{'status':'HIDDEN'},admin,version=catalog['version'])
    eventually(lambda:diagnostic_sql('intelligence',"SELECT status FROM intelligence.place_features WHERE place_id='"+place_id+"'"),lambda v:v=='HIDDEN','Catalog visibility delta')
    replay(old)
    assert diagnostic_sql('intelligence',"SELECT status FROM intelligence.place_features WHERE place_id='"+place_id+"'")=='HIDDEN'
    call('catalog','/api/v1/places/'+place_id,expected=404)
    call('community','/api/v1/places/'+place_id+'/reviews','POST',{'rating':4,'content':'Hidden place','media_keys':[]},user,expected=422,key=run_id+'hidden')
    restored=call('catalog','/api/v1/admin/places/'+place_id+'/status','PUT',{'status':'PUBLISHED'},admin,version=hidden['version'])
    # Crash downstream after source DB commit; persistent outbox/inbox must recover.
    compose('stop','intelligence')
    try:
        changed=call('catalog','/api/v1/admin/places/'+place_id,'PATCH',{'price':23456},admin,version=restored['version'])
        code,body,_=request('http://127.0.0.1:58080','/api/intelligence/api/v1/recommendations','POST',{'topN':1,'currency':'VND'},user)
        assert code in [502,504] and body['code'] in ['UPSTREAM_ERROR','GATEWAY_TIMEOUT'], 'Outage must fail explicitly'
    finally:
        compose('up','-d','intelligence');wait_ready()
    eventually(lambda:diagnostic_sql('intelligence',"SELECT catalog_version FROM intelligence.place_features WHERE place_id='"+place_id+"'"),lambda v:v==str(changed['version']),'crash after upstream DB commit -> durable projection recovery')
    # Snapshot and delta may arrive in either order; the latest source version wins.
    with ThreadPoolExecutor(max_workers=1) as executor:
        bootstrap=executor.submit(concurrent_rebuild)
        concurrent=call('catalog','/api/v1/admin/places/'+place_id,'PATCH',{'price':34567},admin,version=changed['version'])
        bootstrap.result(timeout=60)
    eventually(lambda:diagnostic_sql('intelligence',"SELECT catalog_version FROM intelligence.place_features WHERE place_id='"+place_id+"'"),lambda v:v==str(concurrent['version']),'concurrent snapshot plus delta retains final Catalog version')
    replay(old)
    internal('intelligence','/internal/v1/features/rebuild','POST',{})
    assert diagnostic_sql('intelligence',"SELECT catalog_version FROM intelligence.place_features WHERE place_id='"+place_id+"'")==str(concurrent['version'])
    # Missing remote ack is observable; restart must complete the same deletion.
    compose('stop','trip')
    try:
        from p02_smoke import deletion_flow as complete_deletion
        def pending_then_resume(request_id):
            time.sleep(3)
            status=internal('identity','/internal/v1/deletion-requests/'+request_id,scopes=['identity:deletion:read'])
            assert status['status']!='COMPLETED','Deletion completed despite missing Trip ack'
            print('PASS deletion remains pending while Trip ack missing',flush=True)
            compose('up','-d','trip')
        complete_deletion(run_id,before_poll=pending_then_resume)
    finally:
        compose('up','-d','trip');wait_ready()
    report={'status':'PASS','cases':['contribution-command-result','duplicate-event','stale-visibility','hidden-place',
        'consumer-crash-after-source-commit','downstream-outage','snapshot-concurrent-delta','delayed-deletion-ack']}
    (LOCAL/'fault-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print('PASS actual connected recovery tests',flush=True)


if __name__=='__main__':faults()
