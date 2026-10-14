"""Start one skeleton at a time against its own REAL DB; never all six.
Requires jars from Maven verify and local Compose services already running.
Uses environment DB passwords, no secrets printed/written to the repo.
"""
import argparse
import json
import os
import socket
import subprocess
import tempfile
import time
import threading
from test_issuer import Issuer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import urlopen,Request

BACKEND=Path(__file__).resolve().parents[1]
SERVICES=['identity','catalog','community','trip','ingestion','intelligence']
PORTS={'identity':55434,'catalog':55432,'trip':55435,'ingestion':55436,'intelligence':55437}

def check(service, p01=False):
    # Never pass another service's database/admin/migration secrets to an app.
    env={key:value for key,value in os.environ.items() if not any(marker in key for marker in ['PASSWORD','MONGODB_URI','DB_URL','DB_USER','DB_MIGRATION'])}
    if service=='community':
        if p01:
            from urllib.parse import quote
            password=quote(os.environ['COMMUNITY_RUNTIME_PASSWORD'],safe='')
            env['MONGODB_URI']=f'mongodb://community_runtime:{password}@localhost:57117/community_db?authSource=community_db&replicaSet=rs0&directConnection=true'
        else:
            env['MONGODB_URI']='mongodb://localhost:57017/community_db?replicaSet=rs0&directConnection=true'
    elif p01:
        env.update(DB_URL=f'jdbc:postgresql://localhost:{PORTS[service]+1000}/{service}_db',
                   DB_USER=f'{service}_runtime',DB_PASSWORD=os.environ[f'{service.upper()}_RUNTIME_PASSWORD'],
                   DB_MIGRATION_USER=f'{service}_migrator',DB_MIGRATION_PASSWORD=os.environ[f'{service.upper()}_MIGRATION_PASSWORD'])
    else:
        env.update(DB_URL=f'jdbc:postgresql://localhost:{PORTS[service]}/{service}_db',DB_USER=f'{service}_local',DB_PASSWORD=os.environ[f'{service.upper()}_DB_PASSWORD'])
    env['SPRING_PROFILES_ACTIVE']='p01local' if service != 'identity' else 'p01-local'
    if service == 'identity':
        env.update(MAIL_PORT='51025')
        # This legacy smoke tests DB/security only, not provider availability.
        env['MANAGEMENT_HEALTH_MAIL_ENABLED'] = 'false'
    env.update(JWT_ISSUER='local-test',JWT_AUDIENCE=service,JWT_JWKS_URI='http://127.0.0.1:18082/jwks')
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0)); port=sock.getsockname()[1]
    env['PORT']=str(port)
    jar=BACKEND/f'services/{service}-service/target/{service}-service-0.0.1-SNAPSHOT.jar'
    assert jar.exists(), f'Build first: {jar}'
    issuer=Issuer()
    issuer_thread=threading.Thread(target=issuer.serve_forever,daemon=True)
    issuer_thread.start()
    env['JWT_JWKS_URI']=f'http://127.0.0.1:{issuer.server_port}/jwks'
    with tempfile.TemporaryFile() as log:
        process=subprocess.Popen(['java','-Xmx256m','-jar',jar.name],cwd=jar.parent,env=env,stdout=log,stderr=subprocess.STDOUT)
        try:
            ready=False
            for _ in range(90):
                if process.poll() is not None:
                    log.seek(0)
                    detail=log.read().decode('utf-8',errors='replace')[-6000:]
                    for key,value in env.items():
                        if ('PASSWORD' in key or 'TOKEN' in key or 'SECRET' in key) and value: detail=detail.replace(value,'[REDACTED]')
                    raise RuntimeError(f'{service} exited {process.returncode} before health became UP:\n{detail}')
                try:
                    with urlopen(f'http://127.0.0.1:{port}/actuator/health',timeout=2) as response:
                        ready=json.load(response)['status']=='UP'
                    if ready: break
                except (OSError,ValueError): pass
                time.sleep(1)
            assert ready, f'{service} DB health did not become UP'
            route = '/api/v1/unknown'
            try:
                urlopen(f'http://127.0.0.1:{port}{route}',timeout=3).close()
                raise AssertionError('Unauthenticated private route accepted')
            except HTTPError as error:
                assert error.code==401, f'Expected 401, got {error.code}'
                payload=json.load(error)
                assert set(payload)=={'code','message','traceId','fieldErrors'}
                assert error.headers.get('X-Correlation-ID')
                assert len(payload['traceId'])==32
                error.close()
            for audience,expected in [(service,404),('catalog' if service=='identity' else 'identity',401)]:
                token=issuer.token(audience,'USER')
                req=Request(f'http://127.0.0.1:{port}{route}',headers={'Authorization':f'Bearer {token}'})
                try:
                    urlopen(req,timeout=5).close()
                    raise AssertionError('Unknown route unexpectedly exists')
                except HTTPError as error:
                    assert error.code==expected, f'JWT audience {audience}: expected {expected}, got {error.code}'
                    assert set(json.load(error))=={'code','message','traceId','fieldErrors'}
                    error.close()
            print(f'PASS {service}: standalone own DB health UP; real JWKS signed JWT accepted, wrong audience/no JWT 401, error/correlation format; no dependency on other domain runtimes',flush=True)
        finally:
            process.terminate()
            try: process.wait(timeout=10)
            except subprocess.TimeoutExpired: process.kill(); process.wait()
            issuer.shutdown(); issuer.server_close(); issuer_thread.join()

if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--service',choices=SERVICES)
    parser.add_argument('--p01',action='store_true',help='Use isolated P01 databases with migration/runtime roles')
    args=parser.parse_args()
    for service in [args.service] if args.service else SERVICES: check(service,p01=args.p01)
