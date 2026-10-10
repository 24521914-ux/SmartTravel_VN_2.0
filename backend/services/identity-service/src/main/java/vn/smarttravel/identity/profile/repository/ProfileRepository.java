package vn.smarttravel.identity.profile.repository;

import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ProfileRepository {
    private final JdbcTemplate db;
    public ProfileRepository(JdbcTemplate db) { this.db = db; }

    public Map<String, Object> findUser(UUID user) {
        return db.queryForList("SELECT * FROM identity.users WHERE user_id=?", user).getFirst();
    }

    public boolean updateName(UUID user, String name, long version) {
        return db.update("UPDATE identity.users SET display_name=?,version=version+1,updated_at=now() WHERE user_id=? AND version=?", name, user, version) == 1;
    }
}
