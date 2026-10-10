#!/bin/sh
# Executed once by the PostgreSQL image, against NEW P01 volumes only.
set -eu
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=ON_ERROR_STOP=1 \
  --set=database="$POSTGRES_DB" --set=runtime="${SERVICE}_runtime" \
  --set=migrator="${SERVICE}_migrator" --set=runtime_password="$RUNTIME_PASSWORD" \
  --set=migration_password="$MIGRATION_PASSWORD" <<'SQL'
REVOKE ALL ON DATABASE :"database" FROM PUBLIC;
REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;
REVOKE CONNECT ON DATABASE template1 FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE ROLE :"migrator" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'migration_password';
CREATE ROLE :"runtime" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'runtime_password';
GRANT CONNECT, CREATE ON DATABASE :"database" TO :"migrator";
GRANT CONNECT ON DATABASE :"database" TO :"runtime";
GRANT USAGE, CREATE ON SCHEMA public TO :"migrator";
SQL
# Extensions are platform-owned, never created by a runtime identity.
if [ "$SERVICE" = catalog ]; then
  psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=ON_ERROR_STOP=1 -c 'CREATE EXTENSION IF NOT EXISTS postgis;'
fi
if [ "$SERVICE" = intelligence ]; then
  psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=ON_ERROR_STOP=1 -c 'CREATE EXTENSION IF NOT EXISTS vector;'
fi
