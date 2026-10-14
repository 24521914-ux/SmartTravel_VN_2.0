package vn.smarttravel.catalog.infrastructure.transport.service;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.networknt.schema.*;
import java.time.Instant;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;
@Component
public class EventContracts {
    private final ConcurrentHashMap<String,JsonSchema> schemas=new ConcurrentHashMap<>();
    private final ObjectMapper json=new ObjectMapper();
    private static final Set<String> INBOUND=Set.of("identity.user.status-changed.v1","identity.user.deletion-requested.v1","community.rating-summary.changed.v1","community.contribution.apply-requested.v1","ingestion.place.upsert-requested.v1","ingestion.source-policy.changed.v1");
    private static final Set<String> OUTBOUND=Set.of("domain.user-data-deleted.v1","catalog.place.upserted.v1","catalog.place.visibility-changed.v1","catalog.destination.changed.v1","catalog.category.changed.v1","catalog.contribution.applied.v1","catalog.contribution.rejected.v1","catalog.business-claim.reviewed.v1","catalog.place-import.applied.v1","catalog.place-import.rejected.v1");
    public void validateOutbound(JsonNode event){
        if(!OUTBOUND.contains(event.path("event_type").asText()) || !"catalog".equals(event.path("producer").asText()))throw new IllegalArgumentException("Unsupported outbound event");
        schema(event);
    }
    public void validate(JsonNode event){
        String type=event.path("event_type").asText();
        if(!INBOUND.contains(type))throw new IllegalArgumentException("Unsupported event type");
        schema(event);
        Instant occurred=Instant.parse(event.path("occurred_at").asText());
        if(occurred.isAfter(Instant.now().plusSeconds(300)))throw new IllegalArgumentException("Future event");
        if(occurred.isBefore(Instant.now().minusSeconds(30L*86400)))throw new IllegalArgumentException("Event outside replay window");
    }
    private void schema(JsonNode event){
        String type=event.path("event_type").asText();
        var schema=schemas.computeIfAbsent(type,key->{try(var stream=getClass().getResourceAsStream("/contracts/events/"+key+".schema.json")){
            if(stream==null)throw new IllegalStateException("Contract unavailable");
            return JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012).getSchema(json.readTree(stream));
        }catch(java.io.IOException ex){throw new IllegalStateException("Contract unavailable",ex);}});
        if(!schema.validate(event).isEmpty())throw new IllegalArgumentException("Invalid event contract");
    }
}
