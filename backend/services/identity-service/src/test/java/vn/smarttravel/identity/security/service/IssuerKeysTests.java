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
    @Test void destinationExchangePreservesSessionBoundsAndDoesNotIssueWorkloadPrivileges() throws Exception {
        var env=new MockEnvironment(); env.setActiveProfiles("p02-local");
        var issuer=new IssuerKeys(env,"","","http://identity:8101","identity,catalog,community,trip,ingestion,intelligence");
        UUID user=UUID.randomUUID(), session=UUID.randomUUID();
        var deadline=java.time.Instant.now().plusSeconds(30);
        for(String destination:List.of("identity","catalog","community","trip","ingestion","intelligence")) {
            String token=issuer.exchange(user,session,List.of("USER","BUSINESS","ADMIN"),destination,deadline);
            assertThat(token.length()).isLessThanOrEqualTo(1024);
            var signed=SignedJWT.parse(token);
            assertThat(signed.verify(new com.nimbusds.jose.crypto.RSASSAVerifier(issuer.verificationKey()))).isTrue();
            var claims=signed.getJWTClaimsSet();
            assertThat(claims.getSubject()).isEqualTo(user.toString());
            assertThat(claims.getStringClaim("sid")).isEqualTo(session.toString());
            assertThat(claims.getAudience()).contains("identity",destination);
            assertThat(claims.getExpirationTime().toInstant()).isBeforeOrEqualTo(deadline);
            assertThat(claims.getStringClaim("scope")).isEqualTo(destination+":read "+destination+":write "+destination+":admin");
            assertThat(claims.getClaim("client_id")).isNull();
        }
        assertThatThrownBy(() -> issuer.exchange(user,session,List.of("USER"),"unknown",deadline)).isInstanceOf(IllegalArgumentException.class);
    }
    @TempDir Path directory;
    @Test void productionCannotGenerateKeysOrCombineLocalProfiles() {
        var prod = new MockEnvironment(); prod.setActiveProfiles("prod");
        assertThatThrownBy(() -> new IssuerKeys(prod, "", "", "issuer", "identity")).isInstanceOf(IllegalStateException.class);
        prod.setActiveProfiles("prod", "p01-local");
        assertThatThrownBy(() -> new IssuerKeys(prod, "exists.json", "a", "issuer", "identity")).isInstanceOf(IllegalStateException.class);
        prod.setActiveProfiles("staging", "p01-local");
        assertThatThrownBy(() -> new IssuerKeys(prod, "", "", "issuer", "identity")).isInstanceOf(IllegalStateException.class);
        prod.setActiveProfiles("staging", "test");
        assertThatThrownBy(() -> new IssuerKeys(prod, "", "", "issuer", "identity")).isInstanceOf(IllegalStateException.class);
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
    @Test void issuedTokensRespectFrozenSizeAndKeepWorkloadPrivilegesSeparate() throws Exception {
        var env=new MockEnvironment(); env.setActiveProfiles("test");
        var issuer=new IssuerKeys(env,"","","issuer","identity,catalog,community,trip,ingestion,intelligence");
        for(var roles:List.of(List.of("USER"),List.of("USER","BUSINESS"),List.of("USER","ADMIN"))) {
            String token=issuer.issue(UUID.randomUUID(),UUID.randomUUID(),roles);
            assertThat(token.length()).isLessThanOrEqualTo(1024);
            var claims=SignedJWT.parse(token).getJWTClaimsSet();
            String scopes=claims.getStringClaim("scope");
            assertThat(scopes).contains("identity:read","identity:write");
            assertThat(scopes).doesNotContain("identity:status:read","catalog:places:read","catalog:candidates:read",
                    "community:ratings:read","ingestion:policy:read","ingestion:links:read","identity:deletion:read");
            assertThat(scopes.contains("identity:admin")).isEqualTo(roles.contains("ADMIN"));
            assertThat(claims.getClaim("client_id")).isNull();
        }
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
