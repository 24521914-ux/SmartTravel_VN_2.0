package vn.smarttravel.community;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.any;

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
            when(revisions.first()).thenReturn(new Document("checksum", checksum));
            assertDoesNotThrow(() -> configuration.migrationRevisionGuard(mongo).afterSingletonsInstantiated());
        }
    }
}
