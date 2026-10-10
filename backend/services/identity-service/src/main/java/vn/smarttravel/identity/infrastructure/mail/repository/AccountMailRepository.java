package vn.smarttravel.identity.infrastructure.mail.repository;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class AccountMailRepository {
    private final JdbcTemplate db;
    public AccountMailRepository(JdbcTemplate db) { this.db = db; }

    public void enqueue(UUID user, String encryptedMessage) {
        db.update("INSERT INTO identity.account_mail_jobs(job_id,user_id,encrypted_message) VALUES (?,?,?)", UUID.randomUUID(), user, encryptedMessage);
    }

    public List<Map<String, Object>> lockPendingJobs() {
        return db.queryForList("""
            SELECT j.*,u.email,u.status FROM identity.account_mail_jobs j JOIN identity.users u USING(user_id)
            WHERE j.sent_at IS NULL AND j.failed_at IS NULL AND j.available_at<=now()
            ORDER BY j.available_at LIMIT 10 FOR UPDATE OF j SKIP LOCKED
            """);
    }

    public boolean validToken(UUID user, String purpose, String hash) {
        return Boolean.TRUE.equals(db.queryForObject("""
            SELECT EXISTS(SELECT 1 FROM identity.account_tokens WHERE user_id=? AND purpose=?
              AND token_hash=? AND consumed_at IS NULL AND expires_at>now())
            """, Boolean.class, user, purpose, hash));
    }

    public void fail(UUID job) {
        db.update("UPDATE identity.account_mail_jobs SET failed_at=now(),encrypted_message='' WHERE job_id=?", job);
    }

    public void sent(UUID job) {
        db.update("UPDATE identity.account_mail_jobs SET sent_at=now(),attempts=attempts+1,encrypted_message='' WHERE job_id=?", job);
    }

    public void retry(UUID job) {
        db.update("""
            UPDATE identity.account_mail_jobs SET attempts=attempts+1,
              available_at=now()+interval '1 minute'*power(2,least(attempts,6)),
              failed_at=CASE WHEN attempts>=7 THEN now() ELSE NULL END WHERE job_id=?
            """, job);
    }
}
