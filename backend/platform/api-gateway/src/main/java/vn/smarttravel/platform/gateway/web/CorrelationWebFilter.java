package vn.smarttravel.platform.gateway.web;

import java.util.UUID;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class CorrelationWebFilter implements WebFilter {
    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        String trace = exchange.getRequest().getHeaders().getFirst("X-Correlation-Id");
        if (trace == null || !trace.matches("[A-Za-z0-9._-]{1,128}")) trace = UUID.randomUUID().toString();
        String correlationId = trace;
        ServerHttpRequest request = exchange.getRequest().mutate()
                .headers(headers -> headers.set("X-Correlation-Id", correlationId))
                .build();
        exchange.getResponse().getHeaders().set("X-Correlation-Id", correlationId);
        exchange.getAttributes().put("traceId", correlationId);
        return chain.filter(exchange.mutate().request(request).build())
                .contextWrite(context -> context.put("traceId", correlationId));
    }
}
