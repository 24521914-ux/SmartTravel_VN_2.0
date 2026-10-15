package vn.smarttravel.identity.infrastructure.transport.service;

import java.util.*;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import vn.smarttravel.identity.infrastructure.transport.repository.OutboxRepository;

/** Operator entrypoint, not a public API. At-least-once replay: publish-confirm BEFORE acking DLQ. */
public class DeadLetterReplay {
    private final RabbitTemplate rabbit;
    private final ConfirmedPublisher publisher;
    private final OutboxRepository repository;
    private final TransactionTemplate tx;
    public DeadLetterReplay(RabbitTemplate rabbit, ConfirmedPublisher publisher, OutboxRepository repository, TransactionTemplate tx) {
        this.rabbit=rabbit; this.publisher=publisher; this.repository=repository; this.tx=tx;
    }
    public boolean replayOne() {
        return Boolean.TRUE.equals(rabbit.execute(channel -> {
            var delivery=channel.basicGet("identity.dlq",false);
            if(delivery==null) return false;
            long tag=delivery.getEnvelope().getDeliveryTag(); boolean acknowledged=false;
            try {
                var headers=delivery.getProps().getHeaders();
                if(headers==null || !(headers.get("x-death") instanceof List<?> deaths) || deaths.isEmpty()
                        || !(deaths.getFirst() instanceof Map<?,?> death)
                        || !(death.get("routing-keys") instanceof List<?> keys) || keys.isEmpty())
                    throw new IllegalArgumentException("DLQ event has no original routing metadata");
                String routing=keys.getFirst().toString();
                if(!Set.of("catalog.category.changed.v1","catalog.business-claim.reviewed.v1", "community.review.changed.v1",
                        "trip.changed.v1","domain.user-data-deleted.v1").contains(routing))
                    throw new IllegalArgumentException("DLQ original routing key is unsupported");
                String id=delivery.getProps().getMessageId();
                tx.executeWithoutResult(status -> repository.auditReplay(id==null?"unidentified":id));
                publisher.publish("identity.inbound",routing,delivery.getBody(),id);
                channel.basicAck(tag,false); acknowledged=true;
                return true;
            } finally {
                if(!acknowledged) channel.basicNack(tag,false,true);
            }
        }));
    }
    public boolean replayFailedOutbox(UUID event) { return Boolean.TRUE.equals(tx.execute(status -> repository.replay(event))); }
}
