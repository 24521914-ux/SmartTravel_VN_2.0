ALTER TABLE ingestion.data_sources ADD COLUMN uri text NOT NULL DEFAULT 'fixture:unconfigured';
ALTER TABLE ingestion.import_jobs ADD COLUMN version bigint NOT NULL DEFAULT 1, ADD COLUMN fetch_complete boolean NOT NULL DEFAULT false, ADD COLUMN source_version bigint NOT NULL DEFAULT 1;
ALTER TABLE ingestion.import_items ADD COLUMN version bigint NOT NULL DEFAULT 1;
CREATE TABLE ingestion.source_checkpoints (source_id uuid PRIMARY KEY REFERENCES ingestion.data_sources(source_id), cursor_value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE ingestion.user_tombstones (user_id uuid PRIMARY KEY, deletion_request_id uuid NOT NULL, deleted_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ingestion TO ingestion_runtime;
