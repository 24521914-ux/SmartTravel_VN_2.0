package vn.smarttravel.catalog.infrastructure.transport.integration;
import java.time.Instant;
import java.util.*;
import java.nio.charset.StandardCharsets;
import com.fasterxml.jackson.databind.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.connection.CachingConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;
import vn.smarttravel.catalog.infrastructure.transport.repository.OutboxRepository;
import vn.smarttravel.catalog.infrastructure.transport.service.*;
import static org.assertj.core.api.Assertions.*;
@SpringBootTest(properties={"catalog.transport.enabled=true","catalog.transport.fixture-capture=true","catalog.transport.initial-delay-ms=3600000"})
@ActiveProfiles("test")
@EnabledIfEnvironmentVariable(named="CATALOG_TRANSPORT_TESTS",matches="true")
class BrokerDatabaseTests {
    @Autowired RabbitTemplate runtime;
    @Autowired ObjectMapper json;
    @Autowired EventContracts contracts;
    @Autowired OutboxDispatcher dispatcher;
    @Autowired OutboxRepository outbox;
    @Autowired TransactionTemplate tx;
    @Autowired org.springframework.jdbc.core.JdbcTemplate db;
    static CachingConnectionFactory fixtureConnection;
    static RabbitTemplate fixture;
    @DynamicPropertySource static void broker(DynamicPropertyRegistry r){
        r.add("security.jwt.jwk-set-uri",()->"http://127.0.0.1:1/jwks");
        r.add("security.jwt.issuer",()->"broker-test");
        r.add("security.jwt.audience",()->"catalog");
        r.add("spring.rabbitmq.host",()->System.getenv("BROKER_HOST"));
        r.add("spring.rabbitmq.port",()->System.getenv("BROKER_PORT"));
        r.add("spring.rabbitmq.virtual-host",()->System.getenv("BROKER_VHOST"));
        r.add("spring.rabbitmq.username",()->"catalog_runtime");
        r.add("spring.rabbitmq.password",()->System.getenv("CATALOG_BROKER_PASSWORD"));
    }
    @BeforeAll static void connect(){fixtureConnection=new CachingConnectionFactory(System.getenv("BROKER_HOST"),Integer.parseInt(System.getenv("BROKER_PORT")));
        fixtureConnection.setUsername("p01_fixture");fixtureConnection.setPassword(System.getenv("BROKER_FIXTURE_PASSWORD"));fixtureConnection.setVirtualHost(System.getenv("BROKER_VHOST"));
        fixtureConnection.setPublisherConfirmType(CachingConnectionFactory.ConfirmType.CORRELATED);fixtureConnection.setPublisherReturns(true);fixture=new RabbitTemplate(fixtureConnection);fixture.setMandatory(true);
    }
    @AfterAll static void close(){if(fixtureConnection!=null)fixtureConnection.destroy();}
    @BeforeEach void clear(){while(fixture.receive("catalog.dlq")!=null){}while(fixture.receive("catalog.p01.capture")!=null){}}
    JsonNode event()throws Exception{try(var source=getClass().getResourceAsStream("/event-fixtures/identity.user.status-changed.v1.json")){
        var e=(com.fasterxml.jackson.databind.node.ObjectNode)json.readTree(source);String user=UUID.randomUUID().toString();e.put("event_id",UUID.randomUUID().toString());e.put("aggregate_id",user);e.put("occurred_at",Instant.now().toString());
        ((com.fasterxml.jackson.databind.node.ObjectNode)e.path("payload")).put("user_id",user);return e;}}
    void publish(JsonNode event,String route){new ConfirmedPublisher(fixture).publish("catalog.inbound",route,event.toString().getBytes(StandardCharsets.UTF_8),event.path("event_id").asText());}
    void await(java.util.function.BooleanSupplier condition)throws Exception{for(int n=0;n<100;n++){if(condition.getAsBoolean())return;Thread.sleep(100);}throw new AssertionError("Broker side effect timeout");}
    @Test void realListenerDeduplicatesAndRejectsSchemaPoison()throws Exception{
        var e=event();contracts.validate(e);publish(e,e.path("event_type").asText());publish(e,e.path("event_type").asText());
        await(()->inbox(e.path("event_id").asText())==1);assertThat(inbox(e.path("event_id").asText())).isEqualTo(1);
        publish(json.createObjectNode().put("event_id",UUID.randomUUID().toString()),"identity.user.status-changed.v1");
        Message[] dead={null};await(()->{dead[0]=fixture.receive("catalog.dlq");return dead[0]!=null;});
        assertThat(dead[0].getMessageProperties().getHeaders()).containsKey("x-death");
    }
    @Test void runtimeCannotPublishPartnerOrCrossServiceAndMandatoryRoutesFail(){
        assertThatThrownBy(()->new ConfirmedPublisher(runtime).publish("catalog.inbound","identity.user.status-changed.v1","{}".getBytes(),UUID.randomUUID().toString())).isInstanceOf(Exception.class);
        assertThatThrownBy(()->new ConfirmedPublisher(runtime).publish("identity.events","identity.user.status-changed.v1","{}".getBytes(),UUID.randomUUID().toString())).isInstanceOf(Exception.class);
        assertThatThrownBy(()->new ConfirmedPublisher(fixture).publish("catalog.inbound","identity.user.registered.v1","{}".getBytes(),UUID.randomUUID().toString())).isInstanceOf(Exception.class);
    }
    @Test void futureExpiredRoutingMismatchRejectsBeforeInbox()throws Exception{
        var e=(com.fasterxml.jackson.databind.node.ObjectNode)event();e.put("occurred_at",Instant.now().plusSeconds(600).toString());assertThatThrownBy(()->contracts.validate(e)).isInstanceOf(IllegalArgumentException.class);
        e.put("occurred_at",Instant.now().minusSeconds(31L*86400).toString());assertThatThrownBy(()->contracts.validate(e)).isInstanceOf(IllegalArgumentException.class);
    }
    int inbox(String id){return db.queryForObject("SELECT count(*) FROM catalog.inbox_events WHERE event_id=?",Integer.class,UUID.fromString(id));}

    @Test void confirmedPublishBeforeDatabaseCrashResendsAndFailedOutboxNeedsAuditedReplay()throws Exception{
        String type="catalog.category.changed.v1";
        com.fasterxml.jackson.databind.node.ObjectNode e;
        try(var source=getClass().getResourceAsStream("/event-fixtures/"+type+".json")){e=(com.fasterxml.jackson.databind.node.ObjectNode)json.readTree(source);}
        UUID id=UUID.randomUUID();e.put("event_id",id.toString());e.put("occurred_at",Instant.now().toString());contracts.validateOutbound(e);
        prepareOutbox(id,e);
        assertThatThrownBy(()->tx.executeWithoutResult(status->{
            assertThat(outbox.pending()).anyMatch(row->row.get("event_id").equals(id));
            new ConfirmedPublisher(runtime).publish("catalog.events",type,e.toString().getBytes(StandardCharsets.UTF_8),id.toString());
            outbox.published(id);throw new IllegalStateException("simulated crash before DB commit");
        })).isInstanceOf(IllegalStateException.class);
        assertThat(isPublished(id)).isFalse();Message first=fixture.receive("catalog.p01.capture",5000);assertThat(first).isNotNull();assertThat(first.getMessageProperties().getMessageId()).isEqualTo(id.toString());
        dispatcher.dispatch();assertThat(isPublished(id)).isTrue();Message repeated=fixture.receive("catalog.p01.capture",5000);assertThat(repeated).isNotNull();assertThat(repeated.getMessageProperties().getMessageId()).isEqualTo(id.toString());
        UUID poison=UUID.randomUUID();e.put("event_id",poison.toString());e.put("producer","identity");prepareOutbox(poison,e);lastAttempt(poison);
        dispatcher.dispatch();assertThat(isFailed(poison)).isTrue();dispatcher.dispatch();assertThat(isFailed(poison)).isTrue();
        assertThat(Boolean.TRUE.equals(tx.execute(status->outbox.replay(poison)))).isTrue();assertThat(isFailed(poison)).isFalse();assertThat(Boolean.TRUE.equals(tx.execute(status->outbox.replay(poison)))).isFalse();
        // The poison fixture is deliberately invalid; do not leak it into provider contract checks.
        db.update("DELETE FROM catalog.outbox_events WHERE event_id=?",poison);
    }
    void prepareOutbox(UUID id,JsonNode e){db.update("DELETE FROM catalog.outbox_events");db.update("INSERT INTO catalog.outbox_events(event_id,aggregate_type,aggregate_id,aggregate_version,event_type,payload) VALUES(?,?,?,?,?,?::jsonb)",id,e.path("aggregate_type").asText(),e.path("aggregate_id").asText(),e.path("aggregate_version").asLong(),e.path("event_type").asText(),e.toString());}
    void lastAttempt(UUID id){db.update("UPDATE catalog.outbox_events SET attempts=7 WHERE event_id=?",id);}
    boolean isPublished(UUID id){return db.queryForObject("SELECT published_at IS NOT NULL FROM catalog.outbox_events WHERE event_id=?",Boolean.class,id);}
    boolean isFailed(UUID id){return db.queryForObject("SELECT attempts=8 AND failed_at IS NOT NULL FROM catalog.outbox_events WHERE event_id=?",Boolean.class,id);}


    @Test void limitedOperatorReplaysOriginalIdAfterConfirmAndCannotImpersonateProducer()throws Exception{
        String id=UUID.randomUUID().toString();publish(json.createObjectNode().put("event_id",id),"identity.user.status-changed.v1");
        await(()->Boolean.TRUE.equals(fixture.execute(channel->{var row=channel.basicGet("catalog.dlq",false);if(row==null)return false;channel.basicNack(row.getEnvelope().getDeliveryTag(),false,true);return true;})));
        var connection=new CachingConnectionFactory(System.getenv("BROKER_HOST"),Integer.parseInt(System.getenv("BROKER_PORT")));
        connection.setUsername("catalog_operator");connection.setPassword(System.getenv("CATALOG_BROKER_OPERATOR_PASSWORD"));connection.setVirtualHost(System.getenv("BROKER_VHOST"));connection.setPublisherConfirmType(CachingConnectionFactory.ConfirmType.CORRELATED);connection.setPublisherReturns(true);
        try{var operator=new RabbitTemplate(connection);operator.setMandatory(true);
            assertThat(new DeadLetterReplay(operator,new ConfirmedPublisher(operator),outbox,tx).replayOne()).isTrue();
            Message[] replayed={null};await(()->{replayed[0]=fixture.receive("catalog.dlq");return replayed[0]!=null;});
            assertThat(replayed[0].getMessageProperties().getMessageId()).isEqualTo(id);assertThat(replayed[0].getMessageProperties().getHeaders()).containsKey("x-death");
            assertThatThrownBy(()->new ConfirmedPublisher(operator).publish("catalog.events","catalog.forged.v1","{}".getBytes(),id)).isInstanceOf(Exception.class);
        }finally{connection.destroy();}
    }
}
