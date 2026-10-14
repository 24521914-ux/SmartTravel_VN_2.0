package vn.smarttravel.trip.transport;
import org.springframework.context.annotation.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.config.*;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.scheduling.annotation.EnableScheduling;
import java.util.*;
@Configuration
@EnableScheduling
@ConditionalOnProperty(name="trip.transport.enabled",havingValue="true")
public class TransportConfiguration {
 @Bean public Declarables topology(org.springframework.core.env.Environment env){var inbound=new TopicExchange("trip.inbound",true,false);var outbound=new TopicExchange("trip.events",true,false);var dead=new DirectExchange("trip.deadletters",true,false);var inbox=QueueBuilder.durable("trip.inbox").deadLetterExchange("trip.deadletters").deadLetterRoutingKey("rejected").build();var dlq=QueueBuilder.durable("trip.dlq").build();var list=new ArrayList<Declarable>(List.of(inbound,outbound,dead,inbox,dlq,BindingBuilder.bind(dlq).to(dead).with("rejected")));for(String type:List.of("catalog.place.visibility-changed.v1","catalog.place.upserted.v1","catalog.destination.changed.v1","identity.user.status-changed.v1","identity.user.deletion-requested.v1"))list.add(BindingBuilder.bind(inbox).to(inbound).with(type));if(Arrays.asList(env.getActiveProfiles()).contains("local")){var capture=QueueBuilder.durable("trip.p01.capture").build();list.add(capture);list.add(BindingBuilder.bind(capture).to(outbound).with("trip.#"));list.add(BindingBuilder.bind(capture).to(outbound).with("domain.#"));}return new Declarables(list);}
 @Bean public SimpleRabbitListenerContainerFactory domainListenerFactory(ConnectionFactory connection){var factory=new SimpleRabbitListenerContainerFactory();factory.setConnectionFactory(connection);factory.setConcurrentConsumers(1);factory.setMaxConcurrentConsumers(2);factory.setPrefetchCount(10);factory.setDefaultRequeueRejected(false);factory.setAdviceChain(RetryInterceptorBuilder.stateless().maxAttempts(3).backOffOptions(100,2,1000).recoverer((message,cause)->{throw new org.springframework.amqp.AmqpRejectAndDontRequeueException("Event rejected after bounded retries");}).build());return factory;}
}
