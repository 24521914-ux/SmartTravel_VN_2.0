GRANT USAGE ON SCHEMA ingestion TO ingestion_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ingestion TO ingestion_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ingestion TO ingestion_runtime;
REVOKE UPDATE, DELETE, TRUNCATE ON ingestion.audit_logs FROM ingestion_runtime;
