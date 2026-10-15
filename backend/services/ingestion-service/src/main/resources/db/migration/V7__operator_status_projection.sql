CREATE TABLE ingestion.user_status (
    user_id uuid PRIMARY KEY,
    status varchar(16) NOT NULL CHECK (status IN ('ACTIVE','DISABLED','LOCKED','DELETED')),
    source_version bigint NOT NULL CHECK (source_version > 0)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON ingestion.user_status TO ingestion_runtime;
