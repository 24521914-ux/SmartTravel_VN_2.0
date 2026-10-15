package vn.smarttravel.trip.transport;
import org.springframework.stereotype.Component;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.ApplicationArguments;
import org.springframework.core.env.Environment;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.amqp.rabbit.connection.CachingConnectionFactory;
import vn.smarttravel.trip.transport.repository.OutboxRepository;
import java.util.UUID;
@Component
@ConditionalOnProperty(name="trip.operator.enabled",havingValue="true")
public class OperatorRunner implements ApplicationRunner {
 private final Environment env;private final OutboxRepository repo;private final TransactionTemplate tx;private final ConfigurableApplicationContext context;
 public OperatorRunner(Environment env,OutboxRepository repo,PlatformTransactionManager tm,ConfigurableApplicationContext context){this.env=env;this.repo=repo;this.tx=new TransactionTemplate(tm);this.context=context;}
 public void run(ApplicationArguments args)throws Exception{
  if(env.getProperty("trip.transport.enabled",Boolean.class,false)||env.getProperty("ingestion.worker.enabled",Boolean.class,false))throw new IllegalStateException("Operator requires listeners and workers disabled");
  String action=env.getRequiredProperty("trip.operator.action");
  if(action.equals("replay-outbox")){UUID id=UUID.fromString(env.getRequiredProperty("trip.operator.event-id"));tx.executeWithoutResult(status->repo.replay(id));}
  else if(action.equals("replay-dlq")){var connection=new CachingConnectionFactory(env.getRequiredProperty("spring.rabbitmq.host"),env.getProperty("spring.rabbitmq.port",Integer.class,5672));connection.setUsername(env.getRequiredProperty("BROKER_OPERATOR_USERNAME"));connection.setPassword(env.getRequiredProperty("BROKER_OPERATOR_PASSWORD"));connection.setVirtualHost(env.getProperty("spring.rabbitmq.virtual-host","smarttravel"));try{new DeadLetterReplay(connection).replayOne();}finally{connection.destroy();}}
  else throw new IllegalArgumentException("Unsupported operator action");context.close();
 }
}
