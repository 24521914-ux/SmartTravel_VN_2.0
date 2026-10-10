package vn.smarttravel.identity.security.service;

import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.SignedJWT;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.env.MockEnvironment;
import static org.assertj.core.api.Assertions.*;

class IssuerKeysTests {
    @TempDir Path directory;
    @Test void productionCannotGenerateKeysOrCombineLocalProfiles() {
        var prod = new MockEnvironment(); prod.setActiveProfiles("prod");
        assertThatThrownBy(() -> new IssuerKeys(prod, "", "", "issuer", "identity")).isInstanceOf(IllegalStateException.class);
        prod.setActiveProfiles("prod", "p01-local");
        assertThatThrownBy(() -> new IssuerKeys(prod, "exists.json", "a", "issuer", "identity")).isInstanceOf(IllegalStateException.class);
    }
    @Test void localIssuerHasRequiredClaimsAndOnlyExposesPublicJwk() throws Exception {
        var env = new MockEnvironment(); env.setActiveProfiles("test");
        var issuer = new IssuerKeys(env, "", "", "issuer", "identity,catalog");
        var token = SignedJWT.parse(issuer.issue(UUID.randomUUID(), UUID.randomUUID(), List.of("USER")));
        assertThat(token.getJWTClaimsSet().getIssuer()).isEqualTo("issuer");
        assertThat(token.getJWTClaimsSet().getAudience()).containsExactly("identity", "catalog");
        assertThat(token.getJWTClaimsSet().getJWTID()).isNotBlank();
        assertThat(token.getJWTClaimsSet().getExpirationTime().getTime()-token.getJWTClaimsSet().getIssueTime().getTime()).isEqualTo(600000);
        assertThat(token.getJWTClaimsSet().getStringClaim("scope")).doesNotContain("admin", "status:read");
        String publicJson = new JWKSet(JWKSet.parse(issuer.jwks()).getKeys()).toString();
        assertThat(publicJson).contains("RS256", "sig").doesNotContain("\"d\"", "\"p\"", "\"q\"");
    }
    @Test void persistedRotationRetainsOldPublicKeyAndSignsWithNewKey() throws Exception {
        var old = new RSAKeyGenerator(2048).keyID("old").generate();
        var next = new RSAKeyGenerator(2048).keyID("new").generate();
        Path file = directory.resolve("keys.json");
        Files.writeString(file, new JWKSet(List.of(old.toPublicJWK(), next)).toString(false));
        var env = new MockEnvironment(); env.setActiveProfiles("prod");
        var issuer = new IssuerKeys(env, file.toString(), "new", "issuer", "identity");
        assertThat(JWKSet.parse(issuer.jwks()).getKeys()).hasSize(2).allMatch(k -> !k.isPrivate());
        assertThat(SignedJWT.parse(issuer.issue(UUID.randomUUID(), UUID.randomUUID(), List.of("USER"))).getHeader().getKeyID()).isEqualTo("new");
        assertThatThrownBy(() -> new IssuerKeys(env, file.toString(), "old", "issuer", "identity")).isInstanceOf(IllegalStateException.class);
    }
}
