package vn.smarttravel.platform.gateway.web;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;
import vn.smarttravel.platform.gateway.config.GatewayRouteProperties;
import vn.smarttravel.platform.gateway.security.GatewayErrors;
import org.springframework.core.io.buffer.DataBufferUtils;
import org.springframework.core.io.buffer.DataBufferLimitException;
import org.springframework.http.server.reactive.ServerHttpRequestDecorator;
import reactor.core.publisher.Flux;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class RequestSizeFilter implements WebFilter {
    private final long maxBodyBytes;
    public RequestSizeFilter(GatewayRouteProperties properties) { this.maxBodyBytes = properties.limits().maxBodyBytes(); }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        String path = exchange.getRequest().getPath().value();
        var contentType = exchange.getRequest().getHeaders().getContentType();
        boolean mediaUpload = exchange.getRequest().getMethod() == org.springframework.http.HttpMethod.POST
                && (path.equals("/api/catalog/api/v1/media") || path.equals("/api/catalog/api/v1/admin/media"))
                && contentType != null && org.springframework.http.MediaType.MULTIPART_FORM_DATA.isCompatibleWith(contentType);
        // Catalog accepts a 10 MB file plus multipart framing. JSON endpoints
        // retain the configured lower bound, including forged upload requests.
        long requestLimit = mediaUpload ? 11L * 1024 * 1024 : maxBodyBytes;
        long length = exchange.getRequest().getHeaders().getContentLength();
        if (length > requestLimit) {
            exchange.getResponse().getHeaders().set(HttpHeaders.CONNECTION, "close");
            return GatewayErrors.write(exchange, 413, "REQUEST_TOO_LARGE", "Request body exceeds configured gateway limit");
        }
        return DataBufferUtils.join(exchange.getRequest().getBody(), Math.toIntExact(requestLimit))
                .defaultIfEmpty(exchange.getResponse().bufferFactory().wrap(new byte[0]))
                .flatMap(buffer -> {
                    byte[] bytes = new byte[buffer.readableByteCount()];
                    buffer.read(bytes); DataBufferUtils.release(buffer);
                    var request = new ServerHttpRequestDecorator(exchange.getRequest()) {
                        @Override public Flux<org.springframework.core.io.buffer.DataBuffer> getBody() {
                            return Flux.defer(() -> Flux.just(exchange.getResponse().bufferFactory().wrap(bytes)));
                        }
                    };
                    return chain.filter(exchange.mutate().request(request).build());
                })
                .onErrorResume(DataBufferLimitException.class, error ->
                        GatewayErrors.write(exchange, 413, "REQUEST_TOO_LARGE", "Request body exceeds configured gateway limit"));
    }
}
