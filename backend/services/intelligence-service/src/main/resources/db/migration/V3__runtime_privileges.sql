GRANT USAGE ON SCHEMA intelligence TO intelligence_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA intelligence TO intelligence_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA intelligence TO intelligence_runtime;
REVOKE UPDATE, DELETE, TRUNCATE ON intelligence.audit_logs FROM intelligence_runtime;
