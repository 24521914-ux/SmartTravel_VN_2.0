package vn.smarttravel.identity.auth.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.time.Duration;
import java.util.Collections;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import vn.smarttravel.identity.shared.exception.IdentityException;

@Component
class DefaultSocialTokenVerifier implements SocialTokenVerifier {
    private static final String FACEBOOK_GRAPH_BASE = "https://graph.facebook.com/v21.0";

    private final String googleClientId;
    private final String facebookAppId;
    private final String facebookAppSecret;
    private final GoogleIdTokenVerifier googleVerifier;
    private final HttpClient httpClient;
    private final ObjectMapper json;

    DefaultSocialTokenVerifier(
            @Value("${identity.social.google.client-id:}") String googleClientId,
            @Value("${identity.social.facebook.app-id:}") String facebookAppId,
            @Value("${identity.social.facebook.app-secret:}") String facebookAppSecret,
            ObjectMapper json) {
        this.googleClientId = googleClientId == null ? "" : googleClientId.trim();
        this.facebookAppId = facebookAppId == null ? "" : facebookAppId.trim();
        this.facebookAppSecret = facebookAppSecret == null ? "" : facebookAppSecret.trim();
        this.json = json;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();
        this.googleVerifier = this.googleClientId.isEmpty()
                ? null
                : new GoogleIdTokenVerifier.Builder(new NetHttpTransport(), GsonFactory.getDefaultInstance())
                        .setAudience(Collections.singletonList(this.googleClientId))
                        .build();
    }

    @Override
    public VerifiedSocialProfile verifyGoogle(String idToken) {
        if (googleVerifier == null) {
            throw new IdentityException(503, "SOCIAL_PROVIDER_NOT_CONFIGURED");
        }
        GoogleIdToken verified;
        try {
            verified = googleVerifier.verify(idToken);
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            throw IdentityException.unauthorized();
        } catch (IOException e) {
            throw new IdentityException(503, "SOCIAL_PROVIDER_UNAVAILABLE");
        }
        if (verified == null) {
            throw IdentityException.unauthorized();
        }
        GoogleIdToken.Payload payload = verified.getPayload();
        String subject = payload.getSubject();
        String email = payload.getEmail();
        boolean emailVerified = Boolean.TRUE.equals(payload.getEmailVerified());
        Object nameClaim = payload.get("name");
        Object pictureClaim = payload.get("picture");
        String displayName = nameClaim instanceof String s ? s : "";
        String avatarUrl = pictureClaim instanceof String s ? s : null;
        return new VerifiedSocialProfile("GOOGLE", subject, email, emailVerified, displayName, avatarUrl);
    }

    @Override
    public VerifiedSocialProfile verifyFacebook(String accessToken) {
        if (facebookAppId.isEmpty()) {
            throw new IdentityException(503, "SOCIAL_PROVIDER_NOT_CONFIGURED");
        }
        if (!facebookAppSecret.isEmpty()) {
            verifyFacebookTokenOwnership(accessToken);
        }
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(FACEBOOK_GRAPH_BASE + "/me?fields=id,name,email,picture.type(large)"))
                .header("Authorization", "Bearer " + accessToken)
                .header("Accept", "application/json")
                .timeout(Duration.ofSeconds(5))
                .GET()
                .build();
        JsonNode body = executeJson(request);
        String id = body.path("id").asText("");
        if (id.isBlank()) {
            throw IdentityException.unauthorized();
        }
        String email = body.path("email").asText("");
        String name = body.path("name").asText("");
        String avatar = body.path("picture").path("data").path("url").asText(null);
        return new VerifiedSocialProfile("FACEBOOK", id, email, !email.isBlank(), name, avatar);
    }

    private void verifyFacebookTokenOwnership(String accessToken) {
        String encodedInput = URLEncoder.encode(accessToken, StandardCharsets.UTF_8);
        String encodedAppToken = URLEncoder.encode(facebookAppId + "|" + facebookAppSecret, StandardCharsets.UTF_8);
        HttpRequest debugRequest = HttpRequest.newBuilder()
                .uri(URI.create(FACEBOOK_GRAPH_BASE + "/debug_token?input_token=" + encodedInput + "&access_token=" + encodedAppToken))
                .header("Accept", "application/json")
                .timeout(Duration.ofSeconds(5))
                .GET()
                .build();
        JsonNode data = executeJson(debugRequest).path("data");
        boolean valid = data.path("is_valid").asBoolean(false);
        String appId = data.path("app_id").asText("");
        if (!valid || !facebookAppId.equals(appId)) {
            throw IdentityException.unauthorized();
        }
    }

    private JsonNode executeJson(HttpRequest request) {
        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 400 || response.statusCode() == 401 || response.statusCode() == 403) {
                throw IdentityException.unauthorized();
            }
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IdentityException(503, "SOCIAL_PROVIDER_UNAVAILABLE");
            }
            return json.readTree(response.body());
        } catch (IdentityException e) {
            throw e;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IdentityException(503, "SOCIAL_PROVIDER_UNAVAILABLE");
        } catch (IOException e) {
            throw new IdentityException(503, "SOCIAL_PROVIDER_UNAVAILABLE");
        }
    }
}
