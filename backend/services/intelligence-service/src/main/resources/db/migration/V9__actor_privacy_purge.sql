-- Retain licensed public artifacts and operational audit facts without deleted actor identifiers.
ALTER TABLE intelligence.model_deployments ALTER COLUMN activated_by DROP NOT NULL;
CREATE FUNCTION intelligence.purge_actor_identifiers(actor uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,intelligence AS $$
BEGIN
  DELETE FROM intelligence.interaction_rate_limits WHERE actor_key=actor::text;
  DELETE FROM intelligence.idempotency_records WHERE actor_key=actor::text;
  DELETE FROM intelligence.dataset_users WHERE user_id=actor;
  DELETE FROM intelligence.projection_versions WHERE aggregate_id=actor AND stream='user-status';
  UPDATE intelligence.dataset_versions SET created_by=NULL WHERE created_by=actor;
  UPDATE intelligence.model_deployments SET activated_by=NULL,reason='Deleted actor' WHERE activated_by=actor;
  UPDATE intelligence.audit_logs SET actor_id=NULL,old_value=NULL,new_value=NULL,
    entity_id=CASE WHEN entity_id=actor::text THEN 'deleted-user' ELSE entity_id END
    WHERE actor_id=actor OR entity_id=actor::text;
END $$;
REVOKE ALL ON FUNCTION intelligence.purge_actor_identifiers(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION intelligence.purge_actor_identifiers(uuid) TO intelligence_runtime;
