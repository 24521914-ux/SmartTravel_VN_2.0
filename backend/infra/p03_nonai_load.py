"""P03 measured non-AI load. Seed ONLY a verified dedicated isolated environment.

All generated accounts/data are synthetic. No recommendation/model endpoint is used.
"""
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import threading
import time

from p02 import request, ROOT
from p03_candidate import candidate_manifest
from p03_verify import percentile, archive_report


def traffic_class(slot):
    # Exact 10/16, 3/16, 3/16 allocation with writes distributed over the cycle.
    return ('authenticated_write' if slot % 16 in (3, 8, 13) else
            'trip_read' if slot % 16 in (4, 9, 14) else 'catalog_read')


def validate_project(project):
    if not re.fullmatch(r'smarttravel-p03-load-[0-9a-f]{8,32}', project):
        raise ValueError('Only dedicated smarttravel-p03-load-<randomhex> projects accepted')


def validate_mounts(project, containers):
    validate_project(project)
    if not containers:
        raise ValueError('No running dedicated environment')
    for item in containers:
        if item.get('Config', {}).get('Labels', {}).get('com.docker.compose.project') != project:
            raise ValueError('Container project does not match isolated target')
        for mount in item.get('Mounts', []):
            if not mount.get('RW', True):
                continue
            if mount.get('Type') != 'volume' or not mount.get('Name', '').startswith(project + '_'):
                raise ValueError('Writable mount is outside dedicated project')


class Environment:
    def __init__(self, compose_file, project):
        validate_project(project)
        self.project = project
        self.file = Path(compose_file).resolve()
        self.secrets = json.loads((self.file.parent / 'secrets.json').read_text())

    def compose(self, *args, source=None):
        result = subprocess.run(['docker', 'compose', '-p', self.project, '-f', str(self.file), *args],
                                input=source, text=True, capture_output=True, encoding='utf-8',
                                env=dict(os.environ,**self.secrets))
        if result.returncode:
            # Compose environments contain secrets. Never echo raw configuration or SQL.
            raise RuntimeError('Dedicated environment command failed: ' + ' '.join(args[:4]))
        return result.stdout.strip()

    def safe(self):
        ids = self.compose('ps', '-q').split()
        if not ids:
            raise ValueError('Dedicated stack is not running')
        result = subprocess.run(['docker', 'inspect', *ids], capture_output=True, text=True,
                                encoding='utf-8', check=True)
        validate_mounts(self.project, json.loads(result.stdout))

    def sql(self, service, statement):
        return self.compose('exec', '-T', service+'-db', 'psql', '-U', service+'_admin',
                            '-d', service+'_db', '-At', '-v', 'ON_ERROR_STOP=1', source=statement)

    def mongo(self, script):
        return self.compose('exec', '-T', 'community-db', 'mongosh', '--quiet', '--eval',
            "assert(db.getSiblingDB('admin').auth('community_admin',process.env.MONGO_INITDB_ROOT_PASSWORD));"
            "const c=db.getSiblingDB('community_db');" + script)


def seed(env):
    env.safe()
    # Clone only the isolated environment's synthetic fixture password hash.
    env.sql('identity', """BEGIN;
INSERT INTO identity.users(user_id,email,password_hash,display_name,status,email_verified_at)
SELECT ('a1000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
       'p03-load-'||i||'@example.invalid',password_hash,'P03 synthetic load '||i,'ACTIVE',now()
FROM generate_series(1,2000) i CROSS JOIN
 (SELECT password_hash FROM identity.users WHERE email='fixture-u1@example.invalid') f
ON CONFLICT DO NOTHING;
INSERT INTO identity.user_roles(user_id,role_code)
SELECT user_id,'USER' FROM identity.users WHERE email LIKE 'p03-load-%@example.invalid' ON CONFLICT DO NOTHING;
INSERT INTO identity.user_preferences(user_id,personalization_enabled)
SELECT user_id,false FROM identity.users WHERE email LIKE 'p03-load-%@example.invalid' ON CONFLICT DO NOTHING;
COMMIT;
""")
    env.sql('catalog', """
INSERT INTO catalog.places(place_id,geographic_unit_id,name_vi,address,location,status,price_min,price_max)
SELECT ('a2000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,g.geographic_unit_id,
 'P03 synthetic place '||i,'Synthetic test address '||i,
 ST_SetSRID(ST_MakePoint(106.0+(i%100)*0.001,10.0+(i/100)*0.001),4326)::geography,
 'PUBLISHED',(i%5)*10000,(i%5+1)*10000 FROM generate_series(1,10000) i
CROSS JOIN (SELECT geographic_unit_id FROM catalog.geographic_units WHERE status='ACTIVE' LIMIT 1) g
ON CONFLICT DO NOTHING;
ANALYZE catalog.places;
""")
    env.sql('trip', """
INSERT INTO trip.trips(trip_id,user_id,title,start_date,end_date)
SELECT ('a3000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 ('a1000000-0000-4000-8000-'||lpad((((i-1)%50)+1)::text,12,'0'))::uuid,
 'P03 synthetic trip '||i,current_date,current_date+2 FROM generate_series(1,1000) i
ON CONFLICT DO NOTHING;
ANALYZE trip.trips;
""")
    env.mongo("""
function ident(prefix,n){return prefix+'-0000-4000-8000-'+String(n).padStart(12,'0');}
for(let batch=0;batch<20;batch++){
 const ops=[];
 for(let j=1;j<=1000;j++){const i=batch*1000+j;const id=ident('a4000000',i);
 ops.push({updateOne:{filter:{_id:id},update:{$setOnInsert:{_id:id,
 user_id:ident('a1000000',(((i-1)%2000)+Math.floor((i-1)/10000))%2000+1),place_id:ident('a2000000',((i-1)%10000)+1),
 rating:NumberInt((i%5)+1),content:'Synthetic P03 load review '+i,status:'APPROVED',
 version:NumberLong(1),created_at:new Date(),updated_at:new Date()}},upsert:true}});}
 c.reviews.bulkWrite(ops);
}
print(c.reviews.countDocuments({}));
""")
    return counts(env)


def counts(env):
    return {**{name: int(env.sql(service, 'SELECT count(*) FROM '+table+';').splitlines()[-1])
               for name, service, table in [('users','identity','identity.users'),
                    ('places','catalog','catalog.places'),('trips','trip','trip.trips')]},
            'reviews': int(env.mongo('print(c.reviews.countDocuments({}));').splitlines()[-1])}


def summarize(samples):
    errors = sum(not 200 <= code < 300 for code, ms in samples)
    return {'requests': len(samples), 'errors': errors, 'error_rate': errors / len(samples) if samples else None,
            'status_counts': dict(Counter(str(code) for code, ms in samples)),
            'p95_ms': percentile([ms for code, ms in samples])}


def diagnostics(env):
    """Read-only SQL plans and current connections; never a saturation assertion."""
    env.safe()
    queries = {
        'catalog_page': ('catalog', "SELECT p.place_id,p.name_vi,p.address,p.status,p.version,p.price_min,p.price_max,p.currency,r.rating_avg,r.review_count,ST_Y(location::geometry) lat,ST_X(location::geometry) lon FROM catalog.places p LEFT JOIN catalog.place_rating_summary r USING(place_id) WHERE p.status='PUBLISHED' ORDER BY p.place_id LIMIT 21"),
        'trip_owner_page': ('trip', "SELECT * FROM trip.trips WHERE user_id='a1000000-0000-4000-8000-000000000001' AND deleted_at IS NULL ORDER BY updated_at DESC,trip_id LIMIT 21"),
        'identity_profile': ('identity', "SELECT user_id,display_name,status,version FROM identity.users WHERE user_id='a1000000-0000-4000-8000-000000000001'")}
    plans = {}
    for name,(service,query) in queries.items():
        raw = env.sql(service,"BEGIN READ ONLY; SET LOCAL statement_timeout=5000; EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) "+query+'; ROLLBACK;')
        start,end = raw.find('['),raw.rfind(']')
        plans[name] = json.loads(raw[start:end+1])
    pools = {}
    for service in ('catalog','trip','identity','ingestion'):
        query = ("SELECT json_build_object('postgres_max_connections',current_setting('max_connections')::int,"
                 "'runtime_connections',count(*) FILTER (WHERE usename='"+service+"_runtime'),"
                 "'runtime_active',count(*) FILTER (WHERE usename='"+service+"_runtime' AND state='active'),"
                 "'waiting_runtime',count(*) FILTER (WHERE usename='"+service+"_runtime' AND wait_event_type IS NOT NULL)) "
                 "FROM pg_stat_activity WHERE datname=current_database();")
        pools[service] = json.loads(env.sql(service,query).splitlines()[-1])
    return {'dataset_counts':counts(env),'explain_analyze':plans,'pool_observations':pools,
            'scope':'non-ai','ai_endpoints_called':0,
            'limitations':['Read-only current connection observations; not a pool saturation test. Request queue/backpressure metrics are recorded by the paced load runner.']}


def load(env, gateway, duration):
    env.safe()
    expected_binding = gateway.removeprefix('http://')
    if env.compose('port', 'gateway', '8080') != expected_binding:
        raise ValueError('Gateway binding does not belong to dedicated target project')
    dataset = counts(env)
    actors = []
    for i in range(1, 51):
        code, session, _ = request(gateway, '/api/identity/api/v1/auth/login', 'POST',
            {'email':f'p03-load-{i}@example.invalid', 'password':env.secrets['IDENTITY_FIXTURE_PASSWORD']})
        if code != 200:
            raise RuntimeError('Isolated synthetic principal login failed')
        token = session['access_token']
        code, profile, _ = request(gateway, '/api/identity/api/v1/me', token=token)
        if code != 200:
            raise RuntimeError('Isolated synthetic profile lookup failed')
        actors.append({'token':token,'profile':profile,'original':profile['display_name'],'lock':threading.Lock()})
    if len({actor['profile']['user_id'] for actor in actors}) != 50:
        raise RuntimeError('Distinct principal requirement failed')
    samples = {name:[] for name in ('catalog_read','trip_read','authenticated_write')}
    active = peak = completed = pending_peak = skipped = 0
    capacity = threading.BoundedSemaphore(50)
    queue_delays = []
    achieved = set()
    guard = threading.Lock()

    def worker(slot):
        nonlocal active, peak, completed
        actor = actors[slot % 50]
        kind = traffic_class(slot)
        with guard:
            active += 1
            peak = max(peak, active)
            achieved.add(slot % 50)
        scheduled = started + slot / 20
        queue_delay = max(0,(time.monotonic()-scheduled)*1000)
        try:
            if kind == 'authenticated_write':
                with actor['lock']:
                    code, profile, _ = request(gateway, '/api/identity/api/v1/me', 'PATCH',
                        {'display_name':f'P03 measured load {slot}'}, actor['token'],
                        {'If-Match':'"'+str(actor['profile']['version'])+'"'})
                    if code == 200:
                        actor['profile'] = profile
            else:
                path = '/api/catalog/api/v1/places?limit=20' if kind == 'catalog_read' else '/api/trip/api/v1/me/trips'
                code, _, _ = request(gateway, path, token=actor['token'])
        except (OSError, ValueError):
            code = 0
        finally:
            elapsed = (time.monotonic()-scheduled)*1000
            with guard:
                samples[kind].append((code, elapsed))
                queue_delays.append(queue_delay)
                completed += 1
                active -= 1
            capacity.release()

    started = time.monotonic()
    futures = []
    restored = True
    try:
        with ThreadPoolExecutor(max_workers=50) as pool:
            for slot in range(round(duration*20)):
                delay = started+slot/20-time.monotonic()
                if delay > 0:
                    time.sleep(delay)
                if time.monotonic() >= started+duration or not capacity.acquire(blocking=False):
                    skipped += 1
                    continue
                futures.append(pool.submit(worker, slot))
                with guard:
                    pending_peak = max(pending_peak,len(futures)-completed)
            for future in futures:
                future.result()
        elapsed = max(duration,time.monotonic()-started)
    finally:
        for actor in actors:
            try:
                code, latest, _ = request(gateway, '/api/identity/api/v1/me', token=actor['token'])
                if code == 200:
                    code, _, _ = request(gateway, '/api/identity/api/v1/me', 'PATCH',
                        {'display_name':actor['original']}, actor['token'],
                        {'If-Match':'"'+str(latest['version'])+'"'})
                restored = restored and code == 200
            except (OSError, ValueError):
                restored = False
    classes = {kind:summarize(values) for kind,values in samples.items()}
    for kind, metric in classes.items():
        metric['pass'] = bool(metric['requests']) and metric['errors'] == 0 and metric['p95_ms'] <= (800 if kind == 'authenticated_write' else 500)
    measured = summarize([sample for values in samples.values() for sample in values])
    measured.update(elapsed_seconds=elapsed,actual_rps=measured['requests']/elapsed,
        achieved_virtual_users=len(achieved),peak_inflight_requests=peak,skipped_slots=skipped)
    reasons = []
    if skipped: reasons.append('Scheduling slots dropped by bounded backpressure')
    if not all(metric['pass'] for metric in classes.values()): reasons.append('HTTP errors or latency budget failed')
    if measured['actual_rps'] < 19: reasons.append('Throughput below 95% of 20rps')
    if any(dataset[key]<target for key,target in dict(users=2000,places=10000,trips=1000,reviews=20000).items()): reasons.append('Dataset below non-AI P00 scale')
    if not restored: reasons.append('Synthetic fixture names not restored')
    return dict(pass_=not reasons, scope='non-ai', project=env.project,dataset_counts=dataset,
        metrics=measured,class_metrics=classes,authenticated_principals=50,fixture_name_restored=restored,
        backpressure={'executor_workers':50,'pending_requests_peak':pending_peak,
            'queue_delay_p95_ms':percentile(queue_delays),'queue_delay_max_ms':max(queue_delays),
            'latency_includes_queue_wait':True,'measurement':'Scheduled request slot through response; all submitted slots accounted for'},
        evaluation={'p00_release_gate_pass':not reasons,'reasons':reasons},ai_endpoints_called=0,
        limitations=['Synthetic uniform data; local hardware and bounded run, not a production capacity forecast'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['seed','load','diagnostics'])
    parser.add_argument('--compose-file', required=True)
    parser.add_argument('--project', required=True)
    parser.add_argument('--gateway-port',type=int,default=59080)
    parser.add_argument('--duration',type=int,default=60)
    parser.add_argument('--release-id')
    parser.add_argument('--run-context',choices=['unspecified','isolated-host-window','concurrent-validation'],default='unspecified')
    parser.add_argument('--report',type=Path,default=Path(__file__).parent/'.local/p03/mix-load.json')
    args = parser.parse_args()
    if not 16 <= args.duration <= 120 or (args.duration*20)%16:
        parser.error('duration 16..120 seconds and request count divisible by16 required for exact mix')
    env = Environment(args.compose_file,args.project)
    if args.action == 'seed':
        print(json.dumps({'seeded_dataset_counts':seed(env)}))
        return
    if args.action == 'diagnostics':
        result = diagnostics(env)
        args.report.parent.mkdir(parents=True,exist_ok=True)
        args.report.write_text(json.dumps(result,indent=2),encoding='utf-8')
        print(json.dumps({'report':str(args.report),'plans':list(result['explain_analyze'])}))
        return
    before = candidate_manifest()['sha256']
    result = load(env,f'http://127.0.0.1:{args.gateway_port}',args.duration)
    after = candidate_manifest()['sha256']
    result['pass'] = result.pop('pass_') and before == after
    if before != after:
        result['evaluation']['p00_release_gate_pass'] = False
        result['evaluation']['reasons'].append('Source changed during measurement')
    result.update(candidate_before_sha256=before,candidate_sha256=after,candidate_unchanged=before==after,
        release_id=args.release_id,timestamp=datetime.now(timezone.utc).isoformat(),run_context=args.run_context,
        source_hashes={str(path.relative_to(ROOT)).replace('\\','/'):hashlib.sha256(path.read_bytes()).hexdigest()
            for path in [Path(__file__),ROOT/'backend/infra/p02.py',ROOT/'backend/infra/p03_verify.py',
                         ROOT/'backend/infra/p03_candidate.py',ROOT/'backend/contracts/fixtures/load-profile.json']})
    args.report.parent.mkdir(parents=True,exist_ok=True)
    archive_report(args.report)
    args.report.write_text(json.dumps(result,indent=2),encoding='utf-8')
    archive_report(args.report)
    print(json.dumps({'pass':result['pass'],'metrics':result['metrics'],'evaluation':result['evaluation']}))
    raise SystemExit(0 if result['pass'] else 1)


if __name__ == '__main__':
    main()
