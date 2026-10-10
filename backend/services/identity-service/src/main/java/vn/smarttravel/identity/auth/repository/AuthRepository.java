package vn.smarttravel.identity.auth.repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Identity-owned auth persistence. Row locks participate in the calling service transaction. */
@Repository
public class AuthRepository {
    private final JdbcTemplate db;

    public AuthRepository(JdbcTemplate db) { this.db = db; }

    private Map<String, Object> first(String sql, Object... args) {
        var rows = db.queryForList(sql, args);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public void lockRegistration(String actor) {
        db.queryForList("SELECT pg_advisory_xact_lock(hashtextextended(?,0))", "register:" + actor);
    }

    public Map<String, Object> findUserByEmail(String email) {
        return first("SELECT user_id FROM identity.users WHERE email=?", email);
    }

    public Map<String, Object> lockUserByEmail(String email) {
        return first("SELECT * FROM identity.users WHERE email=? FOR UPDATE", email);
    }

    public Map<String, Object> lockUser(UUID user) {
        return first("SELECT * FROM identity.users WHERE user_id=? FOR UPDATE", user);
    }

    public void createUser(UUID user, String email, String hash, String name) {
        db.update("INSERT INTO identity.users(user_id,email,password_hash,display_name) VALUES (?,?,?,?)", user, email, hash, name);
        db.update("INSERT INTO identity.user_roles(user_id,role_code) VALUES (?,'USER')", user);
        db.update("INSERT INTO identity.user_preferences(user_id) VALUES (?)", user);
    }

    public void consumeAccountTokens(UUID user, String purpose) {
        db.update("UPDATE identity.account_tokens SET consumed_at=now() WHERE user_id=? AND purpose=? AND consumed_at IS NULL", user, purpose);
    }

    public void createAccountToken(UUID user, String purpose, String hash, Instant expiry) {
        db.update("INSERT INTO identity.account_tokens(token_id,user_id,purpose,token_hash,expires_at) VALUES (?,?,?,?,?)",
                UUID.randomUUID(), user, purpose, hash, Timestamp.from(expiry));
    }

    public Map<String, Object> findAccountToken(String hash, String purpose) {
        return first("SELECT user_id FROM identity.account_tokens WHERE token_hash=? AND purpose=?", hash, purpose);
    }

    public Map<String, Object> lockAccountToken(String hash, String purpose) {
        return first("SELECT * FROM identity.account_tokens WHERE token_hash=? AND purpose=? FOR UPDATE", hash, purpose);
    }

    public void verifyEmail(UUID user) {
        db.update("UPDATE identity.users SET status='ACTIVE',email_verified_at=now(),version=version+1,updated_at=now() WHERE user_id=?", user);
    }

    public void updatePassword(UUID user, String hash) {
        db.update("UPDATE identity.users SET password_hash=?,version=version+1,updated_at=now() WHERE user_id=?", hash, user);
    }

    public void createSession(UUID session, UUID user, Instant expiry) {
        db.update("INSERT INTO identity.auth_sessions(session_id,user_id,expires_at) VALUES (?,?,?)", session, user, Timestamp.from(expiry));
    }

    public void createRefreshToken(UUID session, String hash, UUID parent, Instant expiry) {
        db.update("INSERT INTO identity.refresh_tokens(token_id,session_id,token_hash,parent_token_id,expires_at) VALUES (?,?,?,?,?)",
                UUID.randomUUID(), session, hash, parent, Timestamp.from(expiry));
    }

    public Map<String, Object> findRefreshOwner(String hash) {
        return first("""
            SELECT t.session_id,s.user_id FROM identity.refresh_tokens t JOIN identity.auth_sessions s USING(session_id)
            WHERE t.token_hash=?
            """, hash);
    }

    public Map<String, Object> findOwnedRefreshSession(String hash, UUID user) {
        return first("""
            SELECT t.session_id FROM identity.refresh_tokens t JOIN identity.auth_sessions s USING(session_id)
            WHERE t.token_hash=? AND s.user_id=?
            """, hash, user);
    }

    public Map<String, Object> lockSession(UUID session) {
        return first("SELECT * FROM identity.auth_sessions WHERE session_id=? FOR UPDATE", session);
    }

    public Map<String, Object> lockOwnedSession(UUID session, UUID user) {
        return first("SELECT * FROM identity.auth_sessions WHERE session_id=? AND user_id=? FOR UPDATE", session, user);
    }

    public Map<String, Object> lockRefreshToken(String hash) {
        return first("SELECT * FROM identity.refresh_tokens WHERE token_hash=? FOR UPDATE", hash);
    }

    public void consumeRefreshToken(UUID token) {
        db.update("UPDATE identity.refresh_tokens SET consumed_at=now() WHERE token_id=?", token);
    }

    public List<String> roles(UUID user) {
        return db.queryForList("SELECT role_code FROM identity.user_roles WHERE user_id=? ORDER BY role_code", String.class, user);
    }

    public void revokeSession(UUID session) {
        db.update("UPDATE identity.auth_sessions SET revoked_at=coalesce(revoked_at,now()) WHERE session_id=?", session);
        db.update("UPDATE identity.refresh_tokens SET revoked_at=coalesce(revoked_at,now()) WHERE session_id=?", session);
    }

    public void revokeAllSessions(UUID user) {
        for (var row : db.queryForList("SELECT session_id FROM identity.auth_sessions WHERE user_id=? ORDER BY session_id", user))
            revokeSession((UUID) row.get("session_id"));
    }

    public List<Map<String, Object>> sessions(UUID user, Instant start, UUID startId, int limit) {
        return db.queryForList("""
            SELECT session_id,created_at,expires_at FROM identity.auth_sessions
            WHERE user_id=? AND revoked_at IS NULL AND expires_at>now() AND (created_at,session_id)>(?,?)
            ORDER BY created_at,session_id LIMIT ?
            """, user, Timestamp.from(start), startId, limit);
    }

    public boolean ownsSession(UUID user, UUID session) {
        return first("SELECT session_id FROM identity.auth_sessions WHERE session_id=? AND user_id=?", session, user) != null;
    }
}
