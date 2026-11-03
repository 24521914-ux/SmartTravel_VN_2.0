package vn.smarttravel.community.security.config;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.security.oauth2.core.*;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * Live Identity check for human tokens. Workload credentials have no session.
 * An optional short cache of positive answers per session and role set (F-33) bounds
 * revocation delay by the cache window, as the access-token policy already allows;
 * denials are never cached and the Gateway still exchanges through Identity per request.
 */
final class LiveSessionValidator implements OAuth2TokenValidator<Jwt> {
    private static final int MAX_ENTRIES=10_000;
    private final String uri;
    private final Duration cacheFor;
    private final Map<String,Instant> active=new ConcurrentHashMap<>();
    private final HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
    LiveSessionValidator(String uri) { this(uri, Duration.ZERO); }
    LiveSessionValidator(String uri, Duration cacheFor) {
        this.uri=uri; this.cacheFor=cacheFor.isNegative() ? Duration.ZERO : cacheFor;
    }
    public OAuth2TokenValidatorResult validate(Jwt jwt) {
        if (uri.isBlank() || jwt.hasClaim("client_id") && !jwt.hasClaim("sid")) return OAuth2TokenValidatorResult.success();
        if (!jwt.hasClaim("sid")) return denied();
        String key=jwt.getClaimAsString("sid")+"|"+jwt.getClaim("roles");
        Instant now=Instant.now(), until=active.get(key);
        if (until!=null && now.isBefore(until)) return OAuth2TokenValidatorResult.success();
        try {
            var request=HttpRequest.newBuilder(URI.create(uri)).timeout(Duration.ofSeconds(3))
                    .header("Authorization","Bearer "+jwt.getTokenValue()).POST(HttpRequest.BodyPublishers.noBody()).build();
            var response=client.send(request,HttpResponse.BodyHandlers.discarding());
            if (response.statusCode()!=200) { active.remove(key); return denied(); }
            remember(key,now,jwt.getExpiresAt());
            return OAuth2TokenValidatorResult.success();
        } catch (InterruptedException e) { Thread.currentThread().interrupt(); return denied(); }
        catch (Exception e) { return denied(); }
    }
    private void remember(String key, Instant now, Instant expires) {
        if (cacheFor.isZero()) return;
        if (active.size()>=MAX_ENTRIES) active.entrySet().removeIf(entry -> !now.isBefore(entry.getValue()));
        if (active.size()>=MAX_ENTRIES) active.clear();
        Instant until=now.plus(cacheFor);
        active.put(key, expires!=null && expires.isBefore(until) ? expires : until);
    }
    private static OAuth2TokenValidatorResult denied() {
        return OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token","Session is inactive or Identity is unavailable",null));
    }
}
