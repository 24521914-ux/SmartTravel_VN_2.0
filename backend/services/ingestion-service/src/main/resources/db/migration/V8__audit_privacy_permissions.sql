REVOKE UPDATE, DELETE, TRUNCATE ON ingestion.audit_logs FROM ingestion_runtime;
CREATE FUNCTION ingestion.purge_user_audit(actor uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ingestion AS $$
BEGIN
  DELETE FROM ingestion.audit_logs WHERE actor_id=actor;
END $$;
REVOKE ALL ON FUNCTION ingestion.purge_user_audit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ingestion.purge_user_audit(uuid) TO ingestion_runtime;
