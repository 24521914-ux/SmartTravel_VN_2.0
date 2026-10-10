package vn.smarttravel.identity.infrastructure.persistence.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.stereotype.Service;
import vn.smarttravel.identity.infrastructure.persistence.repository.IdentityMutationRepository;
import vn.smarttravel.identity.shared.exception.IdentityException;

/** Technical mutation records join the calling feature transaction; never commit independently. */
@Service
public class IdentityMutations {
    private final IdentityMutationRepository repository;
    private final ObjectMapper json;

    public IdentityMutations(IdentityMutationRepository repository, ObjectMapper json) {
        this.repository = repository; this.json = json;
    }

    public String encode(Object value) {
        try { return json.writeValueAsString(value); }
        catch (Exception e) { throw new IllegalStateException("Cannot serialize Identity record"); }
    }

    public Map<String, Object> idempotent(String scope, String actor, String key, String hash) {
        var record = repository.findIdempotency(scope, actor, key);
        if (record == null) return null;
        if (!hash.equals(record.get("request_hash"))) throw new IdentityException(409, "IDEMPOTENCY_CONFLICT");
        try { return json.readValue((String) record.get("response_body"), new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {}); }
        catch (Exception e) { throw new IllegalStateException("Invalid idempotency record"); }
    }

    public void remember(String scope, String actor, String key, String hash, Map<String, Object> response) {
        remember(scope, actor, key, hash, response, 202);
    }

    public void remember(String scope, String actor, String key, String hash, Map<String, Object> response, int status) {
        repository.remember(scope, actor, key, hash, encode(response), status);
    }

    public void audit(UUID actor, UUID user, String action) { repository.audit(actor, user, action); }

    public void event(UUID user, long version, String type, Map<String, Object> payload) {
        event("user", user, version, type, payload);
    }

    public void event(String aggregate, UUID user, long version, String type, Map<String, Object> payload) {
        UUID event = UUID.randomUUID(), correlation;
        try { correlation = UUID.fromString(MDC.get("correlationId")); }
        catch (Exception e) { correlation = UUID.randomUUID(); }
        var envelope = new java.util.LinkedHashMap<String, Object>();
        envelope.put("event_id", event); envelope.put("event_type", type); envelope.put("schema_version", 1);
        envelope.put("aggregate_type", aggregate); envelope.put("aggregate_id", user); envelope.put("aggregate_version", version);
        envelope.put("occurred_at", Instant.now().toString()); envelope.put("producer", "identity");
        envelope.put("correlation_id", correlation); envelope.put("causation_id", correlation);
        envelope.put("traceparent", "00-" + correlation.toString().replace("-", "") + "-" + event.toString().replace("-", "").substring(0,16) + "-01");
        envelope.put("payload", payload);
        repository.event(event, aggregate, user, version, type, encode(envelope));
    }
}
