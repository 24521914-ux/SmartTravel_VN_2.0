package vn.smarttravel.community.shared.http;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Bounds dependency response bytes and the complete request/body deadline. */
public final class BoundedJsonClient {
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2))
            .followRedirects(HttpClient.Redirect.NEVER).build();
    private final ObjectMapper json = new ObjectMapper();
    private final String base;
    private final String token;
    public BoundedJsonClient(String base, String token) {
        this.base = base.replaceAll("/$", "");
        this.token = token;
    }
    public Map<String, Object> request(String method, String path, Map<String, ?> body) {
        try {
            var request = HttpRequest.newBuilder(URI.create(base + path)).timeout(Duration.ofSeconds(2))
                    .header("Authorization", "Bearer " + token).header("Accept", "application/json");
            if (body == null) request.method(method, HttpRequest.BodyPublishers.noBody());
            else request.header("Content-Type", "application/json")
                    .method(method, HttpRequest.BodyPublishers.ofByteArray(json.writeValueAsBytes(body)));
            var response = http.send(request.build(), new LimitedBodyHandler(1_000_000, Duration.ofSeconds(2)));
            if (response.statusCode() != 200) throw new IllegalStateException("Unexpected dependency status");
            Map<String, Object> result = json.readValue(response.body(), new TypeReference<>() {});
            if (result == null) throw new IllegalStateException("Missing dependency response");
            return result;
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Dependency unavailable");
        } catch (Exception error) {
            // Do not expose credential-bearing request headers or provider response details.
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Dependency unavailable");
        }
    }
}
