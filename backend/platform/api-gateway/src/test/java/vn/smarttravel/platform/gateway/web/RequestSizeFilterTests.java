package vn.smarttravel.platform.gateway.web;

import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.buffer.DataBufferUtils;
import org.springframework.http.MediaType;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;
import vn.smarttravel.platform.gateway.config.GatewayRouteProperties;
import static org.assertj.core.api.Assertions.*;

class RequestSizeFilterTests {
    private final RequestSizeFilter filter = new RequestSizeFilter(new GatewayRouteProperties(
            Map.of(), null, new GatewayRouteProperties.RequestLimits(1024), null));

    @Test void multipartMediaCanExceedJsonLimitAndRetainsItsBody() {
        for (String path : new String[]{"/api/catalog/api/v1/media", "/api/catalog/api/v1/admin/media"}) {
            var exchange = MockServerWebExchange.from(MockServerHttpRequest.post(path)
                    .contentType(MediaType.MULTIPART_FORM_DATA).body("x".repeat(2048)));
            var received = new AtomicInteger();
            filter.filter(exchange, next -> DataBufferUtils.join(next.getRequest().getBody()).doOnNext(buffer -> {
                received.set(buffer.readableByteCount()); DataBufferUtils.release(buffer);
            }).then()).block();
            assertThat(received.get()).isEqualTo(2048);
            assertThat(exchange.getResponse().getStatusCode()).isNull();
        }
    }
    @Test void jsonAndOtherMultipartRoutesRetainConfiguredLimit() {
        for (String path : new String[]{"/api/catalog/api/v1/admin/places", "/api/catalog/api/v1/media"}) {
            var type = path.endsWith("/media") ? MediaType.APPLICATION_JSON : MediaType.MULTIPART_FORM_DATA;
            var exchange = MockServerWebExchange.from(MockServerHttpRequest.post(path).contentType(type).body("x".repeat(2048)));
            filter.filter(exchange, next -> { throw new AssertionError("Oversized request reached upstream"); }).block();
            assertThat(exchange.getResponse().getStatusCode().value()).isEqualTo(413);
        }
    }
    @Test void uploadLimitIsStillBoundedBeforeReadingBody() {
        var exchange = MockServerWebExchange.from(MockServerHttpRequest.post("/api/catalog/api/v1/media")
                .contentType(MediaType.MULTIPART_FORM_DATA).contentLength(11L * 1024 * 1024 + 1).body(Mono.empty()));
        filter.filter(exchange, next -> { throw new AssertionError("Oversized media reached upstream"); }).block();
        assertThat(exchange.getResponse().getStatusCode().value()).isEqualTo(413);
    }
}
