package vn.smarttravel.identity.auth.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class AuthRateLimitRepository {
    private final JdbcTemplate db;
    public AuthRateLimitRepository(JdbcTemplate db) { this.db = db; }

    public int increment(String hash) {
        return db.queryForObject("""
            INSERT INTO identity.auth_rate_limits(bucket_hash,attempts) VALUES (?,1)
            ON CONFLICT(bucket_hash) DO UPDATE SET
              attempts=CASE WHEN identity.auth_rate_limits.window_start < now()-interval '1 minute'
                THEN 1 ELSE identity.auth_rate_limits.attempts+1 END,
              window_start=CASE WHEN identity.auth_rate_limits.window_start < now()-interval '1 minute'
                THEN now() ELSE identity.auth_rate_limits.window_start END RETURNING attempts
            """, Integer.class, hash);
    }

    public void cleanup() { db.update("DELETE FROM identity.auth_rate_limits WHERE window_start < now()-interval '1 hour'"); }
}
