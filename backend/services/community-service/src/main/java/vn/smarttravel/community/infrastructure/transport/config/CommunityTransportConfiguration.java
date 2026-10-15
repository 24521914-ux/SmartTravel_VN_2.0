package vn.smarttravel.community.infrastructure.transport.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.config.*;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.transaction.support.TransactionTemplate;
import vn.smarttravel.community.infrastructure.transport.repository.OutboxRepository;
import vn.smarttravel.community.infrastructure.transport.service.*;
import vn.smarttravel.community.infrastructure.events.service.EventService;

@Configuration
@EnableScheduling
@ConditionalOnProperty(name="community.transport.enabled",havingValue="true")
public class CommunityTransportConfiguration {
    @Bean ConfirmedPublisher confirmedPublisher(RabbitTemplate rabbit,@Value("${spring.rabbitmq.password}") String password){if(password.isBlank())throw new IllegalStateException("Broker credential required");rabbit.setMandatory(true);return new ConfirmedPublisher(rabbit);}
    @Bean Declarables topology(@Value("${community.transport.fixture-capture:false}") boolean capture,org.springframework.core.env.Environment env){
        if(capture && !java.util.Arrays.stream(env.getActiveProfiles()).anyMatch(p->java.util.Set.of("test","local","p01-local","p01local").contains(p)))throw new IllegalStateException("Fixture capture is local/test only");
        var outbound=new TopicExchange("community.events",true,false);var inbound=new TopicExchange("community.inbound",true,false);var deadletters=new DirectExchange("community.deadletters",true,false);
        var inbox=QueueBuilder.durable("community.inbox").deadLetterExchange("community.deadletters").deadLetterRoutingKey("rejected").build();var dlq=QueueBuilder.durable("community.dlq").build();
        var list=new java.util.ArrayList<Declarable>(java.util.List.of(outbound,inbound,deadletters,inbox,dlq,BindingBuilder.bind(dlq).to(deadletters).with("rejected")));
        for(String type:java.util.List.of("identity.user.status-changed.v1","identity.user.deletion-requested.v1","catalog.place.upserted.v1","catalog.place.visibility-changed.v1","catalog.contribution.applied.v1","catalog.contribution.rejected.v1"))list.add(BindingBuilder.bind(inbox).to(inbound).with(type));
        if(capture){var sink=QueueBuilder.durable("community.p01.capture").build();list.add(sink);list.add(BindingBuilder.bind(sink).to(outbound).with("#"));}return new Declarables(list);
    }
    @Bean SimpleRabbitListenerContainerFactory communityListenerFactory(ConnectionFactory connection){var factory=new SimpleRabbitListenerContainerFactory();factory.setConnectionFactory(connection);factory.setConcurrentConsumers(1);factory.setMaxConcurrentConsumers(2);factory.setPrefetchCount(10);factory.setDefaultRequeueRejected(false);factory.setAdviceChain(RetryInterceptorBuilder.stateless().maxAttempts(3).backOffOptions(100,2,1000).recoverer((message,cause)->{throw new org.springframework.amqp.AmqpRejectAndDontRequeueException("Event rejected after bounded retries");}).build());return factory;}
    @Bean OutboxDispatcher outboxDispatcher(OutboxRepository repository,ConfirmedPublisher publisher,ObjectMapper json,TransactionTemplate tx,MeterRegistry metrics,EventContracts contracts){return new OutboxDispatcher(repository,publisher,json,tx,metrics,contracts);}
    @Bean CommunityEventListener eventListener(EventService events,EventContracts contracts){return new CommunityEventListener(events,contracts);}
}
