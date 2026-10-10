-- Additive P01 workflow migration; never modify V1-V5.
UPDATE identity.user_preferences SET budget_level='MID' WHERE budget_level IS NULL;
ALTER TABLE identity.user_preferences ALTER COLUMN budget_level SET DEFAULT 'MID';
ALTER TABLE identity.user_preferences ALTER COLUMN budget_level SET NOT NULL;
ALTER TABLE identity.preference_options ADD COLUMN version bigint NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE identity.notifications ADD COLUMN version bigint NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE identity.data_deletion_requests ADD COLUMN version bigint NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE identity.outbox_events ADD COLUMN failed_at timestamptz;
CREATE TABLE identity.category_states (
 category_id uuid PRIMARY KEY, active boolean NOT NULL, version bigint NOT NULL CHECK(version>0)
);
CREATE TABLE identity.notification_streams (
 event_type varchar(120) NOT NULL, aggregate_id uuid NOT NULL, version bigint NOT NULL,
 PRIMARY KEY(event_type,aggregate_id)
);
GRANT SELECT,INSERT,UPDATE,DELETE ON identity.category_states,identity.notification_streams TO identity_runtime;
-- Audit remains append-only to the runtime; retention uses a separately authorized maintenance job.
