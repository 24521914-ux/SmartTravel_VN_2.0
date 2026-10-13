package vn.smarttravel.identity.notifications.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.networknt.schema.*;
import java.util.*;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import vn.smarttravel.identity.notifications.repository.NotificationRepository;
import vn.smarttravel.identity.security.service.CurrentUser;

/** Handler used by the P01 fixture harness. Broker wiring belongs to the transport gate. */
@Service
public class NotificationConsumer {
    private static final Map<String,String> TITLES=Map.of(
            "catalog.business-claim.reviewed.v1","Yêu cầu xác minh doanh nghiệp đã được cập nhật",
            "community.review.changed.v1","Đánh giá của bạn đã được cập nhật",
            "trip.changed.v1","Lịch trình của bạn đã được cập nhật");
    private final Map<String,JsonSchema> schemas=new HashMap<>();
    private final ObjectMapper json;
    private final NotificationRepository repository;
    private final CurrentUser current;
    private final TransactionTemplate tx;
    public NotificationConsumer(ObjectMapper json, NotificationRepository repository, CurrentUser current, TransactionTemplate tx) {
        this.json=json; this.repository=repository; this.current=current; this.tx=tx;
        var factory=JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012);
        for(String type:TITLES.keySet()) {
            try(var stream=new ClassPathResource("contracts/events/"+type+".schema.json").getInputStream()) {
                schemas.put(type,factory.getSchema(json.readTree(stream)));
            } catch(Exception e) { throw new IllegalStateException("Missing frozen notification schema: "+type,e); }
        }
    }
    public void accept(JsonNode envelope) {
        String type=envelope.path("event_type").asText();
        var schema=schemas.get(type);
        if(schema==null || !schema.validate(envelope).isEmpty()) throw new IllegalArgumentException("Invalid notification event");
        var payload=envelope.get("payload");
        UUID event=UUID.fromString(envelope.get("event_id").asText());
        UUID aggregate=UUID.fromString(envelope.get("aggregate_id").asText());
        String entity=type.startsWith("catalog.")?"claim_id":type.startsWith("trip.")?"trip_id":"review_id";
        if(!aggregate.toString().equals(payload.get(entity).asText()) ||
                envelope.get("aggregate_version").asLong()!=payload.get("version").asLong())
            throw new IllegalArgumentException("Inconsistent notification event");
        UUID user=UUID.fromString(payload.get(type.startsWith("catalog.")?"owner_user_id":"user_id").asText());
        tx.executeWithoutResult(status -> {
            // Same lock order as API mutations; inactive/missing recipient must not create an FK failure.
            Map<String,Object> account;
            try { account=current.lockUser(user); }
            catch(vn.smarttravel.identity.shared.exception.IdentityException e) { account=null; }
            if(!repository.claim(event)) return;
            if(!CurrentUser.active(account)) return;
            if(!repository.advance(type,aggregate,envelope.get("aggregate_version").asLong())) return;
            // Never copy arbitrary producer text, URLs or profiles into the user's notification payload.
            try { repository.create(user,event,type,json.writeValueAsString(Map.of("title",TITLES.get(type),"object_id",aggregate))); }
            catch(com.fasterxml.jackson.core.JsonProcessingException e) { throw new IllegalStateException("Cannot encode notification",e); }
        });
    }
}
