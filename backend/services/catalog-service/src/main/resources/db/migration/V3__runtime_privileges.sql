GRANT USAGE ON SCHEMA catalog TO catalog_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA catalog TO catalog_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA catalog TO catalog_runtime;
REVOKE UPDATE, DELETE, TRUNCATE ON catalog.audit_logs FROM catalog_runtime;
