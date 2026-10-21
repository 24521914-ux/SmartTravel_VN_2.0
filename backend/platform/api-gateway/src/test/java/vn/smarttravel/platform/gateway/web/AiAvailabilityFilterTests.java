package vn.smarttravel.platform.gateway.web;

import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;
import static org.assertj.core.api.Assertions.assertThat;

class AiAvailabilityFilterTests {
    @Test
    void deferredRoutesNeverReachAuthenticationExchangeOrDispatcher() {
        for (String path : new String[] {"/api/intelligence", "/api/intelligence/api/v1/recommendations",
                "/api/intelligence/api/v1/interactions/batch", "/api/intelligence/api/v1/admin/models",
                "/api/%69ntelligence/api/v1/recommendations"}) {
            var exchange = MockServerWebExchange.from(MockServerHttpRequest.method(
                    org.springframework.http.HttpMethod.POST, java.net.URI.create(path)));
            var called = new AtomicBoolean();
            new AiAvailabilityFilter(false).filter(exchange, request -> {
                called.set(true);
                return Mono.empty();
            }).block();
            assertThat(called).as(path).isFalse();
            assertThat(exchange.getResponse().getStatusCode().value()).isEqualTo(503);
            assertThat(exchange.getResponse().getBodyAsString().block()).contains("FEATURE_DEFERRED");
        }
    }

    @Test
    void explicitEnablePreservesExistingPipeline() {
        var exchange = MockServerWebExchange.from(MockServerHttpRequest.post("/api/intelligence/api/v1/recommendations"));
        var called = new AtomicBoolean();
        new AiAvailabilityFilter(true).filter(exchange, request -> { called.set(true); return Mono.empty(); }).block();
        assertThat(called).isTrue();
    }

    @Test
    void nonAiAndPreflightContinueThroughExistingControls() {
        for (var request : new MockServerHttpRequest[] {
                MockServerHttpRequest.get("/api/catalog/api/v1/places").build(),
                MockServerHttpRequest.get("/api/intelligence-other/api/v1/test").build(),
                MockServerHttpRequest.options("/api/intelligence/api/v1/recommendations").build()}) {
            var called = new AtomicBoolean();
            new AiAvailabilityFilter(false).filter(MockServerWebExchange.from(request), exchange -> {
                called.set(true); return Mono.empty();
            }).block();
            assertThat(called).isTrue();
        }
    }
}
