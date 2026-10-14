package vn.smarttravel.platform.gateway.web;

import org.springframework.boot.web.reactive.error.ErrorWebExceptionHandler;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;
import vn.smarttravel.platform.gateway.security.GatewayErrors;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class GatewayExceptionHandler implements ErrorWebExceptionHandler {
    @Override
    public Mono<Void> handle(ServerWebExchange exchange, Throwable ex) {
        if (exchange.getResponse().isCommitted()) return Mono.error(ex);
        if (ex instanceof ResponseStatusException status) {
            HttpStatus http = HttpStatus.valueOf(status.getStatusCode().value());
            return GatewayErrors.write(exchange, http.value(), code(http), http.getReasonPhrase());
        }
        return GatewayErrors.write(exchange, 502, "UPSTREAM_ERROR", "Gateway could not complete the upstream request");
    }
    private static String code(HttpStatus status) { return status.name(); }
}
