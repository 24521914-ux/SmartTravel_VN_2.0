package vn.smarttravel.trip.transport.repository;
import org.springframework.stereotype.Repository;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.*;
@Repository
public class OutboxRepository {
 private final JdbcTemplate db;
 public OutboxRepository(JdbcTemplate db){this.db=db;}
 public List<Map<String,Object>> pending(){return db.queryForList("SELECT * FROM trip.outbox_events WHERE published_at IS NULL AND attempts<8 AND available_at<=now() ORDER BY occurred_at LIMIT 20 FOR UPDATE SKIP LOCKED");}
 public void published(UUID id){db.update("UPDATE trip.outbox_events SET published_at=now(),attempts=attempts+1 WHERE event_id=?",id);}
 public void failed(UUID id){db.update("UPDATE trip.outbox_events SET attempts=attempts+1,available_at=now()+make_interval(secs=>LEAST(300,POWER(2,LEAST(attempts,8))::integer)) WHERE event_id=?",id);}
 public void replay(UUID id){if(db.update("UPDATE trip.outbox_events SET attempts=0,available_at=now() WHERE event_id=? AND published_at IS NULL AND attempts>=8",id)!=1)throw new IllegalArgumentException("Failed unpublished event required");db.update("INSERT INTO trip.audit_logs(audit_id,actor_type,entity_type,entity_id,action) VALUES (?,'SYSTEM','outbox',?,'REPLAY_REQUESTED')",UUID.randomUUID(),id.toString());}
}
