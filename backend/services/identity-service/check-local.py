"""Live jar/image + PostgreSQL + Mailpit auth/provider smoke, validates frozen wire schemas.
Run after build and p01.py up --service identity:
  python backend/services/identity-service/check-local.py [--image smarttravel-identity:p01-auth-local]
Creates synthetic records/mail in P01; never deletes shared volumes. Only its own process/container is stopped.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import tempfile
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from jsonschema import Draft202012Validator, FormatChecker

SERVICE = Path(__file__).resolve().parent
ROOT = SERVICE.parents[2]
spec = importlib.util.spec_from_file_location('identity_run_local', SERVICE / 'run-local.py')
local = importlib.util.module_from_spec(spec)
spec.loader.exec_module(local)
from p01 import compose, environment, run, sql
CONTRACTS = ROOT / 'backend/contracts'
API = json.loads((CONTRACTS / 'openapi/identity.yaml').read_text(encoding='utf-8'))


def request(base, path, method='GET', body=None, token=None, headers=None):
    h = {'Content-Type':'application/json', **(headers or {})}
    if token:
        h['Authorization'] = 'Bearer ' + token
    req = Request(base + path, data=None if body is None else json.dumps(body).encode(), headers=h, method=method)
    try:
        response = urlopen(req, timeout=5)
    except HTTPError as error:
        response = error
    with response:
        raw = response.read()
        return response.status, json.loads(raw) if raw else None


def validate(path, method, status, body):
    response = API['paths'][path][method.lower()]['responses'][str(status)]
    schema = response.get('content', {}).get('application/json', {}).get('schema')
    if schema:
        Draft202012Validator(schema, format_checker=FormatChecker()).validate(body)
    else:
        assert body is None


def image_environment(env):
    """Use Compose DNS/internal ports, not Linux-inaccessible loopback publications."""
    return dict(env, PORT='8101', DB_URL='jdbc:postgresql://identity-db:5432/identity_db',
                MAIL_HOST='identity-mail', MAIL_PORT='1025',
                JWT_JWKS_URI='http://127.0.0.1:8101/.well-known/jwks.json',
                IDENTITY_KEYS_FILE='/run/identity/keys.json')


def dependency_network():
    source = environment()
    container = compose(source, 'ps', '-q', 'identity-db').stdout.strip()
    if not container:
        raise RuntimeError('Start the P01 Identity database before the image probe')
    networks = json.loads(run(['docker', 'inspect', '--format', '{{json .NetworkSettings.Networks}}',
                               container], source).stdout)
    if len(networks) != 1:
        raise RuntimeError('Expected one Compose network for the Identity database')
    return next(iter(networks))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--image', help='Run an already built Identity image instead of the jar')
    args = parser.parse_args()
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    env = local.app_environment(port, fixtures=True)
    name = 'smarttravel-identity-smoke-' + secrets.token_hex(6)
    with tempfile.TemporaryFile() as log, tempfile.TemporaryDirectory() as secret_directory:
        if args.image:
            env = image_environment(env)
            # Host directory is private; the bind-mounted file is readable by the non-root image UID.
            keys = Path(secret_directory) / 'keys.json'
            keys.write_bytes((SERVICE / '.local/keys.json').read_bytes())
            if os.name != 'nt':
                keys.chmod(0o444)
            variables = ['SPRING_PROFILES_ACTIVE','PORT','DB_URL','DB_USER','DB_PASSWORD','DB_MIGRATION_USER',
                         'DB_MIGRATION_PASSWORD','DB_MIGRATION_ENABLED','JWT_ISSUER','JWT_AUDIENCE','JWT_JWKS_URI',
                         'IDENTITY_KEYS_FILE','IDENTITY_ACTIVE_KID','IDENTITY_MAIL_KEY','MAIL_HOST','MAIL_PORT',
                         'IDENTITY_FIXTURE_PASSWORD','IDENTITY_FIXTURES_ENABLED']
            command = ['docker','run','--rm','--name',name,'--network',dependency_network(),
                       '-p',f'127.0.0.1:{port}:8101','-v',f'{keys.as_posix()}:/run/identity/keys.json:ro']
            for key in variables:
                command += ['-e',key]
            command += [args.image]
        else:
            command = ['java','-jar','identity-service-0.0.1-SNAPSHOT.jar']
        process = subprocess.Popen(command, cwd=ROOT if args.image else SERVICE / 'target', env=env, stdout=log, stderr=subprocess.STDOUT)
        try:
            for _ in range(90):
                if process.poll() is not None:
                    raise RuntimeError('Identity exited before becoming ready')
                try:
                    status, body = request(base,'/actuator/health')
                    if status == 200 and body['status'] == 'UP':
                        break
                except OSError:
                    pass
                time.sleep(1)
            else:
                raise RuntimeError('Identity did not become ready')
            status, body = request(base,'/.well-known/jwks.json')
            assert status == 200; validate('/.well-known/jwks.json','GET',status,body)
            assert all(not any(k in key for k in ['d','p','q','dp','dq','qi']) for key in body['keys'])
            email = 'smoke-' + secrets.token_hex(8) + '@example.invalid'
            password = secrets.token_urlsafe(24)
            registration = dict(email=email,password=password,display_name='Synthetic smoke')
            status, body = request(base,'/api/v1/auth/register','POST',registration,headers={'Idempotency-Key':secrets.token_hex(16)})
            assert status == 202; validate('/api/v1/auth/register','POST',status,body)
            mail_token = None
            for _ in range(30):
                _, listing = request('http://127.0.0.1:58025','/api/v1/messages')
                for message in listing['messages']:
                    if any(recipient['Address']==email for recipient in message['To']):
                        _, detail = request('http://127.0.0.1:58025','/api/v1/message/'+message['ID'])
                        mail_token = detail['Text'].strip().splitlines()[-1]
                if mail_token:
                    break
                time.sleep(1)
            assert mail_token, 'Account token was not delivered to the real local mail sink'
            status, body = request(base,'/api/v1/auth/verify-email','POST',dict(token=mail_token))
            assert status == 202; validate('/api/v1/auth/verify-email','POST',status,body)
            status, pair = request(base,'/api/v1/auth/login','POST',dict(email=email,password=password))
            assert status == 200; validate('/api/v1/auth/login','POST',status,pair)
            status, profile = request(base,'/api/v1/me',token=pair['access_token'])
            assert status == 200; validate('/api/v1/me','GET',status,profile)
            status, options = request(base,'/api/v1/preference-options')
            assert status == 200; validate('/api/v1/preference-options','GET',status,options)
            status, preferences = request(base,'/api/v1/me/preferences',token=pair['access_token'])
            assert status == 200; validate('/api/v1/me/preferences','GET',status,preferences)
            assert preferences['personalization_enabled'] is False and preferences['consent_version'] == 1
            preference_headers = {'If-Match':'"1"', 'Idempotency-Key':secrets.token_hex(16)}
            status, updated = request(base,'/api/v1/me/preferences','PUT',dict(personalization_enabled=True,consent_version=1),
                                      token=pair['access_token'],headers=preference_headers)
            assert status == 200; validate('/api/v1/me/preferences','PUT',status,updated)
            assert updated['consent_version'] == 2 and updated['version'] == 2
            status, replay = request(base,'/api/v1/me/preferences','PUT',dict(personalization_enabled=True,consent_version=1),
                                     token=pair['access_token'],headers=preference_headers)
            assert status == 200 and replay == updated
            status, sessions = request(base,'/api/v1/me/sessions',token=pair['access_token'])
            assert status == 200; validate('/api/v1/me/sessions','GET',status,sessions)
            status, renewed = request(base,'/api/v1/auth/refresh','POST',dict(refresh_token=pair['refresh_token']))
            assert status == 200; validate('/api/v1/auth/refresh','POST',status,renewed)
            status, body = request(base,'/api/v1/auth/logout','POST',dict(refresh_token=renewed['refresh_token']),token=renewed['access_token'])
            assert status == 204; validate('/api/v1/auth/logout','POST',status,body)
            status, body = request(base,'/api/v1/me',token=renewed['access_token'])
            assert status == 401; validate('/api/v1/me','GET',status,body)
            events = sql(environment(),'identity',f"SELECT payload::text FROM identity.outbox_events WHERE aggregate_id='{profile['user_id']}' ORDER BY aggregate_version;").stdout.splitlines()
            assert len(events) == 3
            for row in events:
                event = json.loads(row)
                schema = json.loads((CONTRACTS / ('events/'+event['event_type']+'.schema.json')).read_text(encoding='utf-8'))
                Draft202012Validator(schema, format_checker=FormatChecker()).validate(event)
                assert not any(key in event['payload'] for key in ['email','password','token','password_hash'])
            print('PASS live Identity: health, real SMTP verification, auth/profile/preferences/options/session/JWKS schemas, consent/idempotency, revocation, 3 event snapshots')
        except Exception as error:
            log.seek(0)
            detail = log.read().decode('utf-8',errors='replace')[-6000:]
            for key,value in env.items():
                if any(marker in key for marker in ['PASSWORD','SECRET','KEY','TOKEN']) and value:
                    detail = detail.replace(value,'[REDACTED]')
            raise RuntimeError(f'Identity live probe failed: {type(error).__name__}\n{detail}') from None
        finally:
            if args.image:
                subprocess.run(['docker','stop',name],capture_output=True)
            else:
                process.terminate()
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                process.kill(); process.wait()


if __name__ == '__main__':
    main()
