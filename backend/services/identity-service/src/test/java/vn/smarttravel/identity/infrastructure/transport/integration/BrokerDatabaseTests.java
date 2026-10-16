package vn.smarttravel.identity.infrastructure.transport.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.MeterRegistry;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.connection.CachingConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.support.TransactionTemplate;
import vn.smarttravel.identity.infrastructure.persistence.service.IdentityMutations;
import vn.smarttravel.identity.infrastructure.transport.repository.OutboxRepository;
import vn.smarttravel.identity.infrastructure.transport.service.*;
import static org.assertj.core.api.Assertions.*;
import static org.awaitility.Awaitility.await;

@SpringBootTest(properties={"security.jwt.issuer=identity-broker-test","identity.transport.enabled=true",
        "identity.transport.initial-delay-ms=3600000","identity.mail.poll-ms=3600000","management.health.mail.enabled=false"})
@ActiveProfiles("test")
@EnabledIfEnvironmentVariable(named="IDENTITY_TRANSPORT_TESTS",matches="true")
class BrokerDatabaseTests {
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate db;
    @Autowired IdentityMutations mutations;
    @Autowired OutboxRepository outbox;
    @Autowired OutboxDispatcher dispatcher;
    @Autowired ConfirmedPublisher runtimePublisher;
    @Autowired TransactionTemplate tx;
    @Autowired MeterRegistry metrics;
    @Value("${spring.rabbitmq.host}") String host;
    @Value("${spring.rabbitmq.port}") int port;
    @Value("${spring.rabbitmq.virtual-host}") String vhost;
    CachingConnectionFactory operatorConnection;
    RabbitTemplate operator;
    ConfirmedPublisher operatorPublisher;
    @MockitoBean JavaMailSender mail;

    @BeforeEach void operatorConnection() {
        operatorConnection=new CachingConnectionFactory(host,port); operatorConnection.setUsername("platform_admin");
        operatorConnection.setPassword(System.getenv("BROKER_ADMIN_PASSWORD")); operatorConnection.setVirtualHost(vhost);
        operatorConnection.setPublisherConfirmType(CachingConnectionFactory.ConfirmType.CORRELATED); operatorConnection.setPublisherReturns(true);
        operator=new RabbitTemplate(operatorConnection); operator.setMandatory(true); operatorPublisher=new ConfirmedPublisher(operator);
        operator.execute(channel -> { channel.queuePurge("identity.p01.capture"); channel.queuePurge("identity.dlq"); return null; });
    }
    @AfterEach void close() { operatorConnection.destroy(); }
    UUID user() {
        UUID user=UUID.randomUUID();
        db.update("INSERT INTO identity.users(user_id,email,password_hash,display_name,status) VALUES (?,?,'!','Synthetic broker user','ACTIVE')",user,"broker-"+user+"@example.invalid");
        db.update("INSERT INTO identity.user_preferences(user_id) VALUES (?)",user);
        return user;
    }
    UUID statusEvent(UUID user) {
        tx.executeWithoutResult(status -> mutations.event(user,1,"identity.user.status-changed.v1",Map.of("user_id",user,"status","ACTIVE","version",1)));
        UUID event=db.queryForObject("SELECT event_id FROM identity.outbox_events WHERE aggregate_id=?",UUID.class,user.toString());
        db.update("UPDATE identity.outbox_events SET occurred_at='2000-01-01' WHERE event_id=?",event); return event;
    }
    com.fasterxml.jackson.databind.node.ObjectNode tripEvent(UUID user) {
        UUID trip=UUID.randomUUID(); var event=json.createObjectNode();
        event.put("event_id",UUID.randomUUID().toString()).put("event_type","trip.changed.v1").put("schema_version",1);
        event.put("aggregate_type","trip").put("aggregate_id",trip.toString()).put("aggregate_version",1);
        event.put("occurred_at",java.time.Instant.now().toString()).put("producer","trip");
        event.put("correlation_id",UUID.randomUUID().toString()).putNull("causation_id");
        event.put("traceparent","00-0123456789abcdef0123456789abcdef-0123456789abcdef-01");
        event.putObject("payload").put("trip_id",trip.toString()).put("user_id",user.toString()).put("change_kind","UPDATED").put("version",1);
        return event;
    }
    int captureCount(UUID id) throws Exception {
        int count=0; Message message;
        while((message=operator.receive("identity.p01.capture",100))!=null)
            if(id.toString().equals(json.readTree(message.getBody()).path("event_id").asText())) count++;
        return count;
    }
    @Test void committedOutboxSurvivesCrashAfterPublishBeforeDatabaseCommit() throws Exception {
        UUID user=user(),id=statusEvent(user);
        assertThatThrownBy(() -> tx.executeWithoutResult(status -> { dispatcher.dispatch(); throw new IllegalStateException("crash after confirm"); })).isInstanceOf(IllegalStateException.class);
        assertThat(db.queryForObject("SELECT published_at FROM identity.outbox_events WHERE event_id=?",java.sql.Timestamp.class,id)).isNull();
        assertThat(captureCount(id)).isEqualTo(1);
        dispatcher.dispatch(); assertThat(captureCount(id)).isEqualTo(1);
        assertThat(db.queryForObject("SELECT published_at FROM identity.outbox_events WHERE event_id=?",java.sql.Timestamp.class,id)).isNotNull();
        dispatcher.dispatch(); assertThat(captureCount(id)).isZero();
    }
    @Test void duplicateDeliveryPoisonDlqAndReplayUseRealListenerAndDatabase() throws Exception {
        UUID user=user(); var event=tripEvent(user); byte[] body=json.writeValueAsBytes(event);
        String id=event.get("event_id").asText();
        operatorPublisher.publish("identity.inbound","trip.changed.v1",body,id);
        operatorPublisher.publish("identity.inbound","trip.changed.v1",body,id);
        await().atMost(Duration.ofSeconds(15)).untilAsserted(() -> assertThat(db.queryForObject("SELECT count(*) FROM identity.notifications WHERE user_id=?",Integer.class,user)).isEqualTo(1));
        await().atMost(Duration.ofSeconds(15)).untilAsserted(() -> assertThat(queueCount("identity.inbox")).isZero());
        assertThat(db.queryForObject("SELECT count(*) FROM identity.inbox_events WHERE event_id=?",Integer.class,UUID.fromString(id))).isEqualTo(1);
        operatorPublisher.publish("identity.inbound","trip.changed.v1","{\"private_payload\":\"synthetic poison\"}".getBytes(StandardCharsets.UTF_8),UUID.randomUUID().toString());
        await().atMost(Duration.ofSeconds(15)).untilAsserted(() -> assertThat(queueCount("identity.dlq")).isEqualTo(1));
        assertThat(metrics.counter("identity.inbox.dlq").count()).isGreaterThan(0);
        var replay=new DeadLetterReplay(operator,operatorPublisher,outbox,tx);
        assertThat(replay.replayOne()).isTrue();
        // Poison remains poison; bounded attempts return it to DLQ, not a silent successful inbox record.
        await().atMost(Duration.ofSeconds(15)).untilAsserted(() -> assertThat(queueCount("identity.dlq")).isEqualTo(1));
        assertThat(db.queryForObject("SELECT count(*) FROM identity.notifications WHERE user_id=?",Integer.class,user)).isEqualTo(1);
    }
    int queueCount(String queue) {
        return operator.execute(channel -> channel.queueDeclarePassive(queue).getMessageCount());
    }
    @Test void missingDeletionRequestIsRetriedThenReplaySucceedsAfterRequestExists() throws Exception {
        UUID user=user(),request=UUID.randomUUID(); var event=tripEvent(user);
        event.put("event_type","domain.user-data-deleted.v1").put("aggregate_type","deletion").put("aggregate_id",request.toString()).put("producer","catalog");
        event.putObject("payload").put("deletion_request_id",request.toString()).put("service","catalog").put("status","COMPLETED").put("artifact_handling","fixture erase complete");
        String id=event.get("event_id").asText();
        operatorPublisher.publish("identity.inbound","domain.user-data-deleted.v1",json.writeValueAsBytes(event),id);
        await().atMost(Duration.ofSeconds(15)).untilAsserted(() -> assertThat(queueCount("identity.dlq")).isEqualTo(1));
        assertThat(db.queryForObject("SELECT count(*) FROM identity.inbox_events WHERE event_id=?",Integer.class,UUID.fromString(id))).isZero();
        db.update("INSERT INTO identity.data_deletion_requests(deletion_request_id,user_id,policy_version,status) VALUES (?,?,'1','PROCESSING')",request,user);
        for(String service:List.of("identity","catalog","community","trip","ingestion","intelligence"))
            db.update("INSERT INTO identity.data_deletion_acks(deletion_request_id,service_name,status) VALUES (?,?,'PENDING')",request,service);
        assertThat(new DeadLetterReplay(operator,operatorPublisher,outbox,tx).replayOne()).isTrue();
        await().atMost(Duration.ofSeconds(15)).untilAsserted(() -> assertThat(db.queryForObject("SELECT status FROM identity.data_deletion_acks WHERE deletion_request_id=? AND service_name='catalog'",String.class,request)).isEqualTo("COMPLETED"));
        assertThat(queueCount("identity.dlq")).isZero();
    }
    @Test void brokerUnavailableRetriesAreBoundedAndFailedOutboxCanBeReplayed() throws Exception {
        UUID id=statusEvent(user());
        var disconnected=new CachingConnectionFactory("127.0.0.1",1); disconnected.setConnectionTimeout(500);
        disconnected.setPublisherConfirmType(CachingConnectionFactory.ConfirmType.CORRELATED);
        try {
            var failing=new OutboxDispatcher(outbox,new ConfirmedPublisher(new RabbitTemplate(disconnected)),json,tx,metrics);
            for(int i=0;i<8;i++) {
                db.update("UPDATE identity.outbox_events SET available_at=now() WHERE event_id=?",id); failing.dispatch();
            }
            assertThat(db.queryForObject("SELECT attempts FROM identity.outbox_events WHERE event_id=?",Integer.class,id)).isEqualTo(8);
            assertThat(db.queryForObject("SELECT failed_at FROM identity.outbox_events WHERE event_id=?",java.sql.Timestamp.class,id)).isNotNull();
            var replay=new DeadLetterReplay(operator,operatorPublisher,outbox,tx);
            assertThat(replay.replayFailedOutbox(id)).isTrue(); dispatcher.dispatch(); assertThat(captureCount(id)).isEqualTo(1);
            assertThat(replay.replayFailedOutbox(id)).isFalse();
        } finally { disconnected.destroy(); }
    }
    @Test void workloadCannotPublishPartnerEventsAndUnroutablePublishIsNotSuccess() {
        assertThatThrownBy(() -> runtimePublisher.publish("identity.inbound","trip.changed.v1","{}".getBytes(StandardCharsets.UTF_8),UUID.randomUUID().toString())).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> operatorPublisher.publish("identity.inbound","unbound.v1","{}".getBytes(StandardCharsets.UTF_8),UUID.randomUUID().toString())).isInstanceOf(RuntimeException.class);
    }
    @Test void malformedDlqMetadataIsRetainedAndOperatorCredentialIsRestricted() {
        byte[] poison="synthetic manual poison".getBytes(StandardCharsets.UTF_8);
        operatorPublisher.publish("", "identity.dlq", poison, UUID.randomUUID().toString());
        await().atMost(Duration.ofSeconds(15)).untilAsserted(() -> assertThat(queueCount("identity.dlq")).isEqualTo(1));
        var replay=new DeadLetterReplay(operator,operatorPublisher,outbox,tx);
        assertThatThrownBy(replay::replayOne).hasRootCauseInstanceOf(IllegalArgumentException.class)
                .hasRootCauseMessage("DLQ event has no original routing metadata");
        await().atMost(Duration.ofSeconds(15)).untilAsserted(() -> assertThat(queueCount("identity.dlq")).isEqualTo(1));
        var connection=new CachingConnectionFactory(host,port);
        connection.setUsername("identity_operator"); connection.setPassword(System.getenv("BROKER_OPERATOR_PASSWORD"));
        connection.setVirtualHost(vhost); connection.setConnectionTimeout(2000);
        connection.setPublisherConfirmType(CachingConnectionFactory.ConfirmType.CORRELATED);
        try {
            var template=new RabbitTemplate(connection); template.setMandatory(true);
            var publisher=new ConfirmedPublisher(template);
            var retained=template.receive("identity.dlq",1000);
            assertThat(retained).isNotNull();
            assertThat(retained.getBody()).isEqualTo(poison);
            assertThatThrownBy(() -> publisher.publish("identity.events","identity.user.status-changed.v1",new byte[0],UUID.randomUUID().toString()))
                    .isInstanceOf(RuntimeException.class);
        } finally { connection.destroy(); }
    }
}
