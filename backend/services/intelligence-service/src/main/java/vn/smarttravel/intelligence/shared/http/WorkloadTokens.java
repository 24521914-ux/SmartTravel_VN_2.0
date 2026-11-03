package vn.smarttravel.intelligence.shared.http;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/**
 * Client-credentials tokens from Identity, cached per destination and renewed before expiry.
 * A statically configured token (tests, P01 tooling) still takes precedence.
 */
@Component
public class WorkloadTokens {
    private static final Duration RENEW_BEFORE = Duration.ofSeconds(60);
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2))
            .followRedirects(HttpClient.Redirect.NEVER).build();
    private final ObjectMapper json = new ObjectMapper();
    private final String uri, authorization;
    private final Map<String, Cached> cache = new ConcurrentHashMap<>();
    private record Cached(String token, Instant renewAt) {}

    public WorkloadTokens(@Value("${workload.token-uri:}") String uri, @Value("${workload.client-id:}") String client,
            @Value("${workload.client-secret:}") String secret) {
        this.uri = uri;
        // RFC 6749 §2.3.1: form-encode the client ID and secret before Basic encoding.
        this.authorization = uri.isBlank() || client.isBlank() || secret.isBlank() ? "" : "Basic " + Base64.getEncoder()
                .encodeToString((form(client) + ":" + form(secret)).getBytes(StandardCharsets.UTF_8));
    }

    public static WorkloadTokens disabled() { return new WorkloadTokens("", "", ""); }

    public boolean configured() { return !authorization.isEmpty(); }

    /** Production may replace a static token only with client credentials sent to a non-loopback HTTPS issuer. */
    public static boolean deployable(org.springframework.core.env.PropertyResolver env) {
        try {
            URI parsed = URI.create(env.getProperty("workload.token-uri", ""));
            String host = parsed.getHost();
            return "https".equals(parsed.getScheme()) && host != null && parsed.getUserInfo() == null
                    && !java.util.Set.of("localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]").contains(host)
                    && !env.getProperty("workload.client-id", "").isBlank()
                    && env.getProperty("workload.client-secret", "").length() >= 32;
        } catch (IllegalArgumentException invalid) { return false; }
    }

    /** Static token when set; otherwise an Identity-issued token, or "" when client credentials are not configured. */
    public String token(String staticToken, String audience, String scope) {
        if (staticToken != null && !staticToken.isBlank()) return staticToken;
        if (!configured()) return "";
        String key = audience + " " + scope;
        Cached cached = cache.get(key);
        if (cached != null && Instant.now().isBefore(cached.renewAt())) return cached.token();
        synchronized (this) {
            cached = cache.get(key);
            if (cached != null && Instant.now().isBefore(cached.renewAt())) return cached.token();
            cached = fetch(audience, scope);
            cache.put(key, cached);
            return cached.token();
        }
    }

    private Cached fetch(String audience, String scope) {
        try {
            var request = HttpRequest.newBuilder(URI.create(uri)).timeout(Duration.ofSeconds(3))
                    .header("Authorization", authorization).header("Accept", "application/json")
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .POST(HttpRequest.BodyPublishers.ofString("grant_type=client_credentials&audience=" + form(audience)
                            + "&scope=" + form(scope))).build();
            var response = http.send(request, HttpResponse.BodyHandlers.ofInputStream());
            byte[] body;
            try (InputStream stream = response.body()) { body = stream.readNBytes(16_384); }
            if (response.statusCode() != 200) throw new IllegalStateException("Unexpected token status");
            JsonNode token = json.readTree(body);
            String access = token.path("access_token").asText("");
            long expires = token.path("expires_in").asLong(0);
            if (access.isBlank() || expires <= 0) throw new IllegalStateException("Invalid token response");
            return new Cached(access, Instant.now().plusSeconds(Math.max(0, expires - RENEW_BEFORE.toSeconds())));
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw unavailable();
        } catch (Exception error) {
            // Never log the client secret, Authorization header or token response body.
            org.slf4j.LoggerFactory.getLogger(WorkloadTokens.class)
                    .warn("Workload token request failed for {} ({})", audience, error.getClass().getSimpleName());
            throw unavailable();
        }
    }

    private static ResponseStatusException unavailable() {
        return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "WORKLOAD_TOKEN_UNAVAILABLE");
    }

    private static String form(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }
}
