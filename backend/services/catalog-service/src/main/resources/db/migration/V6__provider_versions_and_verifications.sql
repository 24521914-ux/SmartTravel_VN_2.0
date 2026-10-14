ALTER TABLE catalog.tags ADD COLUMN version bigint NOT NULL DEFAULT 1 CHECK(version>0), ADD COLUMN active boolean NOT NULL DEFAULT true;
ALTER TABLE catalog.amenities ADD COLUMN version bigint NOT NULL DEFAULT 1 CHECK(version>0), ADD COLUMN active boolean NOT NULL DEFAULT true;
ALTER TABLE catalog.business_members ADD COLUMN member_id uuid NOT NULL DEFAULT gen_random_uuid(), ADD COLUMN version bigint NOT NULL DEFAULT 1 CHECK(version>0);
CREATE UNIQUE INDEX business_member_id ON catalog.business_members(member_id);
ALTER TABLE catalog.change_requests ADD COLUMN version bigint NOT NULL DEFAULT 1 CHECK(version>0);
CREATE TABLE catalog.business_verifications(request_id uuid PRIMARY KEY,business_id uuid NOT NULL REFERENCES catalog.businesses(business_id),evidence_keys jsonb NOT NULL,status varchar(16) NOT NULL DEFAULT 'PENDING' CHECK(status IN('PENDING','APPROVED','REJECTED','REVOKED')),version bigint NOT NULL DEFAULT 1 CHECK(version>0),submitted_by uuid NOT NULL,reviewed_by uuid,reason text,created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT,INSERT,UPDATE,DELETE ON catalog.business_verifications TO catalog_runtime;
