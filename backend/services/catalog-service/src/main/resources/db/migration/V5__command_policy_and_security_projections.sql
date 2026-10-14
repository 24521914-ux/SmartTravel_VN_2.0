-- Operational projections and field precedence; existing domain revisions stay immutable.
ALTER TABLE catalog.places ADD COLUMN field_precedence jsonb NOT NULL DEFAULT '{}';
ALTER TABLE catalog.categories ADD COLUMN version bigint NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE catalog.business_place_claims ADD COLUMN version bigint NOT NULL DEFAULT 1 CHECK(version>0);
CREATE TABLE catalog.user_status_projections(user_id uuid PRIMARY KEY,status varchar(20) NOT NULL,source_version bigint NOT NULL CHECK(source_version>0),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE catalog.source_policy_projections(source_id uuid PRIMARY KEY,status varchar(20) NOT NULL,allow_storage boolean NOT NULL,source_version bigint NOT NULL CHECK(source_version>0),updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT,INSERT,UPDATE,DELETE ON catalog.user_status_projections,catalog.source_policy_projections TO catalog_runtime;
