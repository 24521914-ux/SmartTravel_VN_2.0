REVOKE UPDATE, DELETE, TRUNCATE ON trip.audit_logs FROM trip_runtime;
CREATE FUNCTION trip.purge_user_audit(actor uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,trip AS $$
BEGIN
  DELETE FROM trip.audit_logs WHERE actor_id=actor;
END $$;
REVOKE ALL ON FUNCTION trip.purge_user_audit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip.purge_user_audit(uuid) TO trip_runtime;
