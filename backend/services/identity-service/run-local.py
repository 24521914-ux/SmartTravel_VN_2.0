"""Standalone Identity with P01 PostgreSQL + Mailpit, persistent ignored local secrets.
Prepare: python backend/infra/p01.py up --service identity
Run: python backend/services/identity-service/run-local.py [--fixtures]
No credentials from the other services are passed to Java. This is LOCAL ONLY.
"""
import argparse
import base64
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
from cryptography.hazmat.primitives.asymmetric import rsa

SERVICE = Path(__file__).resolve().parent
ROOT = SERVICE.parents[2]
sys.path.insert(0, str(ROOT / 'backend/infra'))
from p01 import environment


def exclusive(path, text):
    with path.open('x', encoding='utf-8') as file:
        file.write(text)
    if os.name != 'nt':
        path.chmod(0o600)


def local_files():
    directory = SERVICE / '.local'
    directory.mkdir(exist_ok=True)
    if os.name != 'nt':
        directory.chmod(0o700)
    keys = directory / 'keys.json'
    config = directory / 'config.json'
    if not keys.exists():
        private = rsa.generate_private_key(public_exponent=65537, key_size=2048).private_numbers()
        public = private.public_numbers
        def encoded(value):
            return base64.urlsafe_b64encode(value.to_bytes((value.bit_length()+7)//8, 'big')).rstrip(b'=').decode()
        key = dict(kty='RSA', kid='p01-local-1', use='sig', alg='RS256',
                   **{name: encoded(value) for name, value in dict(n=public.n,e=public.e,d=private.d,
                     p=private.p,q=private.q,dp=private.dmp1,dq=private.dmq1,qi=private.iqmp).items()})
        exclusive(keys, json.dumps({'keys':[key]}))
    if not config.exists():
        exclusive(config, json.dumps(dict(mail_key=base64.b64encode(secrets.token_bytes(32)).decode(),
                                          fixture_password=secrets.token_urlsafe(24))))
    return keys, json.loads(config.read_text(encoding='utf-8'))


def app_environment(port=8101, fixtures=False):
    source = environment()
    env = {key:value for key,value in os.environ.items() if not any(marker in key for marker in
           ['PASSWORD','DB_','MONGODB_URI','IDENTITY_','JWT_','SECRET','TOKEN','MAIL_'])}
    keys, config = local_files()
    env.update(SPRING_PROFILES_ACTIVE='p01-local', PORT=str(port),
               DB_URL='jdbc:postgresql://127.0.0.1:56434/identity_db', DB_USER='identity_runtime',
               DB_PASSWORD=source['IDENTITY_RUNTIME_PASSWORD'], DB_MIGRATION_USER='identity_migrator',
               DB_MIGRATION_PASSWORD=source['IDENTITY_MIGRATION_PASSWORD'], DB_MIGRATION_ENABLED='true',
               JWT_ISSUER=f'http://localhost:{port}', JWT_AUDIENCE='identity',
               JWT_JWKS_URI=f'http://127.0.0.1:{port}/.well-known/jwks.json',
               IDENTITY_KEYS_FILE=str(keys), IDENTITY_ACTIVE_KID='p01-local-1', IDENTITY_MAIL_KEY=config['mail_key'],
               MAIL_HOST='127.0.0.1', MAIL_PORT='51025', IDENTITY_FIXTURE_PASSWORD=config['fixture_password'])
    env['IDENTITY_FIXTURES_ENABLED'] = str(fixtures).lower()
    return env


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--fixtures', action='store_true', help='Opt-in U1/U2/admin/business synthetic accounts')
    args = parser.parse_args()
    port = int(os.environ.get('PORT', '8101'))
    env = app_environment(port, args.fixtures)
    jar = SERVICE / 'target/identity-service-0.0.1-SNAPSHOT.jar'
    if not jar.exists():
        raise RuntimeError('Build Identity first; see README.md')
    print(f'Identity local: http://localhost:{port}; Mailpit: http://localhost:58025', flush=True)
    print('Local signing/mail/fixture secrets: identity-service/.local/ (ignored; never commit)', flush=True)
    process = subprocess.Popen(['java', '-jar', jar.name], cwd=jar.parent, env=env)
    try:
        code = process.wait()
        if code:
            raise RuntimeError(f'Identity exited with status {code}')
    except KeyboardInterrupt:
        process.terminate()
        try:
            process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            process.kill(); process.wait()


if __name__ == '__main__':
    main()
