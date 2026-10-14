package vn.smarttravel.identity.deletion.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.networknt.schema.*;
import java.util.*;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import vn.smarttravel.identity.deletion.repository.DeletionRepository;
import vn.smarttravel.identity.infrastructure.persistence.service.IdentityMutations;

/** P01 handler entrypoint: transport must authorize producers independently of schema validation. */
@Service
public class DeletionAckConsumer {
    private final JsonSchema schema;
    private final DeletionRepository repository;
    private final IdentityMutations mutations;
    private final TransactionTemplate tx;
    public DeletionAckConsumer(ObjectMapper json, DeletionRepository repository, IdentityMutations mutations, TransactionTemplate tx) {
        this.repository=repository; this.mutations=mutations; this.tx=tx;
        try(var stream=new ClassPathResource("contracts/events/domain.user-data-deleted.v1.schema.json").getInputStream()) {
            schema=JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012).getSchema(json.readTree(stream));
        } catch(Exception e) { throw new IllegalStateException("Missing frozen deletion acknowledgement schema",e); }
    }
    public void accept(JsonNode envelope) {
        if(!schema.validate(envelope).isEmpty()) throw new IllegalArgumentException("Invalid deletion acknowledgement");
        var payload=envelope.get("payload");
        String service=payload.get("service").asText();
        UUID request=UUID.fromString(payload.get("deletion_request_id").asText());
        if(!service.equals(envelope.get("producer").asText()) || !request.toString().equals(envelope.get("aggregate_id").asText()))
            throw new IllegalArgumentException("Inconsistent deletion acknowledgement");
        UUID event=UUID.fromString(envelope.get("event_id").asText());
        tx.executeWithoutResult(status -> {
            var row=repository.find(request,true);
            // Unknown IDs must not be acknowledged successfully; retry/DLQ is the caller's responsibility.
            if(row==null) throw new IllegalArgumentException("Unknown deletion request");
            if(!repository.claim(event) || "COMPLETED".equals(row.get("status"))) return;
            if(!repository.acknowledge(request,service,payload.get("status").asText(),envelope.get("aggregate_version").asLong(),
                    mutations.encode(Map.of("artifact_handling",payload.get("artifact_handling").asText())))) return;
            repository.updateState(request,repository.state(request));
        });
    }
}
