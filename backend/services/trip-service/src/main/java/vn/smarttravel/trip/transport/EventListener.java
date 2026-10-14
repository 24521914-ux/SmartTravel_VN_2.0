package vn.smarttravel.trip.transport;
import vn.smarttravel.trip.itinerary.service.TripEvents;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.amqp.core.Message;
import java.util.Map;
import java.util.Objects;
@Component
@ConditionalOnProperty(name="trip.transport.enabled",havingValue="true")
public class EventListener {
 private final Map<String,Map<String,Object>> schemas;private final ObjectMapper json;private final TripEvents events;
 public EventListener(ObjectMapper json,TripEvents events)throws Exception{this.json=json;this.events=events;try(var resource=getClass().getResourceAsStream("/event-contracts.json")){schemas=json.readValue(resource,new com.fasterxml.jackson.core.type.TypeReference<Map<String,Map<String,Object>>>(){});}}
 @RabbitListener(queues="trip.inbox",containerFactory="domainListenerFactory") public void listen(Message message)throws Exception{if(message.getBody().length>1048576)throw new IllegalArgumentException("Event too large");@SuppressWarnings("unchecked")Map<String,Object> envelope=json.readValue(message.getBody(),Map.class);if(!Objects.equals(message.getMessageProperties().getReceivedRoutingKey(),envelope.get("event_type")))throw new IllegalArgumentException("Event routing mismatch");var schema=schemas.get(envelope.get("event_type"));if(schema==null)throw new IllegalArgumentException("Unsupported event");vn.smarttravel.trip.shared.web.ContractRequestAdvice.validate(envelope,schema);@SuppressWarnings("unchecked")var payload=(Map<String,Object>)envelope.get("payload");String type=envelope.get("event_type").toString();String key=type.equals("identity.user.deletion-requested.v1")?"deletion_request_id":type.equals("identity.user.status-changed.v1")?"user_id":type.startsWith("catalog.place.")?"place_id":type.equals("catalog.destination.changed.v1")?"destination_id":"command_id";if(!Objects.equals(envelope.get("aggregate_id"),payload.get(key)))throw new IllegalArgumentException("Event aggregate mismatch");if(payload.containsKey("version")&&((Number)envelope.get("aggregate_version")).longValue()!=((Number)payload.get("version")).longValue())throw new IllegalArgumentException("Event version mismatch");java.time.Instant occurred=java.time.Instant.parse(envelope.get("occurred_at").toString());if(occurred.isAfter(java.time.Instant.now().plusSeconds(300))||occurred.isBefore(java.time.Instant.now().minusSeconds(30L*86400)))throw new IllegalArgumentException("Event outside replay window");events.consume(envelope);}
}
