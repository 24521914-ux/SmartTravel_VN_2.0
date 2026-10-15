package vn.smarttravel.identity.infrastructure.persistence.service;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import vn.smarttravel.identity.infrastructure.persistence.repository.IdentityRetentionRepository;

@Service
public class IdentityRetentionWorker {
    private final IdentityRetentionRepository repository;
    private final TransactionTemplate tx;
    public IdentityRetentionWorker(IdentityRetentionRepository repository, TransactionTemplate tx) { this.repository=repository; this.tx=tx; }
    @Scheduled(fixedDelayString="${identity.retention.poll-ms:3600000}",initialDelayString="${identity.retention.initial-delay-ms:3600000}")
    public void cleanup() { tx.executeWithoutResult(status -> repository.cleanup()); }
}
