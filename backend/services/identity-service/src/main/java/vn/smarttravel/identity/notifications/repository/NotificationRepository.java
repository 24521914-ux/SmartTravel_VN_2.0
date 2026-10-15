package vn.smarttravel.identity.notifications.repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class NotificationRepository {
    private final JdbcTemplate db;
    public NotificationRepository(JdbcTemplate db) { this.db=db; }

    public boolean claim(UUID event) {
        return db.update("INSERT INTO identity.inbox_events(consumer_name,event_id) VALUES ('identity.notifications',?) ON CONFLICT DO NOTHING",event)==1;
    }
    public boolean advance(String type, UUID aggregate, long version) {
        return db.update("""
            INSERT INTO identity.notification_streams(event_type,aggregate_id,version) VALUES (?,?,?)
            ON CONFLICT(event_type,aggregate_id) DO UPDATE SET version=excluded.version
            WHERE identity.notification_streams.version<excluded.version
            """,type,aggregate,version)==1;
    }
    public void create(UUID user, UUID event, String type, String payload) {
        UUID id=UUID.randomUUID();
        int inserted=db.update("""
            INSERT INTO identity.notifications(notification_id,user_id,source_event_id,notification_type,payload)
            VALUES (?,?,?,?,?::jsonb) ON CONFLICT(user_id,source_event_id,notification_type) DO NOTHING
            """,id,user,event,type,payload);
        if(inserted==1) {
            db.update("""
                INSERT INTO identity.notification_deliveries(delivery_id,notification_id,channel,status,sent_at)
                VALUES (?,?,'IN_APP','SENT',now())
                """,UUID.randomUUID(),id);
            db.update("INSERT INTO identity.notification_deliveries(delivery_id,notification_id,channel) VALUES (?,?,'EMAIL')",UUID.randomUUID(),id);
        }
    }
    public List<UUID> pendingRecipients() {
        return db.queryForList("""
            SELECT DISTINCT n.user_id FROM identity.notification_deliveries d JOIN identity.notifications n USING(notification_id)
            WHERE d.channel='EMAIL' AND d.status='PENDING' AND d.next_attempt_at<=now() ORDER BY n.user_id LIMIT 20
            """,UUID.class);
    }
    public List<Map<String,Object>> pendingEmail(UUID user) {
        return db.queryForList("""
            SELECT d.delivery_id,n.payload->>'title' AS title FROM identity.notification_deliveries d
            JOIN identity.notifications n USING(notification_id) WHERE n.user_id=? AND d.channel='EMAIL'
            AND d.status='PENDING' AND d.next_attempt_at<=now() ORDER BY d.next_attempt_at,d.delivery_id
            LIMIT 10 FOR UPDATE OF d SKIP LOCKED
            """,user);
    }
    public void emailSent(UUID id) {
        db.update("UPDATE identity.notification_deliveries SET status='SENT',attempts=attempts+1,sent_at=now(),provider_message_id=? WHERE delivery_id=?",id.toString(),id);
    }
    public void emailFailed(UUID id) {
        db.update("UPDATE identity.notification_deliveries SET status='FAILED' WHERE delivery_id=?",id);
    }
    public void emailRetry(UUID id) {
        db.update("""
            UPDATE identity.notification_deliveries SET attempts=attempts+1,
            status=CASE WHEN attempts>=4 THEN 'FAILED' ELSE 'PENDING' END,
            next_attempt_at=now()+interval '1 minute'*power(2,least(attempts,6)) WHERE delivery_id=?
            """,id);
    }
    public List<Map<String,Object>> list(UUID user, UUID after, Instant cutoff, int limit) {
        return db.queryForList("""
            SELECT notification_id,user_id,payload->>'title' AS title,(read_at IS NOT NULL) AS read,version
            FROM identity.notifications WHERE user_id=? AND notification_id>? AND created_at<=?
            ORDER BY notification_id LIMIT ?
            """,user,after,Timestamp.from(cutoff),limit+1);
    }
    public Map<String,Object> lock(UUID user, UUID id) {
        var rows=db.queryForList("SELECT notification_id FROM identity.notifications WHERE user_id=? AND notification_id=? FOR UPDATE",user,id);
        return rows.isEmpty()?null:rows.getFirst();
    }
    public Map<String,Object> read(UUID user, UUID id) {
        db.update("UPDATE identity.notifications SET read_at=now(),version=version+1 WHERE user_id=? AND notification_id=? AND read_at IS NULL",user,id);
        return db.queryForMap("""
            SELECT notification_id,user_id,payload->>'title' AS title,(read_at IS NOT NULL) AS read,version
            FROM identity.notifications WHERE user_id=? AND notification_id=?
            """,user,id);
    }
}
