-- Consumer ordering is local to each service's deletion acknowledgement stream.
ALTER TABLE identity.data_deletion_acks ADD COLUMN source_version bigint NOT NULL DEFAULT 0 CHECK(source_version>=0);
