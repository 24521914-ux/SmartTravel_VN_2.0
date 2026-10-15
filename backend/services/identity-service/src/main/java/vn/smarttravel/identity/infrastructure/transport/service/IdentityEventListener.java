package vn.smarttravel.identity.infrastructure.transport.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import vn.smarttravel.identity.notifications.service.NotificationConsumer;
import vn.smarttravel.identity.deletion.service.DeletionAckConsumer;
import vn.smarttravel.identity.preferences.service.CategoryInvalidationConsumer;

public class IdentityEventListener {
    private final ObjectMapper json;
    private final NotificationConsumer notifications;
    private final DeletionAckConsumer deletions;
    private final CategoryInvalidationConsumer categories;
    private final MeterRegistry metrics;
    public IdentityEventListener(ObjectMapper json, NotificationConsumer notifications, DeletionAckConsumer deletions,
                                 CategoryInvalidationConsumer categories, MeterRegistry metrics) {
        this.json=json; this.notifications=notifications; this.deletions=deletions; this.categories=categories; this.metrics=metrics;
    }
    @RabbitListener(queues="identity.inbox",containerFactory="identityListenerFactory")
    public void receive(Message message) throws Exception {
        if(message.getBody().length>262144) throw new IllegalArgumentException("Event size exceeded");
        var event=json.readTree(message.getBody()); String type=event.path("event_type").asText();
        if(!type.equals(message.getMessageProperties().getReceivedRoutingKey())) throw new IllegalArgumentException("Event routing mismatch");
        var occurred=java.time.Instant.parse(event.path("occurred_at").asText());
        var now=java.time.Instant.now();
        if(occurred.isAfter(now.plusSeconds(300)) || occurred.isBefore(now.minusSeconds(30L*86400)))
            throw new IllegalArgumentException("Event outside retention-safe delivery window; reconciliation required");
        switch(type) {
            case "domain.user-data-deleted.v1" -> deletions.accept(event);
            case "catalog.category.changed.v1" -> categories.accept(event);
            case "catalog.business-claim.reviewed.v1", "community.review.changed.v1", "trip.changed.v1" -> notifications.accept(event);
            default -> throw new IllegalArgumentException("Unsupported event type");
        }
        metrics.counter("identity.inbox.delivered").increment();
        // AUTO ack only after the handler's database transaction commits. Crash here redelivers into inbox dedup.
    }
}
