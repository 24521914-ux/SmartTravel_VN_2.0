package vn.smarttravel.intelligence.infrastructure.transport.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.networknt.schema.*;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;
import static vn.smarttravel.intelligence.shared.util.IntelligenceSupport.*;

@Component
public class EventContracts {
    private final ConcurrentHashMap<String,JsonSchema> schemas=new ConcurrentHashMap<>();
    public void validate(JsonNode event){java.time.Instant occurred;try{occurred=java.time.Instant.parse(event.path("occurred_at").asText());}catch(Exception ex){throw bad("INVALID_EVENT_TIME");}require(!occurred.isBefore(java.time.Instant.now().minus(java.time.Duration.ofDays(30)))&&!occurred.isAfter(java.time.Instant.now().plusSeconds(60)),"EVENT_OUTSIDE_RETENTION_WINDOW");String type=event.path("event_type").asText();require(type.matches("[a-z][a-z0-9.-]+\\.v1"),"INVALID_EVENT_TYPE");JsonSchema schema=schemas.computeIfAbsent(type,key->{
        try(var source=getClass().getResourceAsStream("/contracts/events/"+key+".schema.json")){require(source!=null,"UNKNOWN_CONTRACT");return JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012).getSchema(JSON.readTree(source));}catch(java.io.IOException ex){throw new IllegalStateException("Contract unavailable",ex);}
    });require(schema.validate(event).isEmpty(),"CONTRACT_INVALID");
        String identity=switch(type){
            case "identity.preferences.changed.v1","identity.user.status-changed.v1" -> "user_id";
            case "identity.user.deletion-requested.v1","domain.user-data-deleted.v1" -> "deletion_request_id";
            case "catalog.place.upserted.v1","catalog.place.visibility-changed.v1","community.rating-summary.changed.v1" -> "place_id";
            case "catalog.category.changed.v1" -> "category_id";
            case "catalog.destination.changed.v1" -> "destination_id";
            case "community.review.changed.v1" -> "review_id";
            case "trip.item.added.v1" -> "trip_id";
            case "ingestion.source-policy.changed.v1" -> "source_id";
            default -> null;
        };
        JsonNode payload=event.path("payload");
        if(identity!=null)require(event.path("aggregate_id").asText().equals(payload.path(identity).asText()),"AGGREGATE_ID_MISMATCH");
        if(payload.has("version"))require(event.path("aggregate_version").asLong()==payload.path("version").asLong(),"AGGREGATE_VERSION_MISMATCH");
        if(type.equals("ingestion.source-policy.changed.v1"))require(event.path("aggregate_version").asLong()==payload.path("source_version").asLong(),"AGGREGATE_VERSION_MISMATCH");
    }
}
