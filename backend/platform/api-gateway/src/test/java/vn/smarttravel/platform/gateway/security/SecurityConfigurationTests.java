package vn.smarttravel.platform.gateway.security;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;

import static org.assertj.core.api.Assertions.assertThat;

class SecurityConfigurationTests {
    @Test
    void audienceValidatorRequiresGatewayAudience() {
        var jwt = jwt(Map.of("aud", List.of("api-gateway")));
        assertThat(SecurityConfiguration.audienceValidator("api-gateway").validate(jwt).hasErrors()).isFalse();
        assertThat(SecurityConfiguration.audienceValidator("catalog-service").validate(jwt).hasErrors()).isTrue();
    }

    @Test
    void requiredClaimRejectsMissingJti() {
        assertThat(SecurityConfiguration.requiredClaim("jti").validate(jwt(Map.of())).hasErrors()).isTrue();
    }

    private static Jwt jwt(Map<String, Object> claims) {
        var all = new java.util.HashMap<String, Object>(claims);
        all.putIfAbsent("sub", "00000000-0000-0000-0000-000000000001");
        return new Jwt("token", Instant.now(), Instant.now().plusSeconds(60), Map.of("alg", "none"), all);
    }
}
