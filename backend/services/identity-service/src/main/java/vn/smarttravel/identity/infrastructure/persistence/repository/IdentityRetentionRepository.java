package vn.smarttravel.identity.infrastructure.persistence.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class IdentityRetentionRepository {
    private final JdbcTemplate db;
    public IdentityRetentionRepository(JdbcTemplate db) { this.db=db; }
    public void cleanup() {
        db.update("DELETE FROM identity.idempotency_records WHERE expires_at<now()");
        db.update("DELETE FROM identity.inbox_events WHERE processed_at<now()-interval '90 days'");
        db.update("DELETE FROM identity.outbox_events WHERE published_at<now()-interval '90 days' AND failed_at IS NULL");
        db.update("DELETE FROM identity.account_tokens WHERE expires_at<now()-interval '7 days'");
        db.update("DELETE FROM identity.account_mail_jobs WHERE coalesce(sent_at,failed_at)<now()-interval '7 days'");
        db.update("""
            DELETE FROM identity.notifications n WHERE n.created_at<now()-interval '90 days'
            AND NOT EXISTS(SELECT 1 FROM identity.notification_deliveries d WHERE d.notification_id=n.notification_id AND d.status IN ('PENDING','FAILED'))
            """);
        // Keep token reuse evidence through the session's absolute expiry plus a safety window.
        db.update("DELETE FROM identity.auth_sessions WHERE expires_at<now()-interval '7 days'");
        // Audit/deletion state are intentionally not deleted by a runtime credential.
    }
}
