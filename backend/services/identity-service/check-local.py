"""Live jar/image + PostgreSQL + Mailpit auth/provider smoke, validates frozen wire schemas.
Run after build and p01.py up --service identity:
  python backend/services/identity-service/check-local.py [--image smarttravel-identity:p01-auth-local]
Creates synthetic records/mail in P01; never deletes shared volumes. Only its own process/container is stopped.
"""
import argparse
import base64
import importlib.util
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import tempfile
import time
import uuid
from datetime import datetime, timezone
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
                IDENTITY_KEYS_FILE='/run/identity/keys.json',
                **({'BROKER_HOST':'identity-broker','BROKER_PORT':'5672'} if env.get('IDENTITY_TRANSPORT_ENABLED') == 'true' else {}))


def publish_fixture(kind, aggregate, version, producer, payload):
    """Local operator publishes a synthetic partner envelope; never given to Java runtime."""
    event = dict(event_id=str(uuid.uuid4()), event_type=kind, schema_version=1,
                 aggregate_type='deletion' if kind.startswith('domain.') else 'trip',
                 aggregate_id=str(aggregate), aggregate_version=version,
                 occurred_at=datetime.now(timezone.utc).isoformat(), producer=producer,
                 correlation_id=str(uuid.uuid4()), causation_id=None,
                 traceparent='00-0123456789abcdef0123456789abcdef-0123456789abcdef-01', payload=payload)
    schema = json.loads((CONTRACTS / ('events/' + kind + '.schema.json')).read_text(encoding='utf-8'))
    Draft202012Validator(schema, format_checker=FormatChecker()).validate(event)
    authorization = base64.b64encode(('platform_admin:' + environment()['BROKER_ADMIN_PASSWORD']).encode()).decode()
    body = dict(properties=dict(content_type='application/json', delivery_mode=2, message_id=event['event_id']),
                routing_key=kind, payload=json.dumps(event), payload_encoding='string')
    req = Request('http://127.0.0.1:55673/api/exchanges/smarttravel/identity.inbound/publish',
                  data=json.dumps(body).encode(), headers={'Content-Type':'application/json','Authorization':'Basic ' + authorization}, method='POST')
    with urlopen(req, timeout=5) as response:
        assert json.load(response)['routed'] is True
    return event


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
    parser.add_argument('--transport', action='store_true', help='Verify live broker delivery, mail and five partner deletion acknowledgements')
    parser.add_argument('--jar', type=Path, default=SERVICE / 'target/identity-service-0.0.1-SNAPSHOT.jar')
    args = parser.parse_args()
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    env = local.app_environment(port, fixtures=True, transport=args.transport, notification_email=args.transport)
    # This probe exercises the verification email flow even when dev sign-up skips it.
    env['IDENTITY_EMAIL_VERIFICATION_REQUIRED'] = 'true'
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
                         'IDENTITY_FIXTURE_PASSWORD','IDENTITY_FIXTURES_ENABLED','IDENTITY_TRANSPORT_ENABLED',
                         'IDENTITY_NOTIFICATION_EMAIL_ENABLED','IDENTITY_EMAIL_VERIFICATION_REQUIRED','BROKER_HOST','BROKER_PORT','BROKER_USERNAME','BROKER_PASSWORD','BROKER_VHOST']
            command = ['docker','run','--rm','--name',name,'--network',dependency_network(),
                       '-p',f'127.0.0.1:{port}:8101','-v',f'{keys.as_posix()}:/run/identity/keys.json:ro']
            for key in variables:
                command += ['-e',key]
            command += [args.image]
        else:
            command = ['java','-jar',str(args.jar.resolve())]
        process = subprocess.Popen(command, cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT)
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
            if args.transport:
                trip = str(uuid.uuid4())
                publish_fixture('trip.changed.v1', trip, 1, 'trip',
                                dict(trip_id=trip,user_id=profile['user_id'],change_kind='UPDATED',version=1))
                notification = None
                for _ in range(30):
                    status, inbox = request(base,'/api/v1/me/notifications',token=pair['access_token'])
                    assert status == 200; validate('/api/v1/me/notifications','GET',status,inbox)
                    if inbox['items']:
                        notification = inbox['items'][0]; break
                    time.sleep(1)
                assert notification, 'Broker listener did not create a notification'
                status, read = request(base,'/api/v1/me/notifications/' + notification['notification_id'] + '/read',
                                       'PATCH',token=pair['access_token'],headers={'Idempotency-Key':secrets.token_hex(16)})
                assert status == 200; validate('/api/v1/me/notifications/{notification_id}/read','PATCH',status,read)
                for _ in range(30):
                    delivery = sql(environment(),'identity',f"SELECT status FROM identity.notification_deliveries WHERE notification_id='{notification['notification_id']}' AND channel='EMAIL';").stdout.strip()
                    if delivery == 'SENT': break
                    time.sleep(1)
                assert delivery == 'SENT', 'Notification email was not delivered to SMTP sink'
            status, sessions = request(base,'/api/v1/me/sessions',token=pair['access_token'])
            assert status == 200; validate('/api/v1/me/sessions','GET',status,sessions)
            status, renewed = request(base,'/api/v1/auth/refresh','POST',dict(refresh_token=pair['refresh_token']))
            assert status == 200; validate('/api/v1/auth/refresh','POST',status,renewed)
            status, body = request(base,'/api/v1/auth/logout','POST',dict(refresh_token=renewed['refresh_token']),token=renewed['access_token'])
            assert status == 204; validate('/api/v1/auth/logout','POST',status,body)
            status, body = request(base,'/api/v1/me',token=renewed['access_token'])
            assert status == 401; validate('/api/v1/me','GET',status,body)
            if args.transport:
                status, final_pair = request(base,'/api/v1/auth/login','POST',dict(email=email,password=password))
                assert status == 200
                status, deletion = request(base,'/api/v1/me/deletion-requests','POST',dict(policy_version=1),
                                           token=final_pair['access_token'],headers={'Idempotency-Key':secrets.token_hex(16)})
                assert status == 202; validate('/api/v1/me/deletion-requests','POST',status,deletion)
                request_id = deletion['request_id']
                for service in ['catalog','community','trip','ingestion']:
                    publish_fixture('domain.user-data-deleted.v1',request_id,1,service,
                                    dict(deletion_request_id=request_id,service=service,status='COMPLETED',artifact_handling='synthetic smoke fixture erased'))
                for _ in range(30):
                    count = sql(environment(),'identity',f"SELECT count(*) FROM identity.data_deletion_acks WHERE deletion_request_id='{request_id}' AND status='COMPLETED';").stdout.strip()
                    if count == '5': break
                    time.sleep(1)
                assert count == '5'
                assert sql(environment(),'identity',f"SELECT status FROM identity.data_deletion_requests WHERE deletion_request_id='{request_id}';").stdout.strip() != 'COMPLETED'
                publish_fixture('domain.user-data-deleted.v1',request_id,1,'intelligence',
                                dict(deletion_request_id=request_id,service='intelligence',status='COMPLETED',artifact_handling='synthetic smoke fixture erased'))
                for _ in range(30):
                    state = sql(environment(),'identity',f"SELECT status FROM identity.data_deletion_requests WHERE deletion_request_id='{request_id}';").stdout.strip()
                    if state == 'COMPLETED': break
                    time.sleep(1)
                assert state == 'COMPLETED'
            events = sql(environment(),'identity',f"SELECT payload::text FROM identity.outbox_events WHERE aggregate_id='{profile['user_id']}' ORDER BY aggregate_version;").stdout.splitlines()
            assert len(events) == (5 if args.transport else 3)
            for row in events:
                event = json.loads(row)
                schema = json.loads((CONTRACTS / ('events/'+event['event_type']+'.schema.json')).read_text(encoding='utf-8'))
                Draft202012Validator(schema, format_checker=FormatChecker()).validate(event)
                assert not any(key in event['payload'] for key in ['email','password','token','password_hash'])
            print('PASS live Identity: health, real SMTP verification, auth/profile/preferences/options/session/JWKS schemas, consent/idempotency, revocation, ' + str(len(events)) + ' user event snapshots')
            if args.transport:
                deletion_events = sql(environment(),'identity',f"SELECT payload::text FROM identity.outbox_events WHERE aggregate_id='{request_id}';").stdout.splitlines()
                assert len(deletion_events) == 1
                event = json.loads(deletion_events[0])
                schema = json.loads((CONTRACTS / ('events/'+event['event_type']+'.schema.json')).read_text(encoding='utf-8'))
                Draft202012Validator(schema, format_checker=FormatChecker()).validate(event)
                print('PASS live transport: broker notification, EMAIL SMTP, read, tombstone/revocation, missing ack stays pending, six acknowledgements complete, six outbound schemas')
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
