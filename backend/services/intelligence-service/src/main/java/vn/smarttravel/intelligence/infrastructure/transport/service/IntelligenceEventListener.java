package vn.smarttravel.intelligence.infrastructure.transport.service;

import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import vn.smarttravel.intelligence.projections.service.ProjectionService;
import static vn.smarttravel.intelligence.shared.util.IntelligenceSupport.*;

public class IntelligenceEventListener {
    private final ProjectionService projections;
    private final EventContracts contracts;
    public IntelligenceEventListener(ProjectionService projections,EventContracts contracts){this.projections=projections;this.contracts=contracts;}
    @RabbitListener(queues="intelligence.inbox",containerFactory="intelligenceListenerFactory")
    public void consume(Message message){require(message.getBody().length<=262144,"EVENT_TOO_LARGE");var event=read(new String(message.getBody(),java.nio.charset.StandardCharsets.UTF_8));contracts.validate(event);require(event.path("event_type").asText().equals(message.getMessageProperties().getReceivedRoutingKey()),"ROUTING_MISMATCH");require(!time(event,"occurred_at").isAfter(java.time.Instant.now().plusSeconds(300)),"FUTURE_EVENT");projections.consume(event);}
}
