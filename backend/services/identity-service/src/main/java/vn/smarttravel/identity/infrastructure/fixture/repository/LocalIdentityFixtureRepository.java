package vn.smarttravel.identity.infrastructure.fixture.repository;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class LocalIdentityFixtureRepository {
    private final JdbcTemplate db;
    public LocalIdentityFixtureRepository(JdbcTemplate db) { this.db = db; }

    public void lockFixtures() {
        db.queryForList("SELECT pg_advisory_xact_lock(hashtextextended('identity:local-fixtures',0))");
    }

    public List<Map<String, Object>> findUser(UUID id) {
        return db.queryForList("SELECT email FROM identity.users WHERE user_id=?", id);
    }

    public void create(UUID id, String email, String hash, String alias, String role, boolean consent) {
        db.update("""
            INSERT INTO identity.users(user_id,email,password_hash,display_name,status,email_verified_at)
            VALUES (?,?,?,?,'ACTIVE',now())
            """, id,email,hash,"Synthetic "+alias);
        db.update("INSERT INTO identity.user_roles(user_id,role_code) VALUES (?,?)",id,role);
        db.update("INSERT INTO identity.user_preferences(user_id,personalization_enabled) VALUES (?,?)",id,consent);
        db.update("INSERT INTO identity.audit_logs(audit_id,actor_type,entity_type,entity_id,action) VALUES (?,'SYSTEM','user',?,'LOCAL_FIXTURE_CREATED')",UUID.randomUUID(),id.toString());
    }
}
