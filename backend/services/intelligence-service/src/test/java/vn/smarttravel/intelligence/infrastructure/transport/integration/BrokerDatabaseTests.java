package vn.smarttravel.intelligence.infrastructure.transport.integration;

import static vn.smarttravel.intelligence.shared.util.IntelligenceSupport.*;
import static org.assertj.core.api.Assertions.*;
import static org.awaitility.Awaitility.await;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.amqp.rabbit.connection.CachingConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.support.TransactionTemplate;
import vn.smarttravel.intelligence.projections.service.ProjectionService;
import vn.smarttravel.intelligence.infrastructure.transport.repository.OutboxRepository;
import vn.smarttravel.intelligence.infrastructure.transport.service.*;

@org.springframework.test.context.ActiveProfiles("test")
@SpringBootTest(properties={"security.jwt.jwk-set-uri=http://127.0.0.1:1/jwks","security.jwt.issuer=fixture","intelligence.transport.enabled=true","intelligence.transport.fixture-capture=true","intelligence.transport.initial-delay-ms=3600000","intelligence.workers-enabled=false"})
@EnabledIfEnvironmentVariable(named="INTELLIGENCE_TRANSPORT_TESTS",matches="true")
class BrokerDatabaseTests {
    @MockitoBean JwtDecoder decoder;
    @Autowired JdbcTemplate db;
    @Autowired ProjectionService projections;
    @Autowired OutboxRepository outbox;
    @Autowired OutboxDispatcher dispatcher;
    @Autowired ConfirmedPublisher runtime;
    @Autowired TransactionTemplate tx;
    @Autowired EventContracts contracts;
    @Autowired io.micrometer.core.instrument.MeterRegistry metrics;
    @Value("${spring.rabbitmq.host}") String host;
    @Value("${spring.rabbitmq.port}") int port;
    CachingConnectionFactory connection;
    RabbitTemplate operator;
    ConfirmedPublisher publisher;
    @BeforeEach void setup(){connection=new CachingConnectionFactory(host,port);connection.setUsername("platform_admin");connection.setPassword(System.getenv("BROKER_ADMIN_PASSWORD"));connection.setVirtualHost("smarttravel");connection.setPublisherConfirmType(CachingConnectionFactory.ConfirmType.CORRELATED);connection.setPublisherReturns(true);operator=new RabbitTemplate(connection);operator.setMandatory(true);publisher=new ConfirmedPublisher(operator);operator.execute(c->{c.queuePurge("intelligence.p01.capture");c.queuePurge("intelligence.dlq");return null;});db.update("delete from intelligence.outbox_events");}
    @AfterEach void close(){connection.destroy();}
    JsonNode preference(UUID user){var payload=new LinkedHashMap<String,Object>();payload.put("user_id",user);payload.put("category_ids",List.of());payload.put("travel_style_ids",List.of());payload.put("food_preference_ids",List.of());payload.put("budget_level","MID");payload.put("budget_min",null);payload.put("budget_max",null);payload.put("currency","VND");payload.put("personalization_enabled",true);payload.put("consent_version",1);payload.put("version",1);
        var envelope=new LinkedHashMap<String,Object>();envelope.put("event_id",UUID.randomUUID());envelope.put("event_type","identity.preferences.changed.v1");envelope.put("schema_version",1);envelope.put("aggregate_type","preferences");envelope.put("aggregate_id",user);envelope.put("aggregate_version",1);envelope.put("occurred_at",Instant.now().toString());envelope.put("producer","identity");envelope.put("correlation_id",UUID.randomUUID());envelope.put("causation_id",null);envelope.put("traceparent","00-0123456789abcdef0123456789abcdef-0123456789abcdef-01");envelope.put("payload",payload);return read(json(envelope));}
    int queue(String name){return operator.execute(c->c.queueDeclarePassive(name).getMessageCount());}
    UUID outboxEvent(){UUID request=UUID.randomUUID();tx.executeWithoutResult(s->projections.publish("domain.user-data-deleted.v1","deletion",request.toString(),1,Map.of("deletion_request_id",request,"service","intelligence","status","COMPLETED","artifact_handling","fixture purge complete"),null));return db.queryForObject("select event_id from intelligence.outbox_events where aggregate_id=?",UUID.class,request.toString());}
    @Test void brokerAcceptsMaximumLicenseAndRejectsExpiredEvent()throws Exception {
        var event=(com.fasterxml.jackson.databind.node.ObjectNode)read(java.nio.file.Files.readString(java.nio.file.Path.of("../../contracts/fixtures/events/ingestion.source-policy.changed.v1.json")));
        UUID source=UUID.randomUUID();event.put("event_id",UUID.randomUUID().toString());event.put("aggregate_id",source.toString());event.put("occurred_at",Instant.now().toString());
        ((com.fasterxml.jackson.databind.node.ObjectNode)event.path("payload")).put("source_id",source.toString()).put("license_version","L".repeat(1024));contracts.validate(event);
        publisher.publish("intelligence.inbound",event.path("event_type").asText(),json(event).getBytes(),event.path("event_id").asText());
        await().atMost(Duration.ofSeconds(15)).untilAsserted(()->assertThat(db.queryForObject("select length(license_version) from intelligence.source_policies where source_id=?",Integer.class,source)).isEqualTo(1024));
        event.put("event_id",UUID.randomUUID().toString());event.put("occurred_at",Instant.now().minus(Duration.ofDays(31)).toString());
        publisher.publish("intelligence.inbound",event.path("event_type").asText(),json(event).getBytes(),event.path("event_id").asText());
        await().atMost(Duration.ofSeconds(15)).untilAsserted(()->assertThat(queue("intelligence.dlq")).isEqualTo(1));
        assertThat(db.queryForObject("select count(*) from intelligence.inbox_events where event_id=?",Integer.class,UUID.fromString(event.path("event_id").asText()))).isZero();
    }
    @Test void realListenerDuplicatePoisonSchemaDlqReplay(){UUID user=UUID.randomUUID();JsonNode event=preference(user);contracts.validate(event);String id=event.path("event_id").asText();publisher.publish("intelligence.inbound",event.path("event_type").asText(),json(event).getBytes(),id);publisher.publish("intelligence.inbound",event.path("event_type").asText(),json(event).getBytes(),id);
        await().atMost(Duration.ofSeconds(15)).untilAsserted(()->assertThat(db.queryForObject("select count(*) from intelligence.inbox_events where event_id=?",Integer.class,UUID.fromString(id))).isEqualTo(1));assertThat(projections.profile(user)).isPresent();
        var poison=(com.fasterxml.jackson.databind.node.ObjectNode)event.deepCopy();poison.put("event_id",UUID.randomUUID().toString());poison.put("schema_version",2);publisher.publish("intelligence.inbound",event.path("event_type").asText(),json(poison).getBytes(),poison.path("event_id").asText());
        await().atMost(Duration.ofSeconds(15)).untilAsserted(()->assertThat(queue("intelligence.dlq")).isEqualTo(1));assertThat(new DeadLetterReplay(operator,publisher,outbox,tx).replayOne()).isTrue();await().atMost(Duration.ofSeconds(15)).untilAsserted(()->assertThat(queue("intelligence.dlq")).isEqualTo(1));
    }
    @Test void outboxCrashAfterConfirmDuplicatesThenCommitAndSchemaValid(){UUID id=outboxEvent();assertThatThrownBy(()->tx.executeWithoutResult(s->{dispatcher.dispatch();throw new IllegalStateException("fixture crash");})).isInstanceOf(IllegalStateException.class);assertThat(db.queryForObject("select published_at from intelligence.outbox_events where event_id=?",java.sql.Timestamp.class,id)).isNull();var first=operator.receive("intelligence.p01.capture",2000);assertThat(first).isNotNull();contracts.validate(read(new String(first.getBody())));dispatcher.dispatch();assertThat(operator.receive("intelligence.p01.capture",2000)).isNotNull();dispatcher.dispatch();assertThat(operator.receive("intelligence.p01.capture",100)).isNull();}
    @Test void brokerUnavailableRetriesBoundedReplayAndAcl(){UUID id=outboxEvent();var disconnected=new CachingConnectionFactory("127.0.0.1",1);disconnected.setConnectionTimeout(500);disconnected.setPublisherConfirmType(CachingConnectionFactory.ConfirmType.CORRELATED);
        try{var failing=new OutboxDispatcher(outbox,new ConfirmedPublisher(new RabbitTemplate(disconnected)),JSON,tx,metrics);for(int i=0;i<8;i++){db.update("update intelligence.outbox_events set available_at=now() where event_id=?",id);failing.dispatch();}assertThat(db.queryForObject("select attempts from intelligence.outbox_events where event_id=?",Integer.class,id)).isEqualTo(8);assertThat(db.queryForObject("select failed_at from intelligence.outbox_events where event_id=?",java.sql.Timestamp.class,id)).isNotNull();assertThat(new DeadLetterReplay(operator,publisher,outbox,tx).replayFailedOutbox(id)).isTrue();dispatcher.dispatch();assertThat(operator.receive("intelligence.p01.capture",2000)).isNotNull();}finally{disconnected.destroy();}
        assertThatThrownBy(()->runtime.publish("intelligence.inbound","identity.preferences.changed.v1","{}".getBytes(),UUID.randomUUID().toString())).isInstanceOf(RuntimeException.class);assertThatThrownBy(()->publisher.publish("intelligence.inbound","unbound.v1","{}".getBytes(),UUID.randomUUID().toString())).isInstanceOf(RuntimeException.class);
    }
}
