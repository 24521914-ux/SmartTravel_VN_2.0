package vn.smarttravel.catalog.infrastructure.transport.service;

import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.connection.CorrelationData;
import org.springframework.amqp.rabbit.core.RabbitTemplate;

public class ConfirmedPublisher {
    private final RabbitTemplate rabbit;
    public ConfirmedPublisher(RabbitTemplate rabbit) { this.rabbit=rabbit; }
    public void publish(String exchange, String routingKey, byte[] body, String messageId) {
        var properties=new MessageProperties(); properties.setContentType("application/json");
        properties.setDeliveryMode(MessageDeliveryMode.PERSISTENT); properties.setMessageId(messageId);
        var correlation=new CorrelationData(UUID.randomUUID().toString());
        rabbit.send(exchange,routingKey,new Message(body,properties),correlation);
        try {
            var confirm=correlation.getFuture().get(5,TimeUnit.SECONDS);
            if(!confirm.isAck() || correlation.getReturned()!=null) throw new IllegalStateException("Broker did not route event");
        } catch(Exception e) { throw new IllegalStateException("Broker confirmation failed"); }
    }
}
