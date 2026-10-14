package vn.smarttravel.identity.preferences.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.networknt.schema.*;
import java.util.*;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import vn.smarttravel.identity.preferences.repository.CategoryStateRepository;
import vn.smarttravel.identity.preferences.repository.PreferenceRepository;
import vn.smarttravel.identity.infrastructure.persistence.service.IdentityMutations;

@Service
public class CategoryInvalidationConsumer {
    private final JsonSchema schema;
    private final CategoryStateRepository states;
    private final PreferenceRepository preferences;
    private final IdentityMutations mutations;
    private final TransactionTemplate tx;
    public CategoryInvalidationConsumer(ObjectMapper json, CategoryStateRepository states, PreferenceRepository preferences,
                                        IdentityMutations mutations, TransactionTemplate tx) {
        this.states=states; this.preferences=preferences; this.mutations=mutations; this.tx=tx;
        try(var stream=new ClassPathResource("contracts/events/catalog.category.changed.v1.schema.json").getInputStream()) {
            schema=JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012).getSchema(json.readTree(stream));
        } catch(Exception e) { throw new IllegalStateException("Missing frozen category schema",e); }
    }
    public void accept(JsonNode envelope) {
        if(!schema.validate(envelope).isEmpty()) throw new IllegalArgumentException("Invalid category event");
        var payload=envelope.get("payload"); UUID id=UUID.fromString(payload.get("category_id").asText());
        long version=payload.get("version").asLong();
        if(!id.toString().equals(envelope.get("aggregate_id").asText()) || version!=envelope.get("aggregate_version").asLong())
            throw new IllegalArgumentException("Inconsistent category event");
        tx.executeWithoutResult(status -> {
            states.lockSelections();
            if(!states.claim(UUID.fromString(envelope.get("event_id").asText())) || !states.advance(id,payload.get("active").asBoolean(),version)) return;
            if(payload.get("active").asBoolean()) return; // reactivation never restores a user's removed selection
            for(UUID user:states.selectedBy(id)) {
                states.remove(user,id);
                var snapshot=new LinkedHashMap<>(preferences.snapshot(user)); snapshot.put("user_id",user);
                mutations.event("preferences",user,((Number)snapshot.get("version")).longValue(),"identity.preferences.changed.v1",snapshot);
                mutations.auditSystem(user,"CATEGORY_INVALIDATED");
            }
        });
    }
}
