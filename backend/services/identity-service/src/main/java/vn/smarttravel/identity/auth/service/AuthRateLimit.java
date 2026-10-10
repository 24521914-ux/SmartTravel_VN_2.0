package vn.smarttravel.identity.auth.service;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import vn.smarttravel.identity.auth.repository.AuthRateLimitRepository;
import vn.smarttravel.identity.security.support.Tokens;
import vn.smarttravel.identity.shared.exception.IdentityException;

/** Invalid attempts commit independently of the auth transaction. */
@Service
public class AuthRateLimit {
    private final AuthRateLimitRepository repository;
    private final TransactionTemplate tx;

    public AuthRateLimit(AuthRateLimitRepository repository, PlatformTransactionManager manager) {
        this.repository = repository;
        tx = new TransactionTemplate(manager);
        tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    public void check(String action, String account, String remote) {
        boolean allowed = Boolean.TRUE.equals(tx.execute(status -> {
            int remoteCount = repository.increment(Tokens.hash(action + ":remote:" + remote));
            if (remoteCount > 60) return false;
            return repository.increment(Tokens.hash(action + ":account:" + account)) <= 10;
        }));
        if (!allowed) throw new IdentityException(429, "RATE_LIMITED");
    }

    @Scheduled(fixedDelay = 3600000)
    public void cleanup() { repository.cleanup(); }
}
