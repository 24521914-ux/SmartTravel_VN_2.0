package vn.smarttravel.intelligence.security.config;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import org.springframework.security.oauth2.core.*;
import org.springframework.security.oauth2.jwt.Jwt;

/** Live Identity check for human tokens. Workload credentials have no session. */
final class LiveSessionValidator implements OAuth2TokenValidator<Jwt> {
    private final String uri;
    private final HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
    LiveSessionValidator(String uri) { this.uri=uri; }
    public OAuth2TokenValidatorResult validate(Jwt jwt) {
        if (uri.isBlank() || jwt.hasClaim("client_id") && !jwt.hasClaim("sid")) return OAuth2TokenValidatorResult.success();
        if (!jwt.hasClaim("sid")) return denied();
        try {
            var request=HttpRequest.newBuilder(URI.create(uri)).timeout(Duration.ofSeconds(3))
                    .header("Authorization","Bearer "+jwt.getTokenValue()).POST(HttpRequest.BodyPublishers.noBody()).build();
            var response=client.send(request,HttpResponse.BodyHandlers.discarding());
            return response.statusCode()==200 ? OAuth2TokenValidatorResult.success() : denied();
        } catch (InterruptedException e) { Thread.currentThread().interrupt(); return denied(); }
        catch (Exception e) { return denied(); }
    }
    private static OAuth2TokenValidatorResult denied() {
        return OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token","Session is inactive or Identity is unavailable",null));
    }
}
