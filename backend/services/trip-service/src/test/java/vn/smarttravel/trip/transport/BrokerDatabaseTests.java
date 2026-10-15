package vn.smarttravel.trip.transport;
import vn.smarttravel.trip.itinerary.repository.TripStore;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.amqp.rabbit.connection.CachingConnectionFactory;
import org.springframework.amqp.rabbit.core.*;
import org.springframework.amqp.core.*;
import java.nio.file.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
@SpringBootTest(properties={"trip.transport.enabled=true","trip.transport.initial-delay-ms=3600000","logging.level.org.springframework=INFO"})
@ActiveProfiles("local")
@EnabledIfEnvironmentVariable(named="DOMAIN_TRANSPORT_TESTS",matches="true")
class BrokerDatabaseTests {
 static final ObjectMapper JSON=new ObjectMapper();
 @Autowired JdbcTemplate db;
 @Autowired TripStore store;
 @Autowired OutboxDispatcher dispatcher;
 @Autowired RabbitTemplate runtime;
 CachingConnectionFactory operator;
 CachingConnectionFactory replay;
 RabbitTemplate fixture;
 RabbitAdmin admin;
 @DynamicPropertySource static void config(DynamicPropertyRegistry r){r.add("security.jwt.jwk-set-uri",()->"http://127.0.0.1:1/jwks");r.add("security.jwt.issuer",()->"fixture");}
 @BeforeEach void setup(){operator=new CachingConnectionFactory(System.getenv("BROKER_HOST"),Integer.parseInt(System.getenv("BROKER_PORT")));operator.setVirtualHost("smarttravel");operator.setUsername("platform_admin");operator.setPassword(System.getenv("BROKER_ADMIN_PASSWORD"));replay=new CachingConnectionFactory(System.getenv("BROKER_HOST"),Integer.parseInt(System.getenv("BROKER_PORT")));replay.setVirtualHost("smarttravel");replay.setUsername("trip_operator");replay.setPassword(System.getenv("BROKER_OPERATOR_PASSWORD"));fixture=new RabbitTemplate(operator);admin=new RabbitAdmin(operator);admin.purgeQueue("trip.p01.capture",false);admin.purgeQueue("trip.dlq",false);db.update("DELETE FROM trip.outbox_events");db.update("DELETE FROM trip.inbox_events");db.update("DELETE FROM trip.user_tombstones");}
 @AfterEach void close(){operator.destroy();replay.destroy();}
 @SuppressWarnings("unchecked")Map<String,Object> event(String type)throws Exception{var e=JSON.readValue(Files.readString(Path.of("../../contracts/fixtures/events/"+type+".json")),Map.class);e.put("event_id",UUID.randomUUID().toString());e.put("occurred_at",java.time.Instant.now().toString());return e;}
 void outbound()throws Exception{var e=event("trip.changed.v1");store.event(UUID.fromString(e.get("aggregate_id").toString()),1,"trip.changed.v1",e.get("payload"));}
 void publish(String exchange,String type,Map<String,Object>e)throws Exception{var properties=new MessageProperties();properties.setContentType("application/json");fixture.send(exchange,type,new Message(JSON.writeValueAsBytes(e),properties));}
 void await(java.util.function.BooleanSupplier condition)throws Exception{long deadline=System.nanoTime()+java.util.concurrent.TimeUnit.SECONDS.toNanos(15);while(!condition.getAsBoolean()){if(System.nanoTime()>deadline)throw new AssertionError("Broker condition timed out");Thread.sleep(50);}}
 @Test void publisherConfirmMandatoryReturnRetainsOutboxThenSuccessfulRetry()throws Exception{var binding=BindingBuilder.bind(new org.springframework.amqp.core.Queue("trip.p01.capture")).to(new TopicExchange("trip.events")).with("trip.#");admin.removeBinding(binding);try{outbound();dispatcher.tick();assertThat(db.queryForObject("SELECT count(*) FROM trip.outbox_events WHERE published_at IS NULL AND attempts=1",Long.class)).isEqualTo(1);}finally{admin.declareBinding(binding);}db.update("UPDATE trip.outbox_events SET available_at=now()");dispatcher.tick();assertThat(db.queryForObject("SELECT count(*) FROM trip.outbox_events WHERE published_at IS NOT NULL",Long.class)).isEqualTo(1);var delivered=fixture.receive("trip.p01.capture",5000);assertThat(delivered).isNotNull();var body=JSON.readValue(delivered.getBody(),Map.class);var schemas=JSON.readValue(getClass().getResourceAsStream("/event-contracts.json"),Map.class);vn.smarttravel.trip.shared.web.ContractRequestAdvice.validate(body,(Map<?,?>)schemas.get(body.get("event_type")));}
 @Test void duplicateDeletionIsAcknowledgedOnceThroughActualBroker()throws Exception{var e=event("identity.user.deletion-requested.v1");publish("trip.inbound","identity.user.deletion-requested.v1",e);publish("trip.inbound","identity.user.deletion-requested.v1",e);await(()->db.queryForObject("SELECT count(*) FROM trip.user_tombstones",Long.class)==1);await(()->db.queryForObject("SELECT count(*) FROM trip.inbox_events",Long.class)==1);assertThat(db.queryForObject("SELECT count(*) FROM trip.outbox_events WHERE event_type='domain.user-data-deleted.v1'",Long.class)).isEqualTo(1);dispatcher.tick();assertThat(fixture.receive("trip.p01.capture",5000)).isNotNull();}
 @Test void malformedEnvelopeRetriesThenDeadLettersWithoutDatabaseMutation()throws Exception{publish("trip.inbound","identity.user.deletion-requested.v1",Map.of("event_id",UUID.randomUUID().toString(),"event_type","identity.user.deletion-requested.v1"));await(()->admin.getQueueInfo("trip.dlq").getMessageCount()==1);assertThat(db.queryForObject("SELECT count(*) FROM trip.inbox_events",Long.class)).isZero();}
 @Test void operatorReplayAcknowledgesDeadLetterOnlyAfterConfirmedRouting()throws Exception{var e=event("identity.user.deletion-requested.v1");var properties=new MessageProperties();properties.setHeaders(Map.of("x-death",List.of(Map.of("routing-keys",List.of("identity.user.deletion-requested.v1")))));fixture.send("trip.deadletters","rejected",new Message(JSON.writeValueAsBytes(e),properties));await(()->admin.getQueueInfo("trip.dlq").getMessageCount()==1);assertThat(new DeadLetterReplay(replay).replayOne()).isTrue();await(()->db.queryForObject("SELECT count(*) FROM trip.user_tombstones",Long.class)==1);assertThat(admin.getQueueInfo("trip.dlq").getMessageCount()).isZero();}
 @Test void workloadCannotImpersonatePartnerThroughInboundExchange()throws Exception{var factory=(CachingConnectionFactory)runtime.getConnectionFactory();try(var connection=factory.createConnection()){var channel=connection.createChannel(false);assertThatThrownBy(()->{channel.basicPublish("trip.inbound","identity.user.deletion-requested.v1",null,"{}".getBytes());channel.queueDeclarePassive("trip.inbox");}).isInstanceOf(Exception.class);} }
 @Test void routingMismatchDeadLettersBeforeDomainMutation()throws Exception{var e=event("identity.user.deletion-requested.v1");publish("trip.inbound","identity.user.status-changed.v1",e);await(()->admin.getQueueInfo("trip.dlq").getMessageCount()==1);assertThat(db.queryForObject("SELECT count(*) FROM trip.inbox_events",Long.class)).isZero();}
 @Test void exhaustedPublishRetriesRequireExplicitAuditedReplay()throws Exception{outbound();UUID id=db.queryForObject("SELECT event_id FROM trip.outbox_events",UUID.class);db.update("UPDATE trip.outbox_events SET attempts=8");dispatcher.tick();assertThat(fixture.receive("trip.p01.capture",300)).isNull();new vn.smarttravel.trip.transport.repository.OutboxRepository(db).replay(id);dispatcher.tick();assertThat(fixture.receive("trip.p01.capture",5000)).isNotNull();assertThat(db.queryForObject("SELECT count(*) FROM trip.audit_logs WHERE action='REPLAY_REQUESTED' AND entity_id=?",Long.class,id.toString())).isEqualTo(1);}
 @Test void replayRejectsMissingOriginalRoutingWithoutDroppingMessage()throws Exception{fixture.send("trip.deadletters","rejected",new Message("{}".getBytes(),new MessageProperties()));await(()->admin.getQueueInfo("trip.dlq").getMessageCount()==1);assertThatThrownBy(()->new DeadLetterReplay(replay).replayOne()).hasMessageContaining("metadata");await(()->admin.getQueueInfo("trip.dlq").getMessageCount()==1);}

 @Test void crashAfterPublishBeforeCommitRedeliversSameEventId()throws Exception{outbound();var row=db.queryForList("SELECT * FROM trip.outbox_events").getFirst();UUID id=(UUID)row.get("event_id");assertThatThrownBy(()->new org.springframework.transaction.support.TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(db.getDataSource())).executeWithoutResult(status->{try{dispatcher.publish(row.get("event_type").toString(),row.get("payload").toString(),id);db.update("UPDATE trip.outbox_events SET published_at=now() WHERE event_id=?",id);throw new IllegalStateException("Simulated crash after broker confirmation");}catch(Exception failure){throw new IllegalStateException(failure);}})).isInstanceOf(IllegalStateException.class);assertThat(db.queryForObject("SELECT count(*) FROM trip.outbox_events WHERE published_at IS NULL",Long.class)).isEqualTo(1);dispatcher.tick();var first=fixture.receive("trip.p01.capture",5000);var second=fixture.receive("trip.p01.capture",5000);assertThat(first.getMessageProperties().getMessageId()).isEqualTo(id.toString());assertThat(second.getMessageProperties().getMessageId()).isEqualTo(id.toString());}
 @Test void operatorCannotPublishServiceEvents()throws Exception{try(var connection=replay.createConnection()){var channel=connection.createChannel(false);assertThatThrownBy(()->{channel.basicPublish("trip.events","trip.changed.v1",null,"{}".getBytes());channel.queueDeclarePassive("trip.dlq");}).isInstanceOf(Exception.class);}}

 @Test void aggregateMismatchDeadLettersWithoutMutation()throws Exception{var e=event("identity.user.deletion-requested.v1");e.put("aggregate_id",UUID.randomUUID().toString());publish("trip.inbound","identity.user.deletion-requested.v1",e);await(()->admin.getQueueInfo("trip.dlq").getMessageCount()==1);assertThat(db.queryForObject("SELECT count(*) FROM trip.inbox_events",Long.class)).isZero();}
 @Test void registeredPlaceUpsertAndDestinationEventsReachDomainConsumer()throws Exception{
  for(String type:List.of("catalog.place.upserted.v1","catalog.destination.changed.v1")){
   var envelope=event(type);
   // The frozen fixture is schema-valid but its destination aggregate differs
   // from its payload ID; transport correlation requires the canonical ID.
   if(type.equals("catalog.destination.changed.v1"))envelope.put("aggregate_id",((Map<?,?>)envelope.get("payload")).get("destination_id"));
   publish("trip.inbound",type,envelope);
  }
  await(()->db.queryForObject("SELECT count(*) FROM trip.inbox_events",Long.class)==2);
  assertThat(db.queryForObject("SELECT count(*) FROM trip.destination_status",Long.class)).isPositive();
  assertThat(admin.getQueueInfo("trip.dlq").getMessageCount()).isZero();
 }

}
