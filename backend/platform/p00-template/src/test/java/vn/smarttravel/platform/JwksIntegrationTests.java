package vn.smarttravel.platform;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.JwtException;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JwksIntegrationTests {
    private String sign(RSAKey key, String issuer, String audience, long expiresIn) throws JOSEException {
        var claims = new JWTClaimsSet.Builder().issuer(issuer).subject("fixture-user")
                .audience(audience).issueTime(Date.from(Instant.now().minusSeconds(600)))
                .expirationTime(Date.from(Instant.now().plusSeconds(expiresIn))).build();
        var jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(key.getKeyID()).build(), claims);
        jwt.sign(new RSASSASigner(key));
        return jwt.serialize();
    }

    @Test
    void validatesRealSignaturesIssuerAudienceExpiryAndKeyRotationAgainstLocalHttpJwks() throws Exception {
        var first = new RSAKeyGenerator(2048).keyID("test-1").generate();
        var rotated = new RSAKeyGenerator(2048).keyID("test-2").generate();
        var forged = new RSAKeyGenerator(2048).keyID("test-1").generate();
        var keys = new java.util.concurrent.atomic.AtomicReference<>(new JWKSet(first.toPublicJWK()));
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/jwks", exchange -> {
            byte[] body = keys.get().toString().getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            try (var out = exchange.getResponseBody()) { out.write(body); }
        });
        server.start();
        try {
            var decoder = new SecurityConfiguration().jwtDecoder(
                    "http://127.0.0.1:" + server.getAddress().getPort() + "/jwks", "local-test", "trip");
            assertThat(decoder.decode(sign(first, "local-test", "trip", 120)).getSubject()).isEqualTo("fixture-user");
            assertThatThrownBy(() -> decoder.decode(sign(forged, "local-test", "trip", 120))).isInstanceOf(JwtException.class);
            assertThatThrownBy(() -> decoder.decode(sign(first, "wrong", "trip", 120))).isInstanceOf(JwtException.class);
            assertThatThrownBy(() -> decoder.decode(sign(first, "local-test", "catalog", 120))).isInstanceOf(JwtException.class);
            assertThatThrownBy(() -> decoder.decode(sign(first, "local-test", "trip", -300))).isInstanceOf(JwtException.class);
            var withoutExpiry = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(first.getKeyID()).build(),
                    new JWTClaimsSet.Builder().issuer("local-test").subject("fixture-user").audience("trip")
                            .issueTime(new Date()).build());
            withoutExpiry.sign(new RSASSASigner(first));
            assertThatThrownBy(() -> decoder.decode(withoutExpiry.serialize())).isInstanceOf(JwtException.class);
            var withoutAudience = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(first.getKeyID()).build(),
                    new JWTClaimsSet.Builder().issuer("local-test").subject("fixture-user").issueTime(new Date())
                            .expirationTime(Date.from(Instant.now().plusSeconds(120))).build());
            withoutAudience.sign(new RSASSASigner(first));
            assertThatThrownBy(() -> decoder.decode(withoutAudience.serialize())).isInstanceOf(JwtException.class);
            keys.set(new JWKSet(java.util.List.of(first.toPublicJWK(), rotated.toPublicJWK())));
            assertThat(decoder.decode(sign(rotated, "local-test", "trip", 120)).getSubject()).isEqualTo("fixture-user");
        } finally { server.stop(0); }
    }
}
