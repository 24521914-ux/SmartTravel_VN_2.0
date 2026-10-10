package vn.smarttravel.identity.admin.repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class AdminUserRepository {
    private final JdbcTemplate db;
    public AdminUserRepository(JdbcTemplate db) { this.db=db; }
    public void lockPair(UUID actor, UUID target) {
        db.queryForList("SELECT user_id FROM identity.users WHERE user_id IN (?,?) ORDER BY user_id FOR UPDATE",actor,target);
    }
    public Map<String,Object> find(UUID user) {
        var rows=db.queryForList("SELECT user_id,display_name,status,version,email_verified_at FROM identity.users WHERE user_id=?",user);
        return rows.isEmpty()?null:rows.getFirst();
    }
    public List<Map<String,Object>> page(UUID after, Instant cutoff, int limit) {
        return db.queryForList("SELECT user_id,display_name,status,version FROM identity.users WHERE user_id>? AND created_at<=? ORDER BY user_id LIMIT ?",after,Timestamp.from(cutoff),limit+1);
    }
    public void status(UUID user, String status) {
        db.update("UPDATE identity.users SET status=?,version=version+1,updated_at=now() WHERE user_id=?",status,user);
    }
    public void roles(UUID actor, UUID user, List<String> roles) {
        db.update("DELETE FROM identity.user_roles WHERE user_id=?",user);
        for(String role:roles) db.update("INSERT INTO identity.user_roles(user_id,role_code,assigned_by) VALUES (?,?,?)",user,role,actor);
        db.update("UPDATE identity.users SET version=version+1,updated_at=now() WHERE user_id=?",user);
    }
    public boolean deleting(UUID user) {
        return db.queryForObject("SELECT EXISTS(SELECT 1 FROM identity.data_deletion_requests WHERE user_id=? AND status IN ('PENDING','PROCESSING','FAILED'))",Boolean.class,user);
    }
}
