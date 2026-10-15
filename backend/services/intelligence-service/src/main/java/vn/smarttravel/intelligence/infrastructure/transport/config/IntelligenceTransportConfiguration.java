package vn.smarttravel.intelligence.infrastructure.transport.config;

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
import vn.smarttravel.intelligence.infrastructure.transport.repository.OutboxRepository;
import vn.smarttravel.intelligence.infrastructure.transport.service.*;
import vn.smarttravel.intelligence.projections.service.ProjectionService;

@Configuration
@EnableScheduling
@ConditionalOnProperty(name="intelligence.transport.enabled",havingValue="true")
public class IntelligenceTransportConfiguration {
    @Bean ConfirmedPublisher confirmedPublisher(RabbitTemplate rabbit,@Value("${spring.rabbitmq.password}") String password){if(password.isBlank())throw new IllegalStateException("Broker credential required");rabbit.setMandatory(true);return new ConfirmedPublisher(rabbit);}
    @Bean Declarables topology(@Value("${intelligence.transport.fixture-capture:false}") boolean capture){
        var outbound=new TopicExchange("intelligence.events",true,false);var inbound=new TopicExchange("intelligence.inbound",true,false);var deadletters=new DirectExchange("intelligence.deadletters",true,false);
        var inbox=QueueBuilder.durable("intelligence.inbox").deadLetterExchange("intelligence.deadletters").deadLetterRoutingKey("rejected").build();var dlq=QueueBuilder.durable("intelligence.dlq").build();
        var list=new java.util.ArrayList<Declarable>(java.util.List.of(outbound,inbound,deadletters,inbox,dlq,BindingBuilder.bind(dlq).to(deadletters).with("rejected")));
        for(String type:java.util.List.of("identity.preferences.changed.v1","identity.user.status-changed.v1","identity.user.deletion-requested.v1","catalog.place.upserted.v1","catalog.place.visibility-changed.v1","catalog.destination.changed.v1","catalog.category.changed.v1","community.rating-summary.changed.v1","community.review.changed.v1","community.favorite.changed.v1","trip.item.added.v1","ingestion.source-policy.changed.v1"))list.add(BindingBuilder.bind(inbox).to(inbound).with(type));
        if(capture){var sink=QueueBuilder.durable("intelligence.p01.capture").build();list.add(sink);list.add(BindingBuilder.bind(sink).to(outbound).with("#"));}return new Declarables(list);
    }
    @Bean SimpleRabbitListenerContainerFactory intelligenceListenerFactory(ConnectionFactory connection){var factory=new SimpleRabbitListenerContainerFactory();factory.setConnectionFactory(connection);factory.setConcurrentConsumers(1);factory.setMaxConcurrentConsumers(2);factory.setPrefetchCount(10);factory.setDefaultRequeueRejected(false);factory.setAdviceChain(RetryInterceptorBuilder.stateless().maxAttempts(3).backOffOptions(100,2,1000).recoverer((message,cause)->{throw new org.springframework.amqp.AmqpRejectAndDontRequeueException("Event rejected after bounded retries");}).build());return factory;}
    @Bean OutboxDispatcher outboxDispatcher(OutboxRepository repository,ConfirmedPublisher publisher,ObjectMapper json,TransactionTemplate tx,MeterRegistry metrics){return new OutboxDispatcher(repository,publisher,json,tx,metrics);}
    @Bean IntelligenceEventListener eventListener(ProjectionService projections,EventContracts contracts){return new IntelligenceEventListener(projections,contracts);}
}
