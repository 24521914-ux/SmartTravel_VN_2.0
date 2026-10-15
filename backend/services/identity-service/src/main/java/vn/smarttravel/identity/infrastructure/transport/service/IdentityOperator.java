package vn.smarttravel.identity.infrastructure.transport.service;

import java.util.UUID;
import org.springframework.amqp.rabbit.connection.CachingConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import vn.smarttravel.identity.infrastructure.transport.repository.OutboxRepository;

/** Explicit, single-operation maintenance process. Never exposed over HTTP. */
@Component
@ConditionalOnProperty(name = "identity.operator.enabled", havingValue = "true")
public class IdentityOperator implements ApplicationRunner {
    private final Environment env;
    private final OutboxRepository repository;
    private final TransactionTemplate tx;
    private final ConfigurableApplicationContext context;

    public IdentityOperator(Environment env, OutboxRepository repository, TransactionTemplate tx,
                            ConfigurableApplicationContext context) {
        this.env = env; this.repository = repository; this.tx = tx; this.context = context;
    }

    @Override public void run(ApplicationArguments args) {
        if (env.getProperty("identity.workers.enabled", Boolean.class, true)
                || env.getProperty("identity.transport.enabled", Boolean.class, false))
            throw new IllegalStateException("Operator mode requires workers and transport disabled");
        String action = env.getRequiredProperty("identity.operator.action");
        boolean changed;
        if ("replay-outbox".equals(action)) {
            UUID event = UUID.fromString(env.getRequiredProperty("identity.operator.event-id"));
            changed = Boolean.TRUE.equals(tx.execute(status -> repository.replay(event)));
        } else if ("replay-dlq".equals(action)) {
            String password = env.getRequiredProperty("identity.operator.broker-password");
            if (password.isBlank()) throw new IllegalStateException("Operator broker credential is required");
            var connection = new CachingConnectionFactory(env.getRequiredProperty("spring.rabbitmq.host"),
                    env.getRequiredProperty("spring.rabbitmq.port", Integer.class));
            connection.setUsername(env.getProperty("identity.operator.broker-user", "identity_operator"));
            connection.setPassword(password);
            connection.setVirtualHost(env.getRequiredProperty("spring.rabbitmq.virtual-host"));
            connection.setConnectionTimeout(2000);
            connection.setPublisherConfirmType(CachingConnectionFactory.ConfirmType.CORRELATED);
            connection.setPublisherReturns(true);
            try {
                var rabbit = new RabbitTemplate(connection); rabbit.setMandatory(true);
                changed = new DeadLetterReplay(rabbit, new ConfirmedPublisher(rabbit), repository, tx).replayOne();
            } finally { connection.destroy(); }
        } else throw new IllegalArgumentException("Supported operator actions: replay-dlq, replay-outbox");
        System.out.println("Identity operator " + action + ": " + (changed ? "requeued" : "no eligible event"));
        context.close();
    }
}
