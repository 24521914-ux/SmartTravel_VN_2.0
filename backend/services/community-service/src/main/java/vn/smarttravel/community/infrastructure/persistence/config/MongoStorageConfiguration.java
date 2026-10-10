package vn.smarttravel.community.infrastructure.persistence.config;

import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

import org.bson.Document;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.mongodb.MongoDatabaseFactory;
import org.springframework.data.mongodb.MongoTransactionManager;
import org.springframework.data.mongodb.core.MongoTemplate;

import com.mongodb.ReadConcern;
import com.mongodb.TransactionOptions;
import com.mongodb.WriteConcern;

@Configuration
public class MongoStorageConfiguration {
    @Bean
    MongoTransactionManager transactionManager(MongoDatabaseFactory factory) {
        return new MongoTransactionManager(factory, TransactionOptions.builder()
                .readConcern(ReadConcern.SNAPSHOT).writeConcern(WriteConcern.MAJORITY).build());
    }

    // Runtime verifies the immutable revision; only the migration job manages DDL.
    @Bean
    SmartInitializingSingleton migrationRevisionGuard(MongoTemplate mongo) {
        return () -> {
            try (var input = new ClassPathResource("db/migration/V1__community_baseline.js").getInputStream()) {
                String checksum = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(input.readAllBytes()));
                Document revision = mongo.getCollection("schema_migrations")
                        .find(new Document("_id", "V1__community_baseline")).first();
                if (revision == null || !checksum.equals(revision.getString("checksum"))) {
                    throw new IllegalStateException("Community storage migration missing or checksum mismatch; run migration job");
                }
            } catch (IOException | NoSuchAlgorithmException error) {
                throw new IllegalStateException("Cannot verify Community storage revision", error);
            }
        };
    }
}
