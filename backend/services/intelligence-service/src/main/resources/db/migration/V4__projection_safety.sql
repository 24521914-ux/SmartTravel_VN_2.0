-- Operational guardrails; V1-V3 remain immutable.
CREATE TABLE intelligence.source_policies (
 source_id uuid PRIMARY KEY, source_version bigint NOT NULL CHECK(source_version>0),
 license_version varchar(80) NOT NULL, allow_training boolean NOT NULL,
 status varchar(24) NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE intelligence.user_tombstones (user_id uuid PRIMARY KEY, deleted_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE intelligence.interaction_rate_limits (actor_key varchar(160) PRIMARY KEY, window_start timestamptz NOT NULL, count integer NOT NULL);
CREATE TABLE intelligence.dataset_users (dataset_version_id uuid REFERENCES intelligence.dataset_versions(dataset_version_id),user_id uuid NOT NULL,consent_version bigint NOT NULL,PRIMARY KEY(dataset_version_id,user_id));
CREATE TABLE intelligence.projection_versions (stream varchar(100) NOT NULL,aggregate_id uuid NOT NULL,version bigint NOT NULL,payload jsonb NOT NULL,PRIMARY KEY(stream,aggregate_id));
GRANT SELECT,INSERT,UPDATE,DELETE ON intelligence.source_policies,intelligence.user_tombstones,intelligence.interaction_rate_limits,intelligence.dataset_users,intelligence.projection_versions TO intelligence_runtime;
