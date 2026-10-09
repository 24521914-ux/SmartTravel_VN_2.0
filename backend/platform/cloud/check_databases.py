"""Read-only cloud preflight. Never print connection strings or exception details."""
import os
import sys
from urllib.parse import parse_qs, urlsplit

import psycopg
from pymongo import MongoClient

SERVICES = ('identity', 'catalog', 'trip', 'ingestion', 'intelligence')


def check_postgres(service):
    prefix = service.upper()
    url = os.environ[prefix + '_DB_URL']
    if not url.startswith('jdbc:postgresql://'):
        raise ValueError('Expected JDBC PostgreSQL URL')
    parsed = urlsplit(url[5:])
    if parsed.username or parsed.password:
        raise ValueError('Credentials must be separate')
    options = parse_qs(parsed.query)
    if options.get('sslmode') != ['verify-full']:
        raise ValueError('Require verified TLS')
    if '-pooler.' in (parsed.hostname or ''):
        raise ValueError('Use direct Neon endpoint for migrations')
    with psycopg.connect(
        host=parsed.hostname, port=parsed.port or 5432,
        dbname=parsed.path.lstrip('/'), user=os.environ[prefix + '_DB_USER'],
        password=os.environ[prefix + '_DB_PASSWORD'], sslmode='verify-full',
        sslrootcert=options.get('sslrootcert', ['/etc/ssl/certs/ca-certificates.crt'])[0],
        connect_timeout=30, autocommit=True,
    ) as conn:
        with conn.cursor() as cursor:
            cursor.execute('SELECT 1')
            extension = {'catalog': 'postgis', 'intelligence': 'vector'}.get(service)
            if extension:
                cursor.execute('SELECT 1 FROM pg_extension WHERE extname = %s', (extension,))
                if not cursor.fetchone():
                    raise ValueError('Required extension not enabled')


def check_mongo():
    uri = os.environ['MONGODB_URI']
    if not uri.startswith('mongodb+srv://'):
        raise ValueError('Expected Atlas SRV URI')
    options = parse_qs(urlsplit(uri).query)
    for key, values in options.items():
        key = key.lower()
        if (key in ('tls', 'ssl') and values[0].lower() == 'false') or (
            key in ('tlsinsecure', 'tlsallowinvalidcertificates', 'tlsallowinvalidhostnames')
            and values[0].lower() == 'true'
        ):
            raise ValueError('TLS verification cannot be disabled')
    with MongoClient(uri, tls=True, serverSelectionTimeoutMS=30000, connectTimeoutMS=30000) as client:
        database = client.get_default_database()
        database.command('ping')
        # A read against the target DB also checks its authorization.
        database.list_collection_names()
        hello = client.admin.command('hello')
        if not (hello.get('setName') or hello.get('msg') == 'isdbgrid'):
            raise ValueError('Transaction-capable topology required')
        if hello.get('logicalSessionTimeoutMinutes') is None:
            raise ValueError('Sessions required')


def main():
    failed = False
    for service in (*SERVICES, 'community'):
        try:
            check_mongo() if service == 'community' else check_postgres(service)
            print(f'{service}: PASS (connection/TLS and prerequisites)', flush=True)
        except Exception as error:
            failed = True
            print(f'{service}: FAIL ({type(error).__name__}); check credentials, network, TLS, extensions and DB permissions. Details hidden to protect secrets.', flush=True)
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
