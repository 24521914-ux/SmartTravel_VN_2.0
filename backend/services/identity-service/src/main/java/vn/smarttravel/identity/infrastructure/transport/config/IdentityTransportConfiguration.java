package vn.smarttravel.identity.infrastructure.transport.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.config.*;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;
import org.springframework.transaction.support.TransactionTemplate;
import vn.smarttravel.identity.infrastructure.transport.repository.OutboxRepository;
import vn.smarttravel.identity.infrastructure.transport.service.*;
import vn.smarttravel.identity.notifications.service.NotificationConsumer;
import vn.smarttravel.identity.deletion.service.DeletionAckConsumer;
import vn.smarttravel.identity.preferences.service.CategoryInvalidationConsumer;

@Configuration
@ConditionalOnProperty(name="identity.transport.enabled",havingValue="true")
public class IdentityTransportConfiguration {
    @Bean ConfirmedPublisher confirmedPublisher(RabbitTemplate rabbit, @Value("${spring.rabbitmq.password}") String password) {
        if(password.isBlank()) throw new IllegalStateException("Broker workload credential is required");
        rabbit.setMandatory(true); return new ConfirmedPublisher(rabbit);
    }
    @Bean Declarables identityTopology(org.springframework.core.env.Environment environment) {
        var outbound=new TopicExchange("identity.events",true,false);
        var inbound=new TopicExchange("identity.inbound",true,false);
        var deadletters=new DirectExchange("identity.deadletters",true,false);
        var inbox=QueueBuilder.durable("identity.inbox").deadLetterExchange("identity.deadletters").deadLetterRoutingKey("rejected").build();
        var dlq=QueueBuilder.durable("identity.dlq").build();
        var declarations=new java.util.ArrayList<Declarable>(java.util.List.of(outbound,inbound,deadletters,inbox,dlq,
                BindingBuilder.bind(dlq).to(deadletters).with("rejected")));
        // A capture sink must not mask missing production subscribers/mandatory returns.
        if(java.util.Arrays.stream(environment.getActiveProfiles()).anyMatch(p -> p.equals("p01-local") || p.equals("test"))) {
            var capture=QueueBuilder.durable("identity.p01.capture").build();
            declarations.add(capture); declarations.add(BindingBuilder.bind(capture).to(outbound).with("identity.#"));
        }
        for(String type:java.util.List.of("catalog.category.changed.v1","catalog.business-claim.reviewed.v1","community.review.changed.v1","trip.changed.v1","domain.user-data-deleted.v1"))
            declarations.add(BindingBuilder.bind(inbox).to(inbound).with(type));
        return new Declarables(declarations);
    }
    @Bean SimpleRabbitListenerContainerFactory identityListenerFactory(ConnectionFactory connection, MeterRegistry metrics) {
        var factory=new SimpleRabbitListenerContainerFactory(); factory.setConnectionFactory(connection);
        factory.setConcurrentConsumers(1); factory.setMaxConcurrentConsumers(2); factory.setPrefetchCount(10);
        factory.setDefaultRequeueRejected(false);
        factory.setAdviceChain(RetryInterceptorBuilder.stateless().maxAttempts(3).backOffOptions(100,2,1000)
                .recoverer((message,cause) -> {
                    metrics.counter("identity.inbox.dlq").increment();
                    // Never emit exception causes/message bodies, which may contain PII or provider credentials.
                    throw new org.springframework.amqp.AmqpRejectAndDontRequeueException("Identity event rejected after bounded retries");
                }).build());
        return factory;
    }
    @Bean OutboxDispatcher outboxDispatcher(OutboxRepository repository, ConfirmedPublisher publisher, ObjectMapper json, TransactionTemplate tx, MeterRegistry metrics) {
        return new OutboxDispatcher(repository,publisher,json,tx,metrics);
    }
    @Bean IdentityEventListener identityEventListener(ObjectMapper json, NotificationConsumer notifications, DeletionAckConsumer deletions,
                                                    CategoryInvalidationConsumer categories, MeterRegistry metrics) {
        return new IdentityEventListener(json,notifications,deletions,categories,metrics);
    }
}
