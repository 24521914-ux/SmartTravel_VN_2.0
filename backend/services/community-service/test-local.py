"""Real Mongo replica-set domain tests in an owned disposable container."""
from pathlib import Path
import os
import secrets
import subprocess
import time
import hashlib
import argparse
import sys

ROOT=Path(__file__).resolve().parents[3]

def run(args,env,text=None):
    result=subprocess.run(args,cwd=ROOT,env=env,input=None if text is None else text.encode('utf-8'),capture_output=True)
    output=(result.stdout+result.stderr).decode('utf-8',errors='replace')
    if result.returncode:
        for key,value in env.items():
            if any(marker in key for marker in ['PASSWORD','TOKEN','SECRET']) and value:
                output=output.replace(value,'[REDACTED]')
        raise RuntimeError(output[-12000:])
    return result.stdout.decode('utf-8',errors='replace').strip()

def main():
    if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8',errors='replace')
    parser=argparse.ArgumentParser()
    parser.add_argument('--transport',action='store_true')
    args=parser.parse_args()
    sys.path.insert(0,str(ROOT/'backend/platform'))
    from local_broker_fixture import BrokerFixture
    broker=BrokerFixture('community',run)
    name='smarttravel-community-test-'+secrets.token_hex(6)
    env=dict(os.environ)
    env['SPRING_APPLICATION_JSON']='{"debug":false,"logging":{"level":{"root":"WARN","org.springframework":"WARN"}}}'
    started=False
    try:
        run(['docker','run','-d','--name',name,'-p','127.0.0.1::27017','mongo:8.0','--replSet','p01','--bind_ip_all'],env)
        started=True
        for _ in range(60):
            ready=subprocess.run(['docker','exec',name,'mongosh','--quiet','--eval','db.adminCommand({ping:1})'],capture_output=True)
            if ready.returncode==0:
                break
            state=run(['docker','inspect','--format','{{.State.Status}}',name],env)
            if state in {'exited','dead'}:
                diagnostics=run(['docker','logs','--tail','60',name],env)
                details=run(['docker','inspect','--format','{{json .State}}',name],env)
                raise RuntimeError('Mongo exited before readiness: '+details+' '+diagnostics)
            time.sleep(1)
        else:
            diagnostics=run(['docker','logs','--tail','60',name],env)
            raise RuntimeError('Mongo startup timeout: '+diagnostics)
        run(['docker','exec',name,'mongosh','--quiet','--eval',"rs.initiate({_id:'p01',members:[{_id:0,host:'localhost:27017'}]})"],env)
        for _ in range(60):
            ready=subprocess.run(['docker','exec',name,'mongosh','--quiet','--eval',"if(!db.hello().isWritablePrimary)quit(1)"],capture_output=True)
            if ready.returncode==0:
                break
            time.sleep(1)
        else:
            raise RuntimeError('Mongo primary timeout')
        migration=ROOT/'backend/services/community-service/src/main/resources/db/migration/V1__community_baseline.js'
        run(['docker','cp',str(migration),name+':/tmp/V1.js'],env)
        second=migration.with_name('V2__provider_name_limits.js')
        run(['docker','cp',str(second),name+':/tmp/V2.js'],env)
        third=migration.with_name('V3__user_mutation_fences.js')
        run(['docker','cp',str(third),name+':/tmp/V3.js'],env)
        third_digest=hashlib.sha256(third.read_bytes()).hexdigest()
        digest=hashlib.sha256(migration.read_bytes()).hexdigest()
        second_digest=hashlib.sha256(second.read_bytes()).hexdigest()
        script="load('/tmp/V1.js');load('/tmp/V2.js');load('/tmp/V3.js');const c=db.getSiblingDB('community_db');for(const [name,def] of Object.entries(communityDefinitions)){c.createCollection(name,{validator:def.validator,validationLevel:'strict',validationAction:'error'});for(const i of def.indexes){const {key,...options}=i;c[name].createIndex(key,options);}}c.schema_migrations.insertOne({_id:'V1__community_baseline',checksum:'"+digest+"',applied_at:new Date()});c.schema_migrations.insertOne({_id:'V2__provider_name_limits',checksum:'"+second_digest+"',applied_at:new Date()});"
        script+="c.schema_migrations.insertOne({_id:'V3__user_mutation_fences',checksum:'"+third_digest+"',applied_at:new Date()});"
        run(['docker','exec',name,'mongosh','--quiet','--eval',script],env)
        port=run(['docker','port',name,'27017'],env).split(':')[-1]
        env.update(COMMUNITY_DB_TESTS='true',MONGODB_URI=f'mongodb://127.0.0.1:{port}/community_db?replicaSet=p01&directConnection=true')
        if args.transport:env.update(broker.start())
        wrapper=ROOT/'backend'/('mvnw.cmd' if os.name=='nt' else 'mvnw')
        command=[str(wrapper)] if os.name=='nt' else ['bash',str(wrapper)]
        print(run(command+['-B','-f','backend/services/community-service/pom.xml','clean','verify'],env))
        print('Community disposable replica-set domain tests PASS')
    finally:
        broker.close()
        if started:
            # Remove only this runner's randomly named disposable container.
            # Cleanup must not mask the startup/test failure.
            subprocess.run(['docker','rm','-f',name],env=env,capture_output=True)

if __name__=='__main__':
    main()
