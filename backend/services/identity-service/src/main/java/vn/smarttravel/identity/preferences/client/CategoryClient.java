package vn.smarttravel.identity.preferences.client;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import vn.smarttravel.identity.shared.exception.IdentityException;

/** Uses the frozen public Catalog pagination contract, never a cross-service DB or admin credential. */
@Component
public class CategoryClient {
    private final String baseUrl;
    private final ObjectMapper json;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).followRedirects(HttpClient.Redirect.NEVER).build();
    public CategoryClient(@Value("${identity.catalog.base-url:}") String baseUrl, ObjectMapper json) {
        this.baseUrl=baseUrl; this.json=json;
    }

    public void requireActive(List<UUID> ids) {
        if (ids.isEmpty()) return;
        if (baseUrl.isBlank()) throw new IdentityException(503,"CATEGORY_VALIDATION_UNAVAILABLE");
        Set<UUID> remaining = new HashSet<>(ids);
        Set<String> cursors = new HashSet<>();
        String cursor = null;
        // Bound total latency and pages; fail closed rather than guessing when Catalog is unavailable.
        long deadline=System.nanoTime()+Duration.ofSeconds(5).toNanos();
        try {
            for (int page=0; page<50; page++) {
                long nanos=deadline-System.nanoTime();
                if(nanos<=0) throw new IllegalStateException();
                String url=baseUrl.replaceAll("/$","")+"/api/v1/categories?limit=100";
                if(cursor!=null) url+="&cursor="+URLEncoder.encode(cursor,StandardCharsets.UTF_8);
                var request=HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofNanos(Math.min(nanos,Duration.ofSeconds(2).toNanos()))).GET().build();
                var response=http.send(request,HttpResponse.BodyHandlers.ofString());
                if(response.statusCode()!=200 || response.body().length()>1_000_000) throw new IllegalStateException();
                var body=json.readTree(response.body());
                if(!body.path("items").isArray() || body.path("items").size()>100 || !body.has("next_cursor")) throw new IllegalStateException();
                for(var item:body.path("items")) {
                    if(!item.path("active").isBoolean()) throw new IllegalStateException();
                    UUID id=UUID.fromString(item.path("id").asText());
                    if(item.path("active").booleanValue()) remaining.remove(id);
                }
                if(remaining.isEmpty()) return;
                var next=body.get("next_cursor");
                if(next.isNull()) throw new IdentityException(400,"INVALID_CATEGORY");
                if(!next.isTextual() || next.asText().isBlank() || next.asText().length()>1024 || !cursors.add(next.asText())) throw new IllegalStateException();
                cursor=next.asText();
            }
            throw new IllegalStateException();
        } catch(IdentityException e) { throw e; }
        catch(InterruptedException e) { Thread.currentThread().interrupt(); throw new IdentityException(503,"CATEGORY_VALIDATION_UNAVAILABLE"); }
        catch(Exception e) { throw new IdentityException(503,"CATEGORY_VALIDATION_UNAVAILABLE"); }
    }
}
