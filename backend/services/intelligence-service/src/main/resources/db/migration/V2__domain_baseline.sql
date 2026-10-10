-- P01 baseline adapted from plan/database/sql/intelligence.sql. Vector index deferred until Basic gate.
CREATE SCHEMA intelligence;

CREATE TABLE intelligence.interactions (
  interaction_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id uuid NOT NULL UNIQUE,
  user_id uuid, -- external Identity; NULL for guest
  place_id uuid, -- external Catalog
  destination_id uuid, -- external Catalog; optional, unlike overly strict source FK
  event_type varchar(24) NOT NULL CHECK (event_type IN ('SEARCH','PLACE_VIEW','FAVORITE_ADDED','FAVORITE_REMOVED','REVIEW_CREATED','TRIP_ITEM_ADDED')),
  session_id uuid NOT NULL, -- pseudonymous analytics session, not authentication session
  consent_version bigint,
  context jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  CHECK (event_type = 'SEARCH' OR place_id IS NOT NULL)
);

CREATE TABLE intelligence.user_feature_profiles (
  user_id uuid PRIMARY KEY, -- external Identity projection
  preferences jsonb NOT NULL,
  personalization_enabled boolean NOT NULL DEFAULT false,
  consent_version bigint NOT NULL CHECK (consent_version > 0),
  source_version bigint NOT NULL CHECK (source_version > 0),
  feature_version bigint NOT NULL DEFAULT 1 CHECK (feature_version > 0),
  as_of timestamptz NOT NULL
);

CREATE TABLE intelligence.place_features (
  place_id uuid PRIMARY KEY, -- external Catalog projection
  catalog_version bigint NOT NULL CHECK (catalog_version > 0),
  rating_version bigint NOT NULL DEFAULT 0 CHECK (rating_version >= 0),
  status varchar(16) NOT NULL CHECK (status IN ('DRAFT','PUBLISHED','HIDDEN','ARCHIVED')),
  features jsonb NOT NULL,
  content_hash varchar(64) NOT NULL,
  as_of timestamptz NOT NULL
);

CREATE TABLE intelligence.recommendation_requests (
  request_id uuid PRIMARY KEY,
  user_id uuid, -- external Identity or NULL for guest
  session_id uuid NOT NULL,
  mode varchar(12) NOT NULL CHECK (mode IN ('BASIC','MODEL','FALLBACK')),
  algorithm_version varchar(80) NOT NULL,
  model_version_id uuid, -- local FK added after model_versions below
  criteria jsonb NOT NULL,
  top_n smallint NOT NULL CHECK (top_n BETWEEN 1 AND 100),
  latency_ms integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
  fallback_reason varchar(100),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE intelligence.recommendation_results (
  request_id uuid NOT NULL REFERENCES intelligence.recommendation_requests(request_id) ON DELETE CASCADE,
  place_id uuid NOT NULL, -- external Catalog
  rank smallint NOT NULL CHECK (rank > 0),
  score numeric(10,6) NOT NULL,
  explanation jsonb NOT NULL,
  catalog_version bigint NOT NULL CHECK (catalog_version > 0),
  PRIMARY KEY (request_id, place_id),
  UNIQUE (request_id, rank)
);

CREATE TABLE intelligence.dataset_versions (
  dataset_version_id uuid PRIMARY KEY,
  name varchar(120) NOT NULL,
  criteria jsonb NOT NULL,
  feature_schema_version varchar(40) NOT NULL,
  row_count bigint NOT NULL CHECK (row_count >= 0),
  artifact_object_key text NOT NULL,
  checksum varchar(64) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'READY' CHECK (status IN ('READY','REVOKED','DELETED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid -- external Identity admin
);

CREATE TABLE intelligence.dataset_sources (
  dataset_version_id uuid NOT NULL REFERENCES intelligence.dataset_versions(dataset_version_id),
  source_id uuid NOT NULL, -- external Ingestion
  source_version bigint NOT NULL CHECK (source_version > 0),
  license_version varchar(80) NOT NULL,
  allow_training_snapshot boolean NOT NULL CHECK (allow_training_snapshot),
  PRIMARY KEY (dataset_version_id, source_id)
);

CREATE TABLE intelligence.training_jobs (
  training_job_id uuid PRIMARY KEY,
  dataset_version_id uuid NOT NULL REFERENCES intelligence.dataset_versions(dataset_version_id),
  algorithm varchar(80) NOT NULL,
  params jsonb NOT NULL,
  code_revision varchar(80) NOT NULL,
  random_seed bigint NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED')),
  logs_object_key text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR (started_at IS NOT NULL AND ended_at >= started_at))
);

CREATE TABLE intelligence.model_versions (
  model_version_id uuid PRIMARY KEY,
  training_job_id uuid NOT NULL REFERENCES intelligence.training_jobs(training_job_id),
  model_name varchar(100) NOT NULL,
  version_no integer NOT NULL CHECK (version_no > 0),
  artifact_object_key text NOT NULL,
  checksum varchar(64) NOT NULL,
  metrics jsonb NOT NULL,
  feature_schema_version varchar(40) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'CANDIDATE' CHECK (status IN ('CANDIDATE','VALIDATED','REJECTED','REVOKED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (model_name, version_no)
);

CREATE TABLE intelligence.model_deployments (
  deployment_id uuid PRIMARY KEY,
  use_case varchar(64) NOT NULL,
  model_version_id uuid NOT NULL REFERENCES intelligence.model_versions(model_version_id),
  activated_by uuid NOT NULL, -- external Identity admin
  activated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  reason text NOT NULL,
  CHECK (deactivated_at IS NULL OR deactivated_at >= activated_at)
);

ALTER TABLE intelligence.recommendation_requests
  ADD CONSTRAINT recommendation_model_fk FOREIGN KEY (model_version_id) REFERENCES intelligence.model_versions(model_version_id);

CREATE INDEX interaction_user_time_idx ON intelligence.interactions(user_id, occurred_at DESC);
CREATE INDEX interaction_place_time_idx ON intelligence.interactions(place_id, occurred_at DESC);
CREATE INDEX interaction_time_brin_idx ON intelligence.interactions USING brin(occurred_at);
CREATE INDEX place_feature_status_idx ON intelligence.place_features(status, place_id);
CREATE INDEX recommendation_history_idx ON intelligence.recommendation_requests(user_id, created_at DESC);
CREATE INDEX dataset_source_idx ON intelligence.dataset_sources(source_id, dataset_version_id);
CREATE INDEX training_dataset_idx ON intelligence.training_jobs(dataset_version_id, created_at DESC);
CREATE INDEX model_training_idx ON intelligence.model_versions(training_job_id);
CREATE UNIQUE INDEX one_active_model_idx ON intelligence.model_deployments(use_case) WHERE deactivated_at IS NULL;
CREATE INDEX model_deployment_history_idx ON intelligence.model_deployments(model_version_id, activated_at DESC);

-- Infrastructure tables local to this service; no cross-database access.
CREATE TABLE intelligence.outbox_events (
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
CREATE TABLE intelligence.inbox_events (
  consumer_name varchar(100) NOT NULL,
  event_id uuid NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer_name, event_id)
);
CREATE TABLE intelligence.audit_logs (
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
CREATE TABLE intelligence.idempotency_records (
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
CREATE INDEX outbox_pending_idx ON intelligence.outbox_events(available_at, occurred_at) WHERE published_at IS NULL;
CREATE INDEX audit_entity_idx ON intelligence.audit_logs(entity_type, entity_id, created_at);
CREATE INDEX idempotency_expiry_idx ON intelligence.idempotency_records(expires_at);
