GRANT USAGE ON SCHEMA identity TO identity_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA identity TO identity_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA identity TO identity_runtime;
REVOKE UPDATE, DELETE, TRUNCATE ON identity.audit_logs FROM identity_runtime;
-- No grants on public.flyway_schema_history or platform_probe.
