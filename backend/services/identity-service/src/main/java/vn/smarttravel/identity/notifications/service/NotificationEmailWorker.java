package vn.smarttravel.identity.notifications.service;

import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import vn.smarttravel.identity.notifications.repository.NotificationRepository;
import vn.smarttravel.identity.security.service.CurrentUser;
import vn.smarttravel.identity.shared.exception.IdentityException;

/** Duplicate events do not send twice; SMTP send-before-commit remains at-least-once on a crash. */
@Service
public class NotificationEmailWorker {
    private final NotificationRepository repository;
    private final CurrentUser current;
    private final JavaMailSender sender;
    private final TransactionTemplate tx;
    private final boolean enabled;
    private final String from;
    public NotificationEmailWorker(NotificationRepository repository, CurrentUser current, JavaMailSender sender,
                                   TransactionTemplate tx, @Value("${identity.notifications.email-enabled:false}") boolean enabled,
                                   @Value("${identity.mail.from}") String from) {
        this.repository=repository; this.current=current; this.sender=sender; this.tx=tx; this.enabled=enabled; this.from=from;
    }
    @Scheduled(fixedDelayString="${identity.notifications.poll-ms:5000}")
    public void deliver() {
        if(!enabled) return;
        for(UUID user:repository.pendingRecipients()) tx.executeWithoutResult(status -> {
            java.util.Map<String,Object> account;
            try { account=current.lockUser(user); } catch(IdentityException e) { return; }
            for(var job:repository.pendingEmail(user)) {
                UUID id=(UUID)job.get("delivery_id");
                if(!CurrentUser.active(account)) { repository.emailFailed(id); continue; }
                try {
                    var message=new SimpleMailMessage(); message.setFrom(from); message.setTo((String)account.get("email"));
                    message.setSubject("SmartTravel notification"); message.setText((String)job.get("title"));
                    sender.send(message); repository.emailSent(id);
                } catch(Exception e) {
                    repository.emailRetry(id); // provider exception bodies may contain PII/credentials: never log them
                }
            }
        });
    }
}
