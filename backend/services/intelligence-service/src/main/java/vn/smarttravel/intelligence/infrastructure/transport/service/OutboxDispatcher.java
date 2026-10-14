package vn.smarttravel.intelligence.infrastructure.transport.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.MeterRegistry;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.support.TransactionTemplate;
import vn.smarttravel.intelligence.infrastructure.transport.repository.OutboxRepository;

public class OutboxDispatcher {
    private final OutboxRepository repository;
    private final ConfirmedPublisher publisher;
    private final ObjectMapper json;
    private final TransactionTemplate tx;
    private final MeterRegistry metrics;
    public OutboxDispatcher(OutboxRepository repository, ConfirmedPublisher publisher, ObjectMapper json, TransactionTemplate tx, MeterRegistry metrics) {
        this.repository=repository; this.publisher=publisher; this.json=json; this.tx=tx; this.metrics=metrics;
    }
    @Scheduled(fixedDelayString="${intelligence.transport.poll-ms:1000}",initialDelayString="${intelligence.transport.initial-delay-ms:0}")
    public void dispatch() {
        tx.executeWithoutResult(status -> {
            for(var row:repository.pending()) {
                UUID id=(UUID)row.get("event_id"); String type=(String)row.get("event_type"),body=(String)row.get("payload");
                try {
                    var value=json.readTree(body);
                    if(!(type.startsWith("intelligence.") || type.equals("domain.user-data-deleted.v1")) || !type.equals(value.path("event_type").asText()) ||
                            !id.toString().equals(value.path("event_id").asText()) || !"intelligence".equals(value.path("producer").asText()))
                        throw new IllegalArgumentException("Invalid outbox envelope");
                    publisher.publish("intelligence.events",type,body.getBytes(StandardCharsets.UTF_8),id.toString());
                    repository.published(id); metrics.counter("intelligence.outbox.published").increment();
                } catch(Exception e) {
                    repository.retry(id); metrics.counter("intelligence.outbox.retry").increment();
                }
            }
        });
    }
}
