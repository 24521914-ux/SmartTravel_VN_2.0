package vn.smarttravel.intelligence.shared.http;

import static org.assertj.core.api.Assertions.*;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.web.server.ResponseStatusException;

class WorkloadTokensTests {
    private static final String SECRET = "unit-test-only-workload-secret-0123456789";

    private static HttpServer issuer(int status, long expiresIn, List<String> requests) throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/token", exchange -> {
            requests.add(exchange.getRequestHeaders().getFirst("Authorization") + "|"
                    + new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] body = ("{\"access_token\":\"issued-" + requests.size() + "\",\"token_type\":\"Bearer\",\"expires_in\":"
                    + expiresIn + "}").getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(status, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
        return server;
    }

    private static String uri(HttpServer server) { return "http://127.0.0.1:" + server.getAddress().getPort() + "/token"; }

    @Test void staticTokenWinsAndMissingClientCredentialsYieldNoToken() {
        assertThat(WorkloadTokens.disabled().token("fixture", "catalog", "catalog:places:read")).isEqualTo("fixture");
        assertThat(WorkloadTokens.disabled().token("", "catalog", "catalog:places:read")).isEmpty();
        assertThat(new WorkloadTokens("http://127.0.0.1:1/token", "intelligence", "").configured()).isFalse();
    }

    @Test void requestsClientCredentialsGrantOnceAndReusesTheCachedToken() throws Exception {
        var requests = new ArrayList<String>();
        var server = issuer(200, 600, requests);
        try {
            var tokens = new WorkloadTokens(uri(server), "intelligence", SECRET);
            assertThat(tokens.token("", "catalog", "catalog:places:read")).isEqualTo("issued-1");
            assertThat(tokens.token(null, "catalog", "catalog:places:read")).isEqualTo("issued-1");
            assertThat(requests).hasSize(1);
            String expected = "Basic " + Base64.getEncoder().encodeToString(("intelligence:" + SECRET).getBytes(StandardCharsets.UTF_8));
            assertThat(requests.getFirst()).isEqualTo(expected + "|grant_type=client_credentials&audience=catalog&scope=catalog%3Aplaces%3Aread");
        } finally { server.stop(0); }
    }

    @Test void renewsTokensThatAreAboutToExpire() throws Exception {
        var requests = new ArrayList<String>();
        var server = issuer(200, 60, requests);
        try {
            var tokens = new WorkloadTokens(uri(server), "intelligence", SECRET);
            assertThat(tokens.token("", "catalog", "catalog:places:read")).isEqualTo("issued-1");
            assertThat(tokens.token("", "catalog", "catalog:places:read")).isEqualTo("issued-2");
        } finally { server.stop(0); }
    }

    @Test void rejectedClientBecomesServiceUnavailableWithoutLeakingTheSecret() throws Exception {
        var server = issuer(401, 600, new ArrayList<>());
        try {
            var tokens = new WorkloadTokens(uri(server), "intelligence", SECRET);
            assertThatThrownBy(() -> tokens.token("", "catalog", "catalog:places:read"))
                    .isInstanceOf(ResponseStatusException.class)
                    .hasMessageContaining("WORKLOAD_TOKEN_UNAVAILABLE").hasMessageNotContaining(SECRET);
        } finally { server.stop(0); }
    }

    @Test void productionAcceptsOnlyHttpsIssuerAndStrongSecret() {
        var env = new MockEnvironment().withProperty("workload.token-uri", "https://identity.example/internal/v1/security/workload-token")
                .withProperty("workload.client-id", "intelligence").withProperty("workload.client-secret", SECRET);
        assertThat(WorkloadTokens.deployable(env)).isTrue();
        assertThat(WorkloadTokens.deployable(env.withProperty("workload.client-secret", "short"))).isFalse();
        env.setProperty("workload.client-secret", SECRET);
        assertThat(WorkloadTokens.deployable(env.withProperty("workload.token-uri", "http://identity:8101/token"))).isFalse();
        assertThat(WorkloadTokens.deployable(env.withProperty("workload.token-uri", "https://127.0.0.1/token"))).isFalse();
        assertThat(WorkloadTokens.deployable(new MockEnvironment())).isFalse();
    }
}
