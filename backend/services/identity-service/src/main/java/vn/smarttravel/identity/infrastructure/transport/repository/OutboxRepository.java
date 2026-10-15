package vn.smarttravel.identity.infrastructure.transport.repository;

import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class OutboxRepository {
    private final JdbcTemplate db;
    public OutboxRepository(JdbcTemplate db) { this.db=db; }
    public List<Map<String,Object>> pending() {
        return db.queryForList("""
            SELECT event_id,event_type,payload::text FROM identity.outbox_events WHERE published_at IS NULL
            AND failed_at IS NULL AND available_at<=now() ORDER BY occurred_at,event_id LIMIT 10 FOR UPDATE SKIP LOCKED
            """);
    }
    public void published(UUID event) {
        db.update("UPDATE identity.outbox_events SET published_at=now(),attempts=attempts+1 WHERE event_id=?",event);
    }
    public void retry(UUID event) {
        db.update("""
            UPDATE identity.outbox_events SET attempts=attempts+1,
            available_at=now()+interval '1 second'*power(2,least(attempts,8)),
            failed_at=CASE WHEN attempts>=7 THEN now() ELSE NULL END WHERE event_id=?
            """,event);
    }
    public void auditReplay(String messageId) {
        db.update("""
            INSERT INTO identity.audit_logs(audit_id,actor_type,entity_type,entity_id,action)
            VALUES (?,'SYSTEM','inbox',?,'DLQ_REPLAY_REQUESTED')
            """,UUID.randomUUID(),messageId.length()>160?"invalid-id":messageId);
    }
    public boolean replay(UUID event) {
        int changed=db.update("UPDATE identity.outbox_events SET failed_at=NULL,attempts=0,available_at=now() WHERE event_id=? AND failed_at IS NOT NULL AND published_at IS NULL",event);
        if(changed==1) db.update("""
            INSERT INTO identity.audit_logs(audit_id,actor_type,entity_type,entity_id,action)
            VALUES (?,'SYSTEM','outbox',?,'OUTBOX_REPLAY_REQUESTED')
            """,UUID.randomUUID(),event.toString());
        return changed==1;
    }
}
