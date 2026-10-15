"""Probe a packaged Catalog image using owned PostGIS/JWKS containers only."""
import argparse, importlib.util, json, os, secrets, subprocess, tempfile, time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[3]
SERVICE = Path(__file__).parent.name.removesuffix('-service')

def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value

helper = module('domain_runner', Path(__file__).with_name('test-local.py'))
issuer_module = module('test_issuer', ROOT / 'backend/platform/test_issuer.py')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--image', default=f'smarttravel-{SERVICE}:p01-finish-local')
    args = parser.parse_args()
    name = SERVICE + '-image-' + secrets.token_hex(5)
    database, app, jwks = [name + x for x in ('-db', '-app', '-jwks')]
    portnum = '8102' if SERVICE == 'catalog' else '8103'
    admin, migrator, runtime = [secrets.token_hex(24) for _ in range(3)]
    env = dict(os.environ, POSTGRES_PASSWORD=admin, DB_PASSWORD=runtime,
               DB_MIGRATION_PASSWORD=migrator, DB_USER=SERVICE+'_runtime',
               DB_MIGRATION_USER=SERVICE+'_migrator',
               DB_URL=f'jdbc:postgresql://{database}:5432/{SERVICE}_db',
               MONGODB_URI=f'mongodb://{database}:27017/community_db?replicaSet=p01&directConnection=true',
               JWT_JWKS_URI=f'http://{jwks}:8000/jwks', JWT_ISSUER='local-test',
               SPRING_PROFILES_ACTIVE='local')
    started = []
    network = False
    issuer = issuer_module.Issuer()
    spec = json.loads((ROOT / f'backend/contracts/openapi/{SERVICE}.yaml').read_text(encoding='utf-8'))
    try:
        with tempfile.TemporaryDirectory(prefix=name) as directory:
            Path(directory, 'jwks').write_text(json.dumps(issuer.jwks()), encoding='utf-8')
            helper.run(['docker', 'network', 'create', name], env)
            network = True
            if SERVICE == 'catalog':
                helper.run(['docker','run','-d','--name',database,'--network',name,'-e','POSTGRES_PASSWORD','-e','POSTGRES_DB=catalog_db','postgis/postgis:16-3.5'],env)
                started.append(database)
                for _ in range(90):
                    if subprocess.run(['docker','exec',database,'pg_isready','-h','127.0.0.1','-U','postgres'],capture_output=True).returncode == 0: break
                    time.sleep(1)
                else: raise RuntimeError('Owned PostGIS readiness failed')
                helper.run(['docker','exec','-i',database,'psql','-U','postgres','-d','catalog_db','-v','ON_ERROR_STOP=1'],env,
                           f"CREATE ROLE catalog_migrator LOGIN PASSWORD '{migrator}';\nCREATE ROLE catalog_runtime LOGIN PASSWORD '{runtime}';\nALTER DATABASE catalog_db OWNER TO catalog_migrator;\nGRANT CREATE ON SCHEMA public TO catalog_migrator;\n")
            else:
                helper.run(['docker','run','-d','--name',database,'--network',name,'mongo:8.0','--replSet','p01','--bind_ip_all'],env)
                started.append(database)
                for _ in range(90):
                    if subprocess.run(['docker','exec',database,'mongosh','--quiet','--eval','db.adminCommand({ping:1})'],capture_output=True).returncode == 0: break
                    time.sleep(1)
                else: raise RuntimeError('Owned Mongo readiness failed')
                helper.run(['docker','exec',database,'mongosh','--quiet','--eval',f"rs.initiate({{_id:'p01',members:[{{_id:0,host:'{database}:27017'}}]}})"],env)
                for _ in range(90):
                    if subprocess.run(['docker','exec',database,'mongosh','--quiet','--eval','if(!db.hello().isWritablePrimary)quit(1)'],capture_output=True).returncode == 0: break
                    time.sleep(1)
                else: raise RuntimeError('Owned Mongo primary failed')
                import hashlib
                migrations = sorted((ROOT/'backend/services/community-service/src/main/resources/db/migration').glob('V*.js'))
                for migration in migrations: helper.run(['docker','cp',str(migration),database+':/tmp/'+migration.name],env)
                script = ''.join("load('/tmp/"+m.name+"');" for m in migrations)
                script += "const c=db.getSiblingDB('community_db');for(const [name,def] of Object.entries(communityDefinitions)){c.createCollection(name,{validator:def.validator,validationLevel:'strict',validationAction:'error'});for(const i of def.indexes){const {key,...options}=i;c[name].createIndex(key,options);}}"
                for migration in migrations:
                    script += "c.schema_migrations.insertOne({_id:'"+migration.stem+"',checksum:'"+hashlib.sha256(migration.read_bytes()).hexdigest()+"',applied_at:new Date()});"
                helper.run(['docker','exec',database,'mongosh','--quiet','--eval',script],env)
            helper.run(['docker','run','-d','--name',jwks,'--network',name,'--mount','type=bind,source='+directory+',target=/fixture,readonly','python:3.12-alpine','python','-m','http.server','8000','--directory','/fixture'],env)
            started.append(jwks)
            command = ['docker','run','-d','--name',app,'--network',name,'-p','127.0.0.1::'+portnum]
            for key in ('DB_URL','DB_USER','DB_PASSWORD','DB_MIGRATION_USER','DB_MIGRATION_PASSWORD','MONGODB_URI','JWT_JWKS_URI','JWT_ISSUER','SPRING_PROFILES_ACTIVE'): command += ['-e',key]
            helper.run(command+[args.image],env)
            started.append(app)
            base = 'http://127.0.0.1:'+helper.run(['docker','port',app,portnum],env).split(':')[-1]
            def request(method,path,body=None,token=None,status=200,headers=None,pattern=None):
                h = {'Content-Type':'application/json', **(headers or {})}
                if token: h['Authorization'] = 'Bearer '+token
                req = Request(base+path,data=None if body is None else json.dumps(body).encode(),headers=h,method=method)
                try: response = urlopen(req,timeout=5)
                except HTTPError as error: response = error
                with response:
                    raw = response.read()
                    assert response.status == status, (method,path,response.status,status,raw.decode(errors='replace'))
                    value = json.loads(raw) if raw else None
                    schema = spec['paths'].get(pattern or path,{}).get(method.lower(),{}).get('responses',{}).get(str(status),{}).get('content',{}).get('application/json',{}).get('schema')
                    if schema: Draft202012Validator(schema).validate(value)
                    return value
            for _ in range(90):
                try:
                    if request('GET','/actuator/health')['status'] == 'UP': break
                except (AssertionError,URLError,OSError,TimeoutError): pass
                time.sleep(1)
            else: raise RuntimeError('Owned image readiness failed')
            for probe in ('readiness','liveness'): assert request('GET','/actuator/health/'+probe)['status'] == 'UP'
            if SERVICE == 'catalog':
                path = '/api/v1/admin/categories'
                request('GET',path,status=401)
                request('GET',path,token=issuer.token(SERVICE,'USER'),status=403)
                token = issuer.token(SERVICE,'ADMIN')
                created = request('POST',path,dict(name='SYNTHETIC image category'),token,201,{'Idempotency-Key':secrets.token_hex(16)})
                detail = path+'/'+created['id']
                pattern = path+'/{id}'
            else:
                path = '/api/v1/me/collections'
                request('GET',path,status=401)
                token = issuer.token(SERVICE,'USER')
                created = request('POST',path,dict(name='SYNTHETIC private image collection',visibility='PRIVATE'),token,201)
                detail = path+'/'+created['collection_id']
                pattern = path+'/{collection_id}'
                request('GET','/api/v1/collections/'+created['collection_id'],status=404)
            request('GET',detail,token=token,pattern=pattern)
            request('DELETE',detail,token=token,status=204,headers={'If-Match':'"'+str(created['version'])+'"'},pattern=pattern)
            assert helper.run(['docker','exec',app,'id','-u'],env) == '10001'
            print(SERVICE+' image PASS: owned storage, versioned migrations, non-root, readiness/liveness, real RS256/JWKS, authorization, persisted create/read/delete, frozen schemas')
    finally:
        issuer.server_close()
        for container in reversed(started): helper.run(['docker','rm','-f',container],env)
        if network: helper.run(['docker','network','rm',name],env)

if __name__ == '__main__': main()
