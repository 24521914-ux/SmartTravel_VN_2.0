package vn.smarttravel.platform.gateway;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@org.springframework.test.context.ActiveProfiles("test")
@TestPropertySource(properties = {
        "security.jwt.jwk-set-uri=http://127.0.0.1:1/jwks",
        "smarttravel.gateway.limits.max-body-bytes=8",
        "smarttravel.gateway.services.catalog.uri=http://127.0.0.1:1",
        "smarttravel.gateway.cors.allowed-origins=http://localhost:5173"
})
class GatewayHttpTests {
    @Autowired WebTestClient client;

    @Test
    void healthIsPublic() {
        client.get().uri("/actuator/health").exchange().expectStatus().isOk();
    }

    @Test
    void apiRequiresJwtAndUsesContractErrorShape() {
        client.get().uri("/api/catalog/places")
                .header("X-Correlation-Id", "trace-test")
                .exchange()
                .expectStatus().isUnauthorized()
                .expectHeader().valueEquals("X-Correlation-Id", "trace-test")
                .expectBody().jsonPath("$.code").isEqualTo("UNAUTHORIZED")
                .jsonPath("$.traceId").isEqualTo("trace-test")
                .jsonPath("$.fieldErrors").isArray();
    }

    @Test
    void rejectsOversizedRequestsBeforeUpstream() {
        client.post().uri("/api/catalog/places")
                .header("Content-Length", "9")
                .bodyValue("123456789")
                .exchange()
                .expectStatus().isEqualTo(413)
                .expectBody().jsonPath("$.code").isEqualTo("REQUEST_TOO_LARGE");
    }

    @Test
    void corsIsAllowlisted() {
        client.options().uri("/api/catalog/places")
                .header("Origin", "http://localhost:5173")
                .header("Access-Control-Request-Method", "GET")
                .exchange()
                .expectStatus().isOk()
                .expectHeader().valueEquals("Access-Control-Allow-Origin", "http://localhost:5173");
    }
}
