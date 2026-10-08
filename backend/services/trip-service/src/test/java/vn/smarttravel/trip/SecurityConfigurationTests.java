package vn.smarttravel.trip;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtValidators;
import static org.assertj.core.api.Assertions.assertThat;

class SecurityConfigurationTests {
    private Jwt token(String issuer, String audience, Instant expiry) {
        return Jwt.withTokenValue("unit-test-only")
                .header("alg", "RS256").subject("fixture-user")
                .issuer(issuer).audience(List.of(audience))
                .issuedAt(expiry.minusSeconds(600)).expiresAt(expiry).build();
    }

    @Test
    void acceptsExpectedAudienceAndRejectsAnotherService() {
        var validator = SecurityConfiguration.audienceValidator("trip");
        assertThat(validator.validate(token("local-test", "trip", Instant.now().plusSeconds(60))).hasErrors()).isFalse();
        assertThat(validator.validate(token("local-test", "catalog", Instant.now().plusSeconds(60))).hasErrors()).isTrue();
    }

    @Test
    void rejectsWrongIssuerAndExpiredToken() {
        var validator = JwtValidators.createDefaultWithIssuer("local-test");
        assertThat(validator.validate(token("wrong", "trip", Instant.now().plusSeconds(60))).hasErrors()).isTrue();
        assertThat(validator.validate(token("local-test", "trip", Instant.now().minusSeconds(300))).hasErrors()).isTrue();
    }
}
