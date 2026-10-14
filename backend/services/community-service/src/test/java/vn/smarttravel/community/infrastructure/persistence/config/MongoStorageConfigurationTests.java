package vn.smarttravel.community.infrastructure.persistence.config;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.any;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

import org.bson.Document;
import org.bson.conversions.Bson;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.mongodb.core.MongoTemplate;

import com.mongodb.client.FindIterable;
import com.mongodb.client.MongoCollection;

class MongoStorageConfigurationTests {
    private MongoTemplate mongo;
    private FindIterable<Document> revisions;
    private final MongoStorageConfiguration configuration = new MongoStorageConfiguration();

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        mongo = mock(MongoTemplate.class);
        MongoCollection<Document> collection = mock(MongoCollection.class);
        revisions = mock(FindIterable.class);
        when(mongo.getCollection("schema_migrations")).thenReturn(collection);
        when(collection.find(any(Bson.class))).thenReturn(revisions);
    }

    @Test
    void immutableMigrationResourceRetainsCanonicalLfChecksum() throws Exception {
        try (var input = new ClassPathResource("db/migration/V1__community_baseline.js").getInputStream()) {
            byte[] bytes = input.readAllBytes();
            assertFalse(new String(bytes, StandardCharsets.UTF_8).contains("\r"),
                    "MongoDB migration resource must retain LF on every operating system");
            assertEquals("1830d58c5c42a83ac2de46824c9964aa161f94117e32eb02d7b95ab35fd30e1f",
                    HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)),
                    "Applied V1 must retain its original canonical bytes; do not repair DB metadata");
        }
    }

    @Test
    void missingMigrationFailsStartup() {
        when(revisions.first()).thenReturn(null);
        assertThrows(IllegalStateException.class,
                () -> configuration.migrationRevisionGuard(mongo).afterSingletonsInstantiated());
    }

    @Test
    void tamperedMigrationFailsStartup() {
        when(revisions.first()).thenReturn(new Document("checksum", "tampered"));
        assertThrows(IllegalStateException.class,
                () -> configuration.migrationRevisionGuard(mongo).afterSingletonsInstantiated());
    }

    @Test
    void matchingImmutableRevisionAllowsStartup() throws Exception {
        try (var input = new ClassPathResource("db/migration/V1__community_baseline.js").getInputStream()) {
            String checksum = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(input.readAllBytes()));
            try(var second=new ClassPathResource("db/migration/V2__provider_name_limits.js").getInputStream();var third=new ClassPathResource("db/migration/V3__user_mutation_fences.js").getInputStream()){String next=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(second.readAllBytes()));String fence=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(third.readAllBytes()));when(revisions.first()).thenReturn(new Document("checksum", checksum),new Document("checksum",next),new Document("checksum",fence));}
            assertDoesNotThrow(() -> configuration.migrationRevisionGuard(mongo).afterSingletonsInstantiated());
        }
    }
}
