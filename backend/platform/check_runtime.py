"""Non-destructive P00 local DB probes; requires Compose password environment.
Does not start/stop containers or print secrets. No production credentials.
"""
import subprocess
from pathlib import Path

COMPOSE = str(Path(__file__).with_name('compose.p00.yaml'))
BASE = ['docker', 'compose', '-f', COMPOSE]

def run(args, stdin=None):
    result = subprocess.run(BASE + args, input=stdin, text=True, capture_output=True, check=True)
    print(result.stdout.strip())
    return result.stdout

for service, user, db in [
    ('catalog-db', 'catalog_local', 'catalog_db'),
    ('identity-db', 'identity_local', 'identity_db'),
    ('trip-db', 'trip_local', 'trip_db'),
    ('ingestion-db', 'ingestion_local', 'ingestion_db'),
    ('intelligence-db', 'intelligence_local', 'intelligence_db')]:
    output = run(['exec', '-T', service, 'psql', '-U', user, '-d', db, '-v', 'ON_ERROR_STOP=1', '-tAc', 'SELECT current_database();'])
    assert output.strip() == db
run(['exec', '-T', 'catalog-db', 'psql', '-U', 'catalog_local', '-d', 'catalog_db', '-v', 'ON_ERROR_STOP=1', '-c', "CREATE EXTENSION IF NOT EXISTS postgis; DO $$ BEGIN IF NOT ST_DWithin(ST_SetSRID(ST_MakePoint(106.66,10.76),4326)::geography, ST_SetSRID(ST_MakePoint(106.6601,10.7601),4326)::geography,100) THEN RAISE EXCEPTION 'Spatial probe failed'; END IF; END $$;"])
run(['exec', '-T', 'intelligence-db', 'psql', '-U', 'intelligence_local', '-d', 'intelligence_db', '-v', 'ON_ERROR_STOP=1', '-c', "CREATE EXTENSION IF NOT EXISTS vector; DO $$ BEGIN IF ('[1,0,0]'::vector <=> '[1,0,0]'::vector) <> 0 THEN RAISE EXCEPTION 'Vector probe failed'; END IF; END $$;"])
probe = Path(__file__).with_name('mongo_transaction_probe.js').read_text(encoding='utf-8')
output = run(['exec', '-T', 'community-db', 'mongosh', '--quiet', '--eval', probe])
assert 'PASS MongoDB' in output
for name in ['identity', 'catalog', 'community', 'trip', 'ingestion', 'intelligence']:
    output = run(['exec', '-T', f'{name}-cache', 'redis-cli', 'PING'])
    assert output.strip() == 'PONG'
print('PASS: six domain database endpoints, PostGIS, pgvector, MongoDB commit/rollback and six separate Redis services.')
