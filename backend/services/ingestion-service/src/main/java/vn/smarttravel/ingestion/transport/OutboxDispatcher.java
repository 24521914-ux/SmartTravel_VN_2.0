package vn.smarttravel.ingestion.transport;
import org.springframework.stereotype.Component;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import vn.smarttravel.ingestion.transport.repository.OutboxRepository;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.rabbit.connection.CorrelationData;
import org.springframework.amqp.core.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
@Component
@ConditionalOnProperty(name="ingestion.transport.enabled",havingValue="true")
public class OutboxDispatcher {
 private final OutboxRepository db;private final TransactionTemplate tx;private final RabbitTemplate rabbit;
 public OutboxDispatcher(OutboxRepository db,org.springframework.transaction.PlatformTransactionManager tm,RabbitTemplate rabbit){this.db=db;this.tx=new TransactionTemplate(tm);this.rabbit=rabbit;this.rabbit.setMandatory(true);}
 @Scheduled(initialDelayString="${ingestion.transport.initial-delay-ms:1000}",fixedDelayString="${ingestion.transport.poll-ms:1000}") public void tick(){tx.executeWithoutResult(status->{var rows=db.pending();for(var row:rows){UUID id=(UUID)row.get("event_id");try{publish(row.get("event_type").toString(),row.get("payload").toString(),id);db.published(id);}catch(Exception e){db.failed(id);}}});}
 public void publish(String routing,String body,UUID id)throws Exception{var properties=new MessageProperties();properties.setContentType("application/json");properties.setDeliveryMode(MessageDeliveryMode.PERSISTENT);properties.setMessageId(id.toString());var confirmation=new CorrelationData(UUID.randomUUID().toString());rabbit.send("ingestion.events",routing,new Message(body.getBytes(java.nio.charset.StandardCharsets.UTF_8),properties),confirmation);var confirm=confirmation.getFuture().get(5,TimeUnit.SECONDS);if(!confirm.isAck()||confirmation.getReturned()!=null)throw new IllegalStateException("Broker did not confirm and route event");}
}
