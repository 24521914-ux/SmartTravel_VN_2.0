package vn.smarttravel.identity.preferences.repository;

import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import vn.smarttravel.identity.shared.exception.IdentityException;

@Repository
public class CategoryStateRepository {
    private final JdbcTemplate db;
    public CategoryStateRepository(JdbcTemplate db) { this.db=db; }
    /** All category selection/invalidation writers take this lock before user locks. */
    public void lockSelections() { db.execute("SELECT pg_advisory_xact_lock(8101,1)"); }
    public void requireNotInvalidated(List<UUID> ids) {
        for(UUID id:ids) {
            var rows=db.queryForList("SELECT active FROM identity.category_states WHERE category_id=?",id);
            if(!rows.isEmpty() && Boolean.FALSE.equals(rows.getFirst().get("active"))) throw new IdentityException(400,"INVALID_CATEGORY");
        }
    }
    public boolean claim(UUID event) {
        return db.update("INSERT INTO identity.inbox_events(consumer_name,event_id) VALUES ('identity.categories',?) ON CONFLICT DO NOTHING",event)==1;
    }
    public boolean advance(UUID id, boolean active, long version) {
        return db.update("""
            INSERT INTO identity.category_states(category_id,active,version) VALUES (?,?,?)
            ON CONFLICT(category_id) DO UPDATE SET active=excluded.active,version=excluded.version
            WHERE identity.category_states.version<excluded.version
            """,id,active,version)==1;
    }
    public List<UUID> selectedBy(UUID id) {
        return db.queryForList("SELECT user_id FROM identity.user_category_preferences WHERE category_id=? ORDER BY user_id",UUID.class,id);
    }
    public void remove(UUID user, UUID category) {
        db.queryForList("SELECT user_id FROM identity.users WHERE user_id=? FOR UPDATE",user);
        db.update("DELETE FROM identity.user_category_preferences WHERE user_id=? AND category_id=?",user,category);
        db.update("UPDATE identity.user_preferences SET version=version+1,updated_at=now() WHERE user_id=?",user);
    }
}
