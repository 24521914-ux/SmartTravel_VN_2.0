package vn.smarttravel.catalog.infrastructure.transport.service;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import vn.smarttravel.catalog.infrastructure.events.service.EventService;
public class CatalogEventListener {
    private final EventService events;
    private final EventContracts contracts;
    private final ObjectMapper json=new ObjectMapper();
    public CatalogEventListener(EventService events,EventContracts contracts){this.events=events;this.contracts=contracts;}
    @RabbitListener(queues="catalog.inbox",containerFactory="catalogListenerFactory")
    public void consume(Message message)throws java.io.IOException{
        if(message.getBody().length>262144)throw new IllegalArgumentException("Event too large");
        var event=json.readTree(message.getBody());contracts.validate(event);
        if(!event.path("event_type").asText().equals(message.getMessageProperties().getReceivedRoutingKey()))throw new IllegalArgumentException("Routing mismatch");
        events.accept(event);
    }
}
