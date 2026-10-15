package vn.smarttravel.community.infrastructure.transport.integration;
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
import vn.smarttravel.community.infrastructure.transport.repository.OutboxRepository;
import vn.smarttravel.community.infrastructure.transport.service.*;
import static org.assertj.core.api.Assertions.*;
@SpringBootTest(properties={"community.transport.enabled=true","community.transport.fixture-capture=true","community.transport.initial-delay-ms=3600000"})
@ActiveProfiles("test")
@EnabledIfEnvironmentVariable(named="COMMUNITY_TRANSPORT_TESTS",matches="true")
class BrokerDatabaseTests {
    @Autowired RabbitTemplate runtime;
    @Autowired ObjectMapper json;
    @Autowired EventContracts contracts;
    @Autowired OutboxDispatcher dispatcher;
    @Autowired OutboxRepository outbox;
    @Autowired TransactionTemplate tx;
    @Autowired org.springframework.data.mongodb.core.MongoTemplate db;
    static CachingConnectionFactory fixtureConnection;
    static RabbitTemplate fixture;
    @DynamicPropertySource static void broker(DynamicPropertyRegistry r){
        r.add("security.jwt.jwk-set-uri",()->"http://127.0.0.1:1/jwks");
        r.add("security.jwt.issuer",()->"broker-test");
        r.add("security.jwt.audience",()->"community");
        r.add("spring.rabbitmq.host",()->System.getenv("BROKER_HOST"));
        r.add("spring.rabbitmq.port",()->System.getenv("BROKER_PORT"));
        r.add("spring.rabbitmq.virtual-host",()->System.getenv("BROKER_VHOST"));
        r.add("spring.rabbitmq.username",()->"community_runtime");
        r.add("spring.rabbitmq.password",()->System.getenv("COMMUNITY_BROKER_PASSWORD"));
    }
    @BeforeAll static void connect(){fixtureConnection=new CachingConnectionFactory(System.getenv("BROKER_HOST"),Integer.parseInt(System.getenv("BROKER_PORT")));
        fixtureConnection.setUsername("p01_fixture");fixtureConnection.setPassword(System.getenv("BROKER_FIXTURE_PASSWORD"));fixtureConnection.setVirtualHost(System.getenv("BROKER_VHOST"));
        fixtureConnection.setPublisherConfirmType(CachingConnectionFactory.ConfirmType.CORRELATED);fixtureConnection.setPublisherReturns(true);fixture=new RabbitTemplate(fixtureConnection);fixture.setMandatory(true);
    }
    @AfterAll static void close(){if(fixtureConnection!=null)fixtureConnection.destroy();}
    @BeforeEach void clear(){while(fixture.receive("community.dlq")!=null){}while(fixture.receive("community.p01.capture")!=null){}}
    JsonNode event()throws Exception{try(var source=getClass().getResourceAsStream("/event-fixtures/identity.user.status-changed.v1.json")){
        var e=(com.fasterxml.jackson.databind.node.ObjectNode)json.readTree(source);String user=UUID.randomUUID().toString();e.put("event_id",UUID.randomUUID().toString());e.put("aggregate_id",user);e.put("occurred_at",Instant.now().toString());
        ((com.fasterxml.jackson.databind.node.ObjectNode)e.path("payload")).put("user_id",user);return e;}}
    void publish(JsonNode event,String route){new ConfirmedPublisher(fixture).publish("community.inbound",route,event.toString().getBytes(StandardCharsets.UTF_8),event.path("event_id").asText());}
    void await(java.util.function.BooleanSupplier condition)throws Exception{for(int n=0;n<100;n++){if(condition.getAsBoolean())return;Thread.sleep(100);}throw new AssertionError("Broker side effect timeout");}
    @Test void realListenerDeduplicatesAndRejectsSchemaPoison()throws Exception{
        var e=event();contracts.validate(e);publish(e,e.path("event_type").asText());publish(e,e.path("event_type").asText());
        await(()->inbox(e.path("event_id").asText())==1);assertThat(inbox(e.path("event_id").asText())).isEqualTo(1);
        publish(json.createObjectNode().put("event_id",UUID.randomUUID().toString()),"identity.user.status-changed.v1");
        Message[] dead={null};await(()->{dead[0]=fixture.receive("community.dlq");return dead[0]!=null;});
        assertThat(dead[0].getMessageProperties().getHeaders()).containsKey("x-death");
    }
    @Test void runtimeCannotPublishPartnerOrCrossServiceAndMandatoryRoutesFail(){
        assertThatThrownBy(()->new ConfirmedPublisher(runtime).publish("community.inbound","identity.user.status-changed.v1","{}".getBytes(),UUID.randomUUID().toString())).isInstanceOf(Exception.class);
        assertThatThrownBy(()->new ConfirmedPublisher(runtime).publish("identity.events","identity.user.status-changed.v1","{}".getBytes(),UUID.randomUUID().toString())).isInstanceOf(Exception.class);
        assertThatThrownBy(()->new ConfirmedPublisher(fixture).publish("community.inbound","identity.user.registered.v1","{}".getBytes(),UUID.randomUUID().toString())).isInstanceOf(Exception.class);
    }
    @Test void futureExpiredRoutingMismatchRejectsBeforeInbox()throws Exception{
        var e=(com.fasterxml.jackson.databind.node.ObjectNode)event();e.put("occurred_at",Instant.now().plusSeconds(600).toString());assertThatThrownBy(()->contracts.validate(e)).isInstanceOf(IllegalArgumentException.class);
        e.put("occurred_at",Instant.now().minusSeconds(31L*86400).toString());assertThatThrownBy(()->contracts.validate(e)).isInstanceOf(IllegalArgumentException.class);
    }
    int inbox(String id){return (int)db.count(org.springframework.data.mongodb.core.query.Query.query(org.springframework.data.mongodb.core.query.Criteria.where("event_id").is(id)),"inbox_events");}

    @Test void confirmedPublishBeforeDatabaseCrashResendsAndFailedOutboxNeedsAuditedReplay()throws Exception{
        String type="community.favorite.changed.v1";
        com.fasterxml.jackson.databind.node.ObjectNode e;
        try(var source=getClass().getResourceAsStream("/event-fixtures/"+type+".json")){e=(com.fasterxml.jackson.databind.node.ObjectNode)json.readTree(source);}
        UUID id=UUID.randomUUID();e.put("event_id",id.toString());e.put("occurred_at",Instant.now().toString());contracts.validateOutbound(e);
        prepareOutbox(id,e);
        assertThatThrownBy(()->tx.executeWithoutResult(status->{
            assertThat(outbox.pending()).anyMatch(row->row.get("event_id").equals(id));
            new ConfirmedPublisher(runtime).publish("community.events",type,e.toString().getBytes(StandardCharsets.UTF_8),id.toString());
            outbox.published(id);throw new IllegalStateException("simulated crash before DB commit");
        })).isInstanceOf(IllegalStateException.class);
        assertThat(isPublished(id)).isFalse();Message first=fixture.receive("community.p01.capture",5000);assertThat(first).isNotNull();assertThat(first.getMessageProperties().getMessageId()).isEqualTo(id.toString());
        dispatcher.dispatch();assertThat(isPublished(id)).isTrue();Message repeated=fixture.receive("community.p01.capture",5000);assertThat(repeated).isNotNull();assertThat(repeated.getMessageProperties().getMessageId()).isEqualTo(id.toString());
        UUID poison=UUID.randomUUID();e.put("event_id",poison.toString());e.put("producer","identity");prepareOutbox(poison,e);lastAttempt(poison);
        dispatcher.dispatch();assertThat(isFailed(poison)).isTrue();dispatcher.dispatch();assertThat(isFailed(poison)).isTrue();
        assertThat(Boolean.TRUE.equals(tx.execute(status->outbox.replay(poison)))).isTrue();assertThat(isFailed(poison)).isFalse();assertThat(Boolean.TRUE.equals(tx.execute(status->outbox.replay(poison)))).isFalse();
    }
    void prepareOutbox(UUID id,JsonNode e){db.remove(new org.springframework.data.mongodb.core.query.Query(),"outbox_events");db.insert(new org.bson.Document("_id",id.toString()).append("envelope",org.bson.Document.parse(e.toString())).append("attempts",0).append("available_at",new Date()),"outbox_events");}
    org.springframework.data.mongodb.core.query.Query idQuery(UUID id){return org.springframework.data.mongodb.core.query.Query.query(org.springframework.data.mongodb.core.query.Criteria.where("_id").is(id.toString()));}
    void lastAttempt(UUID id){db.updateFirst(idQuery(id),new org.springframework.data.mongodb.core.query.Update().set("attempts",7),"outbox_events");}
    boolean isPublished(UUID id){return db.findOne(idQuery(id),org.bson.Document.class,"outbox_events").getDate("published_at")!=null;}
    boolean isFailed(UUID id){var row=db.findOne(idQuery(id),org.bson.Document.class,"outbox_events");return row.getInteger("attempts")==8 && row.getDate("failed_at")!=null;}


    @Test void limitedOperatorReplaysOriginalIdAfterConfirmAndCannotImpersonateProducer()throws Exception{
        String id=UUID.randomUUID().toString();publish(json.createObjectNode().put("event_id",id),"identity.user.status-changed.v1");
        await(()->Boolean.TRUE.equals(fixture.execute(channel->{var row=channel.basicGet("community.dlq",false);if(row==null)return false;channel.basicNack(row.getEnvelope().getDeliveryTag(),false,true);return true;})));
        var connection=new CachingConnectionFactory(System.getenv("BROKER_HOST"),Integer.parseInt(System.getenv("BROKER_PORT")));
        connection.setUsername("community_operator");connection.setPassword(System.getenv("COMMUNITY_BROKER_OPERATOR_PASSWORD"));connection.setVirtualHost(System.getenv("BROKER_VHOST"));connection.setPublisherConfirmType(CachingConnectionFactory.ConfirmType.CORRELATED);connection.setPublisherReturns(true);
        try{var operator=new RabbitTemplate(connection);operator.setMandatory(true);
            assertThat(new DeadLetterReplay(operator,new ConfirmedPublisher(operator),outbox,tx).replayOne()).isTrue();
            Message[] replayed={null};await(()->{replayed[0]=fixture.receive("community.dlq");return replayed[0]!=null;});
            assertThat(replayed[0].getMessageProperties().getMessageId()).isEqualTo(id);assertThat(replayed[0].getMessageProperties().getHeaders()).containsKey("x-death");
            assertThatThrownBy(()->new ConfirmedPublisher(operator).publish("community.events","community.forged.v1","{}".getBytes(),id)).isInstanceOf(Exception.class);
        }finally{connection.destroy();}
    }
}
