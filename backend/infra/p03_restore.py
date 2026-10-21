"""Private local backup/restore rehearsal; never restores into the source stack.

Run only after coordinating all P02 test writers: python p03_restore.py --freeze-writers.
Artifacts contain application data and stay under ignored .local/p03.
This verifies a quiescent checkpoint, not live PITR or broker recovery.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import time
import tarfile

import yaml
import p02

HERE = Path(__file__).resolve().parent
SERVICES = ['identity', 'catalog', 'community', 'trip', 'ingestion', 'intelligence']
LABEL = 'vn.smarttravel.restore-run'
ARTIFACT_NAMES={s+ext for s in SERVICES for ext in ['.dump','.tar']} | {'keys.json','secrets.json','compose.yaml'}


def docker(*args, data=None):
    operation=args[0] if args[0] in {'exec','run','stop','start','rm','volume','container'} else 'operation'
    try:
        result = subprocess.run(['docker', *args], input=data, capture_output=True, timeout=300)
    except subprocess.TimeoutExpired:
        # TimeoutExpired includes the full argv (environment credentials) by default.
        raise RuntimeError('Docker '+operation+' timed out') from None
    if result.returncode:
        # Never emit credentials or data from command arguments/output.
        raise RuntimeError('Docker '+operation+' failed (exit '+str(result.returncode)+')')
    return result.stdout


def inspect(name, kind='container'):
    return json.loads(docker(kind, 'inspect', name))[0]


def resume_directory(path, private_root):
    raw=Path(path).absolute()
    for item in [raw,*raw.parents]:
        if item.is_symlink() or (hasattr(item,'is_junction') and item.is_junction()):
            raise RuntimeError('Resume symlink/junction paths are prohibited')
    resolved=Path(path).resolve()
    if not resolved.is_relative_to(Path(private_root).resolve()):
        raise RuntimeError('Resume path must stay inside private P03 directory')
    if not (resolved/'checkpoint.json').is_file():
        raise RuntimeError('Resume requires original checkpoint manifest; never reconstruct from live source')
    return resolved


def check_backup(path, private_root=None):
    artifacts=resume_directory(path,private_root or HERE/'.local/p03')
    manifest_path=artifacts/'checkpoint.json'
    if manifest_path.is_symlink(): raise RuntimeError('Checkpoint symlink prohibited')
    manifest=json.loads(manifest_path.read_text())
    if set(manifest.get('source',{}))!=set(SERVICES):
        raise RuntimeError('Checkpoint requires exactly six source databases')
    if set(manifest.get('artifacts_sha256',{}))!=ARTIFACT_NAMES:
        raise RuntimeError('Checkpoint requires exact dump/object/key/config artifact set')
    checkpoint=manifest.get('checkpoint_epoch')
    if type(checkpoint) not in (int,float) or not math.isfinite(checkpoint):
        raise RuntimeError('Checkpoint timestamp invalid')
    age=time.time()-checkpoint
    if age<0 or age>86400: raise RuntimeError('Checkpoint timestamp future or older than 24 hours')
    for filename,digest in manifest['artifacts_sha256'].items():
        target=artifacts/filename
        if target.is_symlink() or not target.is_file() or hashlib.sha256(target.read_bytes()).hexdigest()!=digest:
            raise RuntimeError('Checkpoint artifact integrity mismatch: '+filename)
    return artifacts,manifest


def guard_resource(info, run_id, source_volumes):
    labels = info.get('Config', {}).get('Labels', {}) if 'Config' in info else info.get('Labels', {})
    if labels.get(LABEL) != run_id:
        raise RuntimeError('Restore resource ownership label mismatch')
    name = info.get('Name', '').lstrip('/')
    if not name.startswith('smarttravel-p03-restore-' + run_id + '-'):
        raise RuntimeError('Restore resource name mismatch')
    mounted = {v.get('Name') for v in info.get('Mounts', []) if v.get('Type') == 'volume'}
    if mounted & set(source_volumes) or name in source_volumes:
        raise RuntimeError('Restore resource overlaps original volume')


def canonical_schema(raw):
    # PostgreSQL security backports emit random psql restriction tokens.
    return b'\n'.join(line for line in raw.splitlines() if not line.startswith((b'\\restrict ',b'\\unrestrict ')))


def pg_snapshot(container, service):
    sql = "SELECT schemaname,tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY 1,2"
    tables = docker('exec', container, 'psql', '-U', service+'_admin', '-d', service+'_db', '-At', '-c', sql).decode().splitlines()
    result = {}
    for table in tables:
        schema, name = table.split('|')
        quoted = '"'+schema.replace('"','""')+'"."'+name.replace('"','""')+'"'
        rows = docker('exec', container, 'psql', '-U', service+'_admin', '-d', service+'_db', '-At', '-c',
                      'SELECT row_to_json(t)::text FROM '+quoted+' t ORDER BY row_to_json(t)::text COLLATE "C"')
        result[table] = dict(rows=len(rows.splitlines()), sha256=hashlib.sha256(rows).hexdigest())
    schema = docker('exec', container, 'pg_dump', '-U', service+'_admin', '-d', service+'_db', '--schema-only', '--no-owner', '--no-privileges')
    result['schema'] = hashlib.sha256(canonical_schema(schema)).hexdigest()
    return result


MONGO_CHECK = '''const d=db.getSiblingDB("community_db"); const out={};
for(const c of d.getCollectionInfos().sort((a,b)=>a.name.localeCompare(b.name))){
 const coll=d.getCollection(c.name);out[c.name]={options:c.options,indexes:coll.getIndexes().sort((a,b)=>a.name.localeCompare(b.name)),documents:coll.find().sort({_id:1}).toArray()};}
print(EJSON.stringify(out,{relaxed:false}));'''


def mongo_snapshot(container, authenticated):
    prefix = ['sh', '-ec', 'exec mongosh --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --eval "$1"', 'snapshot'] if authenticated else ['mongosh', '--quiet', '--eval']
    raw = docker('exec', container, *prefix, MONGO_CHECK)
    value = json.loads(raw)
    return {name: dict(rows=len(v['documents']), sha256=hashlib.sha256(json.dumps(v, sort_keys=True).encode()).hexdigest()) for name,v in value.items()}


def rehearsal(resume=None,release_id=None):
    source_paths=[Path(__file__),HERE/'p02.py',HERE.parents[1]/'plan/P00-DECISIONS.md']
    source_hashes={str(p.relative_to(HERE.parents[1])).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in source_paths}
    cfg = yaml.safe_load((HERE/'.local/p02/compose.yaml').read_text(encoding='utf-8'))
    values = json.loads((HERE/'.local/p02/secrets.json').read_text())
    run_id = secrets.token_hex(8)
    prefix = 'smarttravel-p03-restore-'+run_id+'-'
    artifacts = HERE/'.local/p03'/run_id
    if resume:
        artifacts=resume_directory(resume,HERE/'.local/p03')
    else:
        artifacts.mkdir(parents=True)
    if os.name != 'nt': artifacts.chmod(0o700)
    source = {s: inspect('smarttravel-p02-'+s+'-db-1') for s in SERVICES}
    for item in source.values():
        if item['Config']['Labels'].get('com.docker.compose.project') != 'smarttravel-p02':
            raise RuntimeError('Source database project identity mismatch')
    source_volumes = {v['Name'] for item in source.values() for v in item['Mounts'] if v['Type']=='volume'}
    object_volumes = {}
    writers = []
    for s in SERVICES+['gateway']:
        item = inspect('smarttravel-p02-'+s+'-1')
        if item['Config']['Labels'].get('com.docker.compose.project') != 'smarttravel-p02':
            raise RuntimeError('Source project identity mismatch')
        if item['State']['Running']: writers.append(item['Id'])
        if s in SERVICES:
            object_volumes[s] = next(v['Name'] for v in item['Mounts'] if v['Type']=='volume')
    source_volumes.update(object_volumes.values())
    if len(writers) != len(SERVICES)+1:
        raise RuntimeError('Rehearsal requires all seven P02 applications initially running')
    owned_containers, owned_volumes = [], []
    before = {}
    checkpoint = time.time()
    try:
        try:
            if resume:
                artifacts,manifest=check_backup(artifacts)
                before=manifest['source']; checkpoint=manifest['checkpoint_epoch']
                cfg=yaml.safe_load((artifacts/'compose.yaml').read_text())
                values=json.loads((artifacts/'secrets.json').read_text())
            else:
                if writers: docker('stop', '-t', '30', *writers)
                checkpoint = time.time()
                for filename in ['keys.json', 'secrets.json', 'compose.yaml']:
                    shutil.copyfile(HERE/'.local/p02'/filename, artifacts/filename)
                for s in SERVICES:
                    container = source[s]['Id']
                    if s == 'community':
                        archive = docker('exec', container, 'sh', '-ec', 'exec mongodump --archive --db community_db -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin')
                        before[s] = mongo_snapshot(container, True)
                    else:
                        archive = docker('exec', container, 'pg_dump', '-U', s+'_admin', '-d', s+'_db', '-Fc')
                        before[s] = pg_snapshot(container, s)
                    (artifacts/(s+'.dump')).write_bytes(archive)
                    obj = docker('run', '--rm', '--network', 'none', '-v', object_volumes[s]+':/objects:ro', 'python:3.12-alpine', 'tar', '-C', '/objects', '-cf', '-', '.')
                    (artifacts/(s+'.tar')).write_bytes(obj)
                manifest=dict(source=before,checkpoint_epoch=checkpoint,artifacts_sha256={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in artifacts.iterdir() if p.is_file()})
                (artifacts/'checkpoint.json').write_text(json.dumps(manifest,indent=2))
        finally:
            if writers and not resume:
                docker('start', *writers)
                p02.wait_ready()
        if resume: p02.wait_ready()
        restore_started = time.time()
        after = {}
        for s in SERVICES:
            name = prefix+s
            volume = name+'-data'
            docker('volume', 'create', '--label', LABEL+'='+run_id, volume)
            owned_volumes.append(volume)
            guard_resource(inspect(volume,'volume'),run_id,source_volumes)
            service = cfg['services'][s+'-db']
            args = ['run', '-d', '--name', name, '--label', LABEL+'='+run_id, '--network', 'none', '-v', volume+(':/data/db' if s=='community' else ':/var/lib/postgresql/data')]
            if s!='community':
                for k,v in service['environment'].items():
                    if isinstance(v,str) and v.startswith('${'): v=values[v[2:].split(':')[0]]
                    args += ['-e', k+'='+str(v)]
                args += ['-v', str(HERE/'postgres/01-roles.sh')+':/docker-entrypoint-initdb.d/01-roles.sh:ro']
            args += [service['image']]
            if s=='community': args += ['mongod', '--bind_ip', '127.0.0.1']
            docker(*args)
            owned_containers.append(name)
            guard_resource(inspect(name), run_id, source_volumes)
            for attempt in range(90):
                try:
                    if s=='community': docker('exec', name, 'mongosh', '--quiet', '--eval', 'db.adminCommand({ping:1})')
                    else: docker('exec', name, 'sh', '-ec', 'PGPASSWORD="$POSTGRES_PASSWORD" exec psql -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "SELECT 1"')
                    break
                except RuntimeError:
                    if attempt==89: raise
                    time.sleep(1)
            data=(artifacts/(s+'.dump')).read_bytes()
            if s=='community':
                docker('exec', '-i', name, 'mongorestore', '--archive', data=data)
                after[s]=mongo_snapshot(name,False)
            else:
                # PostgreSQL reparses CHECK expressions while restoring, changing
                # equivalent cast spelling. An empty reference DB from the same
                # immutable archive gives engine-normalized full schema definitions.
                reference=s+'_schema_reference'
                docker('exec',name,'createdb','-U',s+'_admin','-T','template0',reference)
                docker('exec','-i',name,'pg_restore','-U',s+'_admin','-d',reference,'--schema-only','--clean','--if-exists','--exit-on-error',data=data)
                expected_schema=docker('exec',name,'pg_dump','-U',s+'_admin','-d',reference,'--schema-only','--no-owner','--no-privileges')
                before[s]['schema']=hashlib.sha256(canonical_schema(expected_schema)).hexdigest()
                docker('exec', '-i', name, 'pg_restore', '-U', s+'_admin', '-d', s+'_db', '--clean', '--if-exists', '--exit-on-error', data=data)
                after[s]=pg_snapshot(name,s)
            objvol=name+'-objects'
            docker('volume','create','--label',LABEL+'='+run_id,objvol)
            owned_volumes.append(objvol)
            guard_resource(inspect(objvol,'volume'),run_id,source_volumes)
            docker('run','--rm','-i','--network','none','-v',objvol+':/objects','python:3.12-alpine','tar','-C','/objects','-xf','-',data=(artifacts/(s+'.tar')).read_bytes())
            restored=docker('run','--rm','--network','none','-v',objvol+':/objects:ro','python:3.12-alpine','tar','-C','/objects','-cf','-','.')
            if hashlib.sha256(restored).digest()!=hashlib.sha256((artifacts/(s+'.tar')).read_bytes()).digest():
                raise RuntimeError('Object archive mismatch: '+s)
        duration=time.time()-restore_started
        object_counts={}
        for s in SERVICES:
            with tarfile.open(artifacts/(s+'.tar')) as archive:
                object_counts[s]=sum(1 for member in archive if member.isfile())
        measured_at=datetime.now(timezone.utc).isoformat()
        checkpoint_age=time.time()-checkpoint
        source_unchanged=all(source_hashes[str(p.relative_to(HERE.parents[1])).replace('\\','/')]==hashlib.sha256(p.read_bytes()).hexdigest() for p in source_paths)
        checks_pass=before==after and duration<14400 and 0<=checkpoint_age<=86400
        report=dict(run_id=run_id,checkpoint_epoch=checkpoint,checkpoint_age_seconds=checkpoint_age,storage_restore_seconds=duration,frozen_checkpoint_rpo_seconds=0,rto_limit_seconds=14400,rpo_limit_seconds=86400,
                    release_id=release_id,timestamp=measured_at,timestamp_utc=measured_at,
                    source_hashes=source_hashes,source_files_unchanged_during_run=source_unchanged,
                    status='stale' if not source_unchanged else ('pass' if checks_pass else 'failed'),
                    pass_checks=checks_pass and source_unchanged,source=before,restored=after,
                    object_file_counts=object_counts,empty_object_volumes=[s for s,count in object_counts.items() if count==0],
                    application_disaster_recovery_verified=False,source_apps_restart_readiness_verified=True,
                    schema_comparison_basis='full schema compared against empty reference DB restored schema-only from immutable checkpoint archive on same PostgreSQL engine; remove random psql restriction token lines',
                    mongo_auth_users_roles_restore_verified=False,mongo_replica_set_topology_restore_verified=False,
                    postgres_ownership_acl_comparison_verified=False,
                    scope='quiescent local checkpoint; five PostgreSQL DBs plus Mongo community domain data/indexes/options and six object volumes; keys/config backed up but not activated; Mongo authusers/roles and replica-set topology restoration NOT verified; excludes broker, live PITR, production failover',
                    artifact_security='ignored local directory; plaintext backup requires disk protection; encryption and offsite durability not verified')
        (artifacts/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        (HERE/'.local/p03/restore-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        if not report['pass_checks']: raise RuntimeError('Database comparison or RTO failed')
        print(json.dumps({k:v for k,v in report.items() if k not in ['source','restored']}))
    finally:
        # Check ALL resources before any removal; fail closed on overlap/ownership.
        for name in owned_containers: guard_resource(inspect(name),run_id,source_volumes)
        for name in owned_volumes: guard_resource(inspect(name,'volume'),run_id,source_volumes)
        for name in owned_containers: docker('rm','-f',name)
        for name in owned_volumes: docker('volume','rm',name)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--freeze-writers',action='store_true',help='coordinate writer pause before using this option')
    parser.add_argument('--resume',help='restore-only from private existing checkpoint directory')
    parser.add_argument('--check-backup',help='read-only checkpoint and required artifact integrity validation')
    parser.add_argument('--release-id',help='candidate identity for release evidence aggregation')
    args=parser.parse_args()
    if args.check_backup:
        if args.freeze_writers or args.resume: parser.error('select one mode')
        _,manifest=check_backup(args.check_backup)
        print(json.dumps(dict(backup_integrity_verified=True,artifact_count=len(manifest['artifacts_sha256']))))
        raise SystemExit(0)
    if not args.freeze_writers and not args.resume: parser.error('--freeze-writers or --resume is required')
    if args.freeze_writers and args.resume: parser.error('select one mode')
    rehearsal(args.resume,args.release_id)
