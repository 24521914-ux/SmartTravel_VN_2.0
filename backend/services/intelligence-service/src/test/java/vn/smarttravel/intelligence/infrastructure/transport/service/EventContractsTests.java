package vn.smarttravel.intelligence.infrastructure.transport.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class EventContractsTests {
    @Test void schemaValidEnvelopeCannotMutateDifferentAggregateOrVersion() throws Exception {
        var json=new ObjectMapper();
        ObjectNode event;
        try(var stream=getClass().getResourceAsStream("/contracts/events/identity.preferences.changed.v1.schema.json")) {
            assertNotNull(stream);
        }
        event=(ObjectNode)json.readTree(java.nio.file.Files.readString(java.nio.file.Path.of("../../contracts/fixtures/events/identity.preferences.changed.v1.json")));
        event.put("occurred_at",java.time.Instant.now().toString());
        var contracts=new EventContracts();
        assertDoesNotThrow(()->contracts.validate(event));
        var expired=event.deepCopy();expired.put("occurred_at",java.time.Instant.now().minus(java.time.Duration.ofDays(31)).toString());assertThrows(RuntimeException.class,()->contracts.validate(expired));
        var wrongId=event.deepCopy();wrongId.put("aggregate_id",java.util.UUID.randomUUID().toString());
        assertThrows(RuntimeException.class,()->contracts.validate(wrongId));
        var wrongVersion=event.deepCopy();wrongVersion.put("aggregate_version",event.path("aggregate_version").asLong()+1);
        assertThrows(RuntimeException.class,()->contracts.validate(wrongVersion));
    }
}
