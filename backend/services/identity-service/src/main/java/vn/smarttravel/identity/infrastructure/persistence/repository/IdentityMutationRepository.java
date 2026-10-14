package vn.smarttravel.identity.infrastructure.persistence.repository;

import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class IdentityMutationRepository {
    private final JdbcTemplate db;
    public IdentityMutationRepository(JdbcTemplate db) { this.db = db; }

    public Map<String, Object> findIdempotency(String scope, String actor, String key) {
        db.update("DELETE FROM identity.idempotency_records WHERE scope=? AND actor_key=? AND idempotency_key=? AND expires_at<=now()", scope, actor, key);
        var rows = db.queryForList("SELECT request_hash,response_body::text FROM identity.idempotency_records WHERE scope=? AND actor_key=? AND idempotency_key=?", scope, actor, key);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public void remember(String scope, String actor, String key, String hash, String response, int status) {
        db.update("""
            INSERT INTO identity.idempotency_records(scope,actor_key,idempotency_key,request_hash,response_status,response_body,expires_at)
            VALUES (?,?,?,?,?,?::jsonb,now()+interval '24 hours')
            """, scope, actor, key, hash, status, response);
    }

    public void audit(UUID actor, UUID user, String action) {
        db.update("INSERT INTO identity.audit_logs(audit_id,actor_id,actor_type,entity_type,entity_id,action) VALUES (?,?,'USER','user',?,?)",
                UUID.randomUUID(), actor, user.toString(), action);
    }

    public void auditSystem(UUID user, String action) {
        db.update("INSERT INTO identity.audit_logs(audit_id,actor_type,entity_type,entity_id,action) VALUES (?,'SYSTEM','user',?,?)",
                UUID.randomUUID(),user.toString(),action);
    }

    public void event(UUID event, String aggregate, UUID user, long version, String type, String envelope) {
        db.update("INSERT INTO identity.outbox_events(event_id,aggregate_type,aggregate_id,aggregate_version,event_type,payload) VALUES (?,?,?,?,?,?::jsonb)",
                event, aggregate, user.toString(), version, type, envelope);
    }
}
