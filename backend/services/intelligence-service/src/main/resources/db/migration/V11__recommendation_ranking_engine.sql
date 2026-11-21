-- V11: Modular Hybrid Recommendation Ranking Engine, Versioned Configs,
-- Cohort Snapshots, Item-based CF Artifacts, Evaluation/Tuning, and Impressions/Attribution.

CREATE TABLE intelligence.ranking_config_versions (
  config_version_id uuid PRIMARY KEY,
  version_tag varchar(80) NOT NULL UNIQUE,
  name varchar(120) NOT NULL,
  description text,
  weights jsonb NOT NULL,
  sub_params jsonb NOT NULL,
  scorer_versions jsonb NOT NULL,
  lifecycle_status varchar(16) NOT NULL DEFAULT 'DRAFT'
    CHECK (lifecycle_status IN ('DRAFT','VALIDATED','ACTIVE','INACTIVE')),
  quality_status varchar(24) NOT NULL DEFAULT 'UNVALIDATED'
    CHECK (quality_status IN ('UNVALIDATED','QUALITY_PENDING','PASSED','FAILED')),
  config_checksum varchar(64) NOT NULL,
  mutation_version bigint NOT NULL DEFAULT 1 CHECK (mutation_version > 0),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE intelligence.cohort_stat_snapshots (
  snapshot_id uuid PRIMARY KEY,
  version_tag varchar(80) NOT NULL UNIQUE,
  global_rating_prior double precision,
  global_rating_sample integer NOT NULL DEFAULT 0 CHECK (global_rating_sample >= 0),
  global_pop_p95 double precision,
  global_pop_sample integer NOT NULL DEFAULT 0 CHECK (global_pop_sample >= 0),
  cohort_stats jsonb NOT NULL DEFAULT '{}',
  window_days integer NOT NULL DEFAULT 30 CHECK (window_days > 0),
  min_sample integer NOT NULL DEFAULT 5 CHECK (min_sample > 0),
  checksum varchar(64) NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE TABLE intelligence.cf_build_jobs (
  job_id uuid PRIMARY KEY,
  dataset_version_id uuid REFERENCES intelligence.dataset_versions(dataset_version_id),
  status varchar(16) NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED')),
  params jsonb NOT NULL DEFAULT '{}',
  code_revision varchar(120) NOT NULL,
  dataset_checksum varchar(64),
  cutoff_at timestamptz NOT NULL,
  artifact_id uuid,
  logs_object_key text,
  error_code varchar(80),
  error_message text,
  progress_pct smallint NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  started_at timestamptz,
  ended_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  mutation_version bigint NOT NULL DEFAULT 1 CHECK (mutation_version > 0),
  CHECK (ended_at IS NULL OR (started_at IS NOT NULL AND ended_at >= started_at))
);

CREATE TABLE intelligence.cf_artifacts (
  artifact_id uuid PRIMARY KEY,
  job_id uuid REFERENCES intelligence.cf_build_jobs(job_id),
  version_tag varchar(80) NOT NULL UNIQUE,
  artifact_object_key text NOT NULL,
  checksum varchar(64) NOT NULL,
  dataset_checksum varchar(64) NOT NULL,
  params jsonb NOT NULL DEFAULT '{}',
  cutoff_at timestamptz NOT NULL,
  user_count integer NOT NULL DEFAULT 0 CHECK (user_count >= 0),
  item_count integer NOT NULL DEFAULT 0 CHECK (item_count >= 0),
  edge_count integer NOT NULL DEFAULT 0 CHECK (edge_count >= 0),
  source_lineage jsonb NOT NULL DEFAULT '[]',
  consent_lineage jsonb NOT NULL DEFAULT '{}',
  lifecycle_status varchar(16) NOT NULL DEFAULT 'DRAFT'
    CHECK (lifecycle_status IN ('DRAFT','VALIDATED','ACTIVE','INACTIVE','REVOKED')),
  quality_status varchar(24) NOT NULL DEFAULT 'UNVALIDATED'
    CHECK (quality_status IN ('UNVALIDATED','QUALITY_PENDING','PASSED','FAILED')),
  is_demo_fixture boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  mutation_version bigint NOT NULL DEFAULT 1 CHECK (mutation_version > 0)
);

CREATE TABLE intelligence.eval_datasets (
  eval_dataset_id uuid PRIMARY KEY,
  name varchar(160) NOT NULL,
  dataset_kind varchar(32) NOT NULL
    CHECK (dataset_kind IN ('CATALOG_SNAPSHOT','JUDGMENT','INTERACTION')),
  provenance_tier varchar(32) NOT NULL
    CHECK (provenance_tier IN ('SYNTHETIC_FIXTURE','HUMAN_LABELED','REAL_BEHAVIORAL')),
  status varchar(16) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','FROZEN','REVOKED')),
  feature_snapshot_ref varchar(120),
  cutoff_at timestamptz,
  description text,
  query_count integer NOT NULL DEFAULT 0 CHECK (query_count >= 0),
  row_count integer NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  split_counts jsonb NOT NULL DEFAULT '{}',
  checksum varchar(64),
  artifact_object_key text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  frozen_at timestamptz,
  mutation_version bigint NOT NULL DEFAULT 1 CHECK (mutation_version > 0)
);

CREATE TABLE intelligence.eval_judgments (
  judgment_id uuid PRIMARY KEY,
  eval_dataset_id uuid NOT NULL REFERENCES intelligence.eval_datasets(eval_dataset_id) ON DELETE CASCADE,
  query_id varchar(120) NOT NULL,
  scenario_group varchar(120) NOT NULL,
  request_payload jsonb NOT NULL,
  place_id uuid NOT NULL,
  relevance_grade smallint NOT NULL CHECK (relevance_grade BETWEEN 0 AND 3),
  annotator varchar(120) NOT NULL,
  provenance varchar(64) NOT NULL,
  split varchar(16) NOT NULL CHECK (split IN ('TRAIN','VALIDATION','TEST')),
  feature_snapshot_ref varchar(120),
  judged_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  UNIQUE (eval_dataset_id, query_id, place_id)
);

CREATE TABLE intelligence.evaluation_runs (
  eval_run_id uuid PRIMARY KEY,
  eval_dataset_id uuid NOT NULL REFERENCES intelligence.eval_datasets(eval_dataset_id),
  config_version_id uuid REFERENCES intelligence.ranking_config_versions(config_version_id),
  cf_artifact_id uuid REFERENCES intelligence.cf_artifacts(artifact_id),
  cohort_snapshot_id uuid REFERENCES intelligence.cohort_stat_snapshots(snapshot_id),
  baseline_mode varchar(32) NOT NULL
    CHECK (baseline_mode IN ('BASIC_ONLY','FALLBACK_ONLY','CONTENT_CONTEXT','HYBRID_V1','CHALLENGER')),
  split varchar(16) NOT NULL CHECK (split IN ('VALIDATION','TEST','ALL')),
  status varchar(16) NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED')),
  provenance_tier varchar(32) NOT NULL,
  code_revision varchar(120) NOT NULL,
  dataset_checksum varchar(64),
  metrics jsonb NOT NULL DEFAULT '{}',
  slice_metrics jsonb NOT NULL DEFAULT '{}',
  methodology jsonb NOT NULL DEFAULT '{}',
  query_evaluated integer NOT NULL DEFAULT 0 CHECK (query_evaluated >= 0),
  query_excluded integer NOT NULL DEFAULT 0 CHECK (query_excluded >= 0),
  judged_coverage double precision,
  error_message text,
  created_by uuid,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE intelligence.ranking_deployments (
  deployment_id uuid PRIMARY KEY,
  use_case varchar(64) NOT NULL DEFAULT 'place_ranking',
  config_version_id uuid NOT NULL REFERENCES intelligence.ranking_config_versions(config_version_id),
  cohort_snapshot_id uuid REFERENCES intelligence.cohort_stat_snapshots(snapshot_id),
  cf_artifact_id uuid REFERENCES intelligence.cf_artifacts(artifact_id),
  scorer_versions jsonb NOT NULL,
  feature_schema_version integer NOT NULL DEFAULT 1,
  evaluation_run_id uuid REFERENCES intelligence.evaluation_runs(eval_run_id),
  quality_status varchar(24) NOT NULL DEFAULT 'UNVALIDATED'
    CHECK (quality_status IN ('UNVALIDATED','QUALITY_PENDING','PASSED','FAILED')),
  is_demo_activation boolean NOT NULL DEFAULT false,
  activated_by uuid,
  activated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  reason text NOT NULL,
  CHECK (deactivated_at IS NULL OR deactivated_at >= activated_at)
);

CREATE UNIQUE INDEX one_active_ranking_deployment_idx
  ON intelligence.ranking_deployments(use_case) WHERE deactivated_at IS NULL;

CREATE TABLE intelligence.tuning_jobs (
  tuning_job_id uuid PRIMARY KEY,
  eval_dataset_id uuid NOT NULL REFERENCES intelligence.eval_datasets(eval_dataset_id),
  base_config_version_id uuid NOT NULL REFERENCES intelligence.ranking_config_versions(config_version_id),
  split varchar(16) NOT NULL DEFAULT 'VALIDATION' CHECK (split IN ('VALIDATION')),
  strategy varchar(24) NOT NULL CHECK (strategy IN ('GRID','RANDOM')),
  seed bigint NOT NULL,
  max_trials integer NOT NULL CHECK (max_trials BETWEEN 1 AND 200),
  completed_trials integer NOT NULL DEFAULT 0 CHECK (completed_trials >= 0),
  status varchar(16) NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED')),
  search_space jsonb NOT NULL DEFAULT '{}',
  guardrails jsonb NOT NULL DEFAULT '{}',
  best_trial_id uuid,
  best_config_version_id uuid REFERENCES intelligence.ranking_config_versions(config_version_id),
  holdout_eval_run_id uuid REFERENCES intelligence.evaluation_runs(eval_run_id),
  is_demo_run boolean NOT NULL DEFAULT false,
  dataset_checksum varchar(64),
  code_revision varchar(120) NOT NULL,
  error_message text,
  created_by uuid,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE intelligence.tuning_trials (
  trial_id uuid PRIMARY KEY,
  tuning_job_id uuid NOT NULL REFERENCES intelligence.tuning_jobs(tuning_job_id) ON DELETE CASCADE,
  trial_no integer NOT NULL CHECK (trial_no > 0),
  candidate_weights jsonb NOT NULL,
  candidate_sub_params jsonb NOT NULL DEFAULT '{}',
  ndcg_at_10 double precision,
  precision_at_10 double precision,
  hard_violations integer NOT NULL DEFAULT 0 CHECK (hard_violations >= 0),
  catalog_coverage double precision,
  p95_latency_ms double precision,
  guardrails_passed boolean NOT NULL DEFAULT false,
  metrics jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tuning_job_id, trial_no)
);

CREATE TABLE intelligence.recommendation_impressions (
  impression_id uuid PRIMARY KEY,
  idempotency_key varchar(160) NOT NULL UNIQUE,
  request_id uuid NOT NULL REFERENCES intelligence.recommendation_requests(request_id) ON DELETE CASCADE,
  place_id uuid NOT NULL,
  rank smallint NOT NULL CHECK (rank > 0),
  user_id uuid,
  session_id uuid,
  consent_version bigint,
  is_admin_test boolean NOT NULL DEFAULT false,
  viewed_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE intelligence.recommendation_feedback (
  feedback_id uuid PRIMARY KEY,
  idempotency_key varchar(160) NOT NULL UNIQUE,
  request_id uuid NOT NULL REFERENCES intelligence.recommendation_requests(request_id) ON DELETE CASCADE,
  place_id uuid NOT NULL,
  rank smallint NOT NULL CHECK (rank > 0),
  action_type varchar(24) NOT NULL
    CHECK (action_type IN ('CLICK','ACCEPT','SKIP','ADD_TO_TRIP_CLICK','FAVORITE_CLICK')),
  user_id uuid,
  session_id uuid,
  consent_version bigint,
  is_admin_test boolean NOT NULL DEFAULT false,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

-- Extend recommendation_requests for full operational telemetry & version pinning.
ALTER TABLE intelligence.recommendation_requests
  ADD COLUMN IF NOT EXISTS ranking_config_version_id uuid REFERENCES intelligence.ranking_config_versions(config_version_id),
  ADD COLUMN IF NOT EXISTS deployment_id uuid REFERENCES intelligence.ranking_deployments(deployment_id),
  ADD COLUMN IF NOT EXISTS degraded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS degraded_reasons jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS candidate_count integer,
  ADD COLUMN IF NOT EXISTS returned_count integer,
  ADD COLUMN IF NOT EXISTS is_admin_test boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scorer_availability jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS effective_weights_summary jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS empty_reason varchar(64),
  ADD COLUMN IF NOT EXISTS debug_payload jsonb;

CREATE INDEX IF NOT EXISTS eval_judgments_dataset_query_idx
  ON intelligence.eval_judgments(eval_dataset_id, split, query_id);
CREATE INDEX IF NOT EXISTS evaluation_runs_dataset_idx
  ON intelligence.evaluation_runs(eval_dataset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tuning_trials_job_idx
  ON intelligence.tuning_trials(tuning_job_id, trial_no);
CREATE INDEX IF NOT EXISTS rec_impressions_request_idx
  ON intelligence.recommendation_impressions(request_id, place_id);
CREATE INDEX IF NOT EXISTS rec_impressions_time_idx
  ON intelligence.recommendation_impressions(received_at DESC) WHERE NOT is_admin_test;
CREATE INDEX IF NOT EXISTS rec_feedback_request_idx
  ON intelligence.recommendation_feedback(request_id, action_type);
CREATE INDEX IF NOT EXISTS rec_requests_telemetry_idx
  ON intelligence.recommendation_requests(created_at DESC) WHERE NOT is_admin_test;

-- Ensure runtime role has full access to all new tables.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  intelligence.ranking_config_versions,
  intelligence.cohort_stat_snapshots,
  intelligence.cf_build_jobs,
  intelligence.cf_artifacts,
  intelligence.eval_datasets,
  intelligence.eval_judgments,
  intelligence.evaluation_runs,
  intelligence.ranking_deployments,
  intelligence.tuning_jobs,
  intelligence.tuning_trials,
  intelligence.recommendation_impressions,
  intelligence.recommendation_feedback
TO intelligence_runtime;

-- Update actor identifier purge function to also anonymize new tables on user deletion.
CREATE OR REPLACE FUNCTION intelligence.purge_actor_identifiers(actor uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,intelligence AS $$
BEGIN
  DELETE FROM intelligence.interaction_rate_limits WHERE actor_key=actor::text;
  DELETE FROM intelligence.idempotency_records WHERE actor_key=actor::text;
  DELETE FROM intelligence.dataset_users WHERE user_id=actor;
  DELETE FROM intelligence.projection_versions WHERE aggregate_id=actor AND stream='user-status';
  UPDATE intelligence.dataset_versions SET created_by=NULL WHERE created_by=actor;
  UPDATE intelligence.model_deployments SET activated_by=NULL,reason='Deleted actor' WHERE activated_by=actor;
  UPDATE intelligence.ranking_config_versions SET created_by=NULL WHERE created_by=actor;
  UPDATE intelligence.cohort_stat_snapshots SET created_by=NULL WHERE created_by=actor;
  UPDATE intelligence.cf_build_jobs SET created_by=NULL WHERE created_by=actor;
  UPDATE intelligence.cf_artifacts SET created_by=NULL WHERE created_by=actor;
  UPDATE intelligence.eval_datasets SET created_by=NULL WHERE created_by=actor;
  UPDATE intelligence.evaluation_runs SET created_by=NULL WHERE created_by=actor;
  UPDATE intelligence.ranking_deployments SET activated_by=NULL WHERE activated_by=actor;
  UPDATE intelligence.tuning_jobs SET created_by=NULL WHERE created_by=actor;
  UPDATE intelligence.recommendation_impressions SET user_id=NULL WHERE user_id=actor;
  UPDATE intelligence.recommendation_feedback SET user_id=NULL WHERE user_id=actor;
  UPDATE intelligence.audit_logs SET actor_id=NULL,old_value=NULL,new_value=NULL,
    entity_id=CASE WHEN entity_id=actor::text THEN 'deleted-user' ELSE entity_id END
    WHERE actor_id=actor OR entity_id=actor::text;
END $$;
REVOKE ALL ON FUNCTION intelligence.purge_actor_identifiers(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION intelligence.purge_actor_identifiers(uuid) TO intelligence_runtime;

-- Seed initial engineering baseline Hybrid_v1 config & deployment (explicitly UNVALIDATED).
INSERT INTO intelligence.ranking_config_versions (
  config_version_id, version_tag, name, description, weights, sub_params, scorer_versions,
  lifecycle_status, quality_status, config_checksum
) VALUES (
  '00000000-0000-4000-8000-000000000101',
  'hybrid-baseline-v1',
  'Hybrid v1 Engineering Baseline',
  'Initial unoptimized engineering weights (B=0.20, C=0.45, F=0.10, X=0.25). Quality unvalidated until human-labeled benchmark evaluation passes.',
  '{"basic":0.20,"content":0.45,"collaborative":0.10,"context":0.25}'::jsonb,
  '{"rating_m":10.0,"rating_weight":0.60,"popularity_weight":0.40,"popularity_window_days":30,"min_observation_days":7,"cohort_min_sample":5,"distance_scale_km":5.0,"distance_weight":0.70,"weather_weight":0.30,"use_max_distance_as_scale":false,"cf_lambda":10.0,"cf_top_k":100,"cf_history_limit":50,"cf_favorite_weight":3.0,"cf_trip_weight":5.0,"candidate_cap":1000,"top_n_default":10,"top_n_max":50,"diversity_enabled":false,"unknown_price_policy":"EXCLUDE"}'::jsonb,
  '{"basic":"basic_v1","content":"content_v1","collaborative":"cf_item_v1","context":"context_v1","hybrid":"hybrid_v1"}'::jsonb,
  'ACTIVE',
  'UNVALIDATED',
  'b7a2c5a742b3c2c0e7a2b5d1f3a6d4e5a9b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5'
) ON CONFLICT (config_version_id) DO NOTHING;

INSERT INTO intelligence.ranking_deployments (
  deployment_id, use_case, config_version_id, scorer_versions, feature_schema_version,
  quality_status, is_demo_activation, reason
) VALUES (
  '00000000-0000-4000-8000-000000000201',
  'place_ranking',
  '00000000-0000-4000-8000-000000000101',
  '{"basic":"basic_v1","content":"content_v1","collaborative":"cf_item_v1","context":"context_v1","hybrid":"hybrid_v1"}'::jsonb,
  1,
  'UNVALIDATED',
  false,
  'Initial unvalidated engineering baseline deployment'
) ON CONFLICT (deployment_id) DO NOTHING;
