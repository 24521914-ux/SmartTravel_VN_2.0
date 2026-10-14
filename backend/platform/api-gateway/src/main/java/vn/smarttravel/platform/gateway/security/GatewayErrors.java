package vn.smarttravel.platform.gateway.security;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.MediaType;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

public final class GatewayErrors {
    private GatewayErrors() {}

    public static Mono<Void> write(ServerWebExchange exchange, int status, String code, String message) {
        var response = exchange.getResponse();
        response.setRawStatusCode(status);
        if(status==401) response.getHeaders().set("WWW-Authenticate","Bearer");
        response.getHeaders().setContentType(MediaType.APPLICATION_JSON);
        String trace = traceId(exchange);
        String body = "{\"code\":\"" + escape(code) + "\",\"message\":\"" + escape(message)
                + "\",\"traceId\":\"" + escape(trace) + "\",\"fieldErrors\":[]}";
        DataBuffer buffer = response.bufferFactory().wrap(body.getBytes(StandardCharsets.UTF_8));
        return response.writeWith(Mono.just(buffer));
    }

    public static Map<String, Object> body(ServerWebExchange exchange, String code, String message) {
        return Map.of("code", code, "message", message, "traceId", traceId(exchange), "fieldErrors", List.of());
    }

    static String traceId(ServerWebExchange exchange) {
        String header = exchange.getRequest().getHeaders().getFirst("X-Correlation-Id");
        if (header != null && !header.isBlank()) return header;
        return exchange.getRequest().getId();
    }

    private static String escape(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
