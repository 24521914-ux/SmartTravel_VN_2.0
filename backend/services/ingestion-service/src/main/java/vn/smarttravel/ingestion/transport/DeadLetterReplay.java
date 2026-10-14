package vn.smarttravel.ingestion.transport;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
/** Operator-only utility: supply a separate broker connection, never the workload credential. */
public class DeadLetterReplay {
 private final ConnectionFactory operator;
 public DeadLetterReplay(ConnectionFactory operator){this.operator=operator;}
 public boolean replayOne()throws Exception{try(var connection=operator.createConnection()){var channel=connection.createChannel(false);try{var delivery=channel.basicGet("ingestion.dlq",false);if(delivery==null)return false;long tag=delivery.getEnvelope().getDeliveryTag();String routing=null;Object deaths=delivery.getProps().getHeaders()==null?null:delivery.getProps().getHeaders().get("x-death");if(deaths instanceof List<?>l&&!l.isEmpty()&&l.getFirst() instanceof Map<?,?>m&&m.get("routing-keys") instanceof List<?>r&&!r.isEmpty())routing=r.getFirst().toString();if(routing==null||!Set.of("catalog.place-import.applied.v1","catalog.place-import.rejected.v1","identity.user.deletion-requested.v1","identity.user.status-changed.v1").contains(routing)){channel.basicNack(tag,false,true);throw new IllegalStateException("Original supported routing metadata required");}var returned=new AtomicBoolean();channel.addReturnListener((code,text,exchange,key,properties,body)->returned.set(true));channel.confirmSelect();channel.basicPublish("ingestion.inbound",routing,true,delivery.getProps(),delivery.getBody());if(!channel.waitForConfirms(5000)||returned.get()){channel.basicNack(tag,false,true);throw new IllegalStateException("Dead letter replay not confirmed and routed");}channel.basicAck(tag,false);return true;}finally{channel.close();}}}
}
