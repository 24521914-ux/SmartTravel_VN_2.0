package vn.smarttravel.identity.internal.repository;

import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class UserBatchRepository {
    private final JdbcTemplate db;
    public UserBatchRepository(JdbcTemplate db) { this.db=db; }
    public Map<String,Object> find(UUID user) {
        var rows=db.queryForList("SELECT user_id,status,version FROM identity.users WHERE user_id=?",user);
        return rows.isEmpty()?null:rows.getFirst();
    }
    public List<UUID> activePage(UUID after, int limit) {
        return db.queryForList("SELECT user_id FROM identity.users WHERE status='ACTIVE' AND user_id>? ORDER BY user_id LIMIT ?",UUID.class,after,limit+1);
    }
    public String preferencesWatermark() {
        return db.queryForObject("""
            SELECT md5(coalesce((SELECT string_agg(user_id::text||':'||version::text||':'||status,',' ORDER BY user_id) FROM identity.users),'')
              || '|' || coalesce((SELECT string_agg(user_id::text||':'||version::text||':'||consent_version::text,',' ORDER BY user_id) FROM identity.user_preferences),''))
            """,String.class);
    }
    public java.time.Instant preferencesUpdatedAt(UUID user) {
        return db.queryForObject("SELECT updated_at FROM identity.user_preferences WHERE user_id=?", java.sql.Timestamp.class,user).toInstant();
    }
}
