-- P01 baseline adapted from plan/database/sql/ingestion.sql.
CREATE SCHEMA ingestion;

CREATE TABLE ingestion.data_sources (
  source_id uuid PRIMARY KEY,
  code varchar(64) NOT NULL UNIQUE,
  name varchar(160) NOT NULL,
  source_type varchar(20) NOT NULL CHECK (source_type IN ('API','FILE','MANUAL','PARTNER')),
  license_terms text NOT NULL,
  license_version varchar(80) NOT NULL,
  allow_storage boolean NOT NULL DEFAULT false,
  allow_training boolean NOT NULL DEFAULT false,
  refresh_policy jsonb NOT NULL DEFAULT '{}',
  credential_secret_ref text, -- reference only, never the secret value
  last_sync_at timestamptz,
  status varchar(16) NOT NULL DEFAULT 'DISABLED' CHECK (status IN ('ACTIVE','DISABLED','REVOKED')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ingestion.import_jobs (
  job_id uuid PRIMARY KEY,
  source_id uuid NOT NULL REFERENCES ingestion.data_sources(source_id),
  idempotency_key varchar(120) NOT NULL,
  mode varchar(16) NOT NULL CHECK (mode IN ('FULL','INCREMENTAL','REPLAY')),
  status varchar(16) NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','RUNNING','SUCCEEDED','PARTIAL','FAILED','CANCELLED')),
  cursor_before jsonb,
  cursor_after jsonb,
  requested_by uuid, -- external Identity admin or NULL for scheduler
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  ended_at timestamptz,
  error_summary text,
  UNIQUE (source_id, idempotency_key),
  UNIQUE (job_id, source_id),
  CHECK (ended_at IS NULL OR (started_at IS NOT NULL AND ended_at >= started_at))
);

CREATE TABLE ingestion.raw_records (
  raw_id uuid PRIMARY KEY,
  source_id uuid NOT NULL REFERENCES ingestion.data_sources(source_id),
  external_id varchar(240) NOT NULL,
  first_job_id uuid NOT NULL,
  payload jsonb NOT NULL,
  source_updated_at timestamptz,
  content_hash varchar(64) NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  UNIQUE (source_id, external_id, content_hash),
  UNIQUE (raw_id, source_id),
  FOREIGN KEY (first_job_id, source_id) REFERENCES ingestion.import_jobs(job_id, source_id)
);

CREATE TABLE ingestion.source_place_links (
  link_id uuid PRIMARY KEY,
  source_id uuid NOT NULL REFERENCES ingestion.data_sources(source_id),
  external_id varchar(240) NOT NULL,
  place_id uuid NOT NULL, -- external Catalog
  last_hash varchar(64) NOT NULL,
  last_source_updated_at timestamptz,
  catalog_version bigint NOT NULL CHECK (catalog_version > 0),
  confidence numeric(5,4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, external_id)
);

CREATE TABLE ingestion.match_candidates (
  candidate_id uuid PRIMARY KEY,
  raw_id uuid NOT NULL REFERENCES ingestion.raw_records(raw_id),
  place_id uuid NOT NULL, -- external Catalog candidate
  score numeric(5,4) NOT NULL CHECK (score BETWEEN 0 AND 1),
  evidence jsonb NOT NULL,
  decision varchar(16) NOT NULL DEFAULT 'PENDING' CHECK (decision IN ('PENDING','ACCEPTED','REJECTED')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  UNIQUE (raw_id, place_id)
);

CREATE TABLE ingestion.import_items (
  import_item_id uuid PRIMARY KEY,
  job_id uuid NOT NULL,
  source_id uuid NOT NULL,
  raw_id uuid NOT NULL,
  command_id uuid NOT NULL UNIQUE,
  operation varchar(16) NOT NULL CHECK (operation IN ('CREATE','UPDATE','LINK','SKIP')),
  status varchar(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','NEEDS_REVIEW','SENT','APPLIED','DUPLICATE','SKIPPED','FAILED')),
  proposed_place_id uuid, -- stable UUID for CREATE retries, external Catalog
  normalized_payload jsonb NOT NULL,
  expected_catalog_version bigint,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  error_code varchar(64),
  error_detail text,
  resulting_place_id uuid,
  resulting_catalog_version bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, raw_id),
  FOREIGN KEY (job_id, source_id) REFERENCES ingestion.import_jobs(job_id, source_id),
  FOREIGN KEY (raw_id, source_id) REFERENCES ingestion.raw_records(raw_id, source_id)
);

CREATE UNIQUE INDEX one_active_job_source_idx ON ingestion.import_jobs(source_id) WHERE status IN ('QUEUED','RUNNING');
CREATE INDEX import_job_history_idx ON ingestion.import_jobs(source_id, created_at DESC);
CREATE INDEX raw_source_seen_idx ON ingestion.raw_records(source_id, last_seen_at);
CREATE INDEX source_link_place_idx ON ingestion.source_place_links(place_id);
CREATE UNIQUE INDEX one_accepted_match_idx ON ingestion.match_candidates(raw_id) WHERE decision = 'ACCEPTED';
CREATE INDEX match_review_idx ON ingestion.match_candidates(decision, raw_id);
CREATE INDEX import_retry_idx ON ingestion.import_items(next_attempt_at, import_item_id) WHERE status IN ('PENDING','SENT','FAILED');
CREATE INDEX import_status_idx ON ingestion.import_items(job_id, status);

-- Infrastructure tables local to this service; no cross-database access.
CREATE TABLE ingestion.outbox_events (
  event_id uuid PRIMARY KEY,
  aggregate_type varchar(80) NOT NULL,
  aggregate_id varchar(160) NOT NULL,
  aggregate_version bigint NOT NULL CHECK (aggregate_version > 0),
  event_type varchar(120) NOT NULL,
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ingestion.inbox_events (
  consumer_name varchar(100) NOT NULL,
  event_id uuid NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer_name, event_id)
);
CREATE TABLE ingestion.audit_logs (
  audit_id uuid PRIMARY KEY,
  actor_id uuid,
  actor_type varchar(20) NOT NULL,
  entity_type varchar(80) NOT NULL,
  entity_id varchar(160) NOT NULL,
  action varchar(80) NOT NULL,
  old_value jsonb,
  new_value jsonb,
  correlation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ingestion.idempotency_records (
  scope varchar(100) NOT NULL,
  actor_key varchar(160) NOT NULL,
  idempotency_key varchar(160) NOT NULL,
  request_hash varchar(64) NOT NULL,
  response_status smallint NOT NULL CHECK (response_status BETWEEN 100 AND 599),
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (scope, actor_key, idempotency_key),
  CHECK (expires_at > created_at)
);
CREATE INDEX outbox_pending_idx ON ingestion.outbox_events(available_at, occurred_at) WHERE published_at IS NULL;
CREATE INDEX audit_entity_idx ON ingestion.audit_logs(entity_type, entity_id, created_at);
CREATE INDEX idempotency_expiry_idx ON ingestion.idempotency_records(expires_at);
