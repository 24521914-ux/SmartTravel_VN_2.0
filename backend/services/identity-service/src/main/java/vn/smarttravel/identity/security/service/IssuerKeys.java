package vn.smarttravel.identity.security.service;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Arrays;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/** Only public keys leave this component. Rotation is a deployment/config operation, not a public API. */
@Component
public class IssuerKeys {
    private final RSAKey active;
    private final JWKSet publicKeys;
    private final String issuer;
    private final List<String> audiences;
    public static final long ACCESS_TTL_SECONDS = 600;

    IssuerKeys(Environment environment, @Value("${identity.keys.file:}") String file,
               @Value("${identity.keys.active-kid:}") String kid,
               @Value("${security.jwt.issuer}") String issuer,
               @Value("${identity.jwt.audiences:identity,catalog,community,trip,ingestion,intelligence}") String audiences) {
        this.issuer = issuer;
        this.audiences = Arrays.stream(audiences.split(",")).map(String::trim).toList();
        boolean local = local(environment);
        try {
            if (file.isBlank()) {
                if (!local) throw new IllegalStateException("Persistent signing keys are required");
                active = new RSAKeyGenerator(2048).keyID(UUID.randomUUID().toString())
                        .keyUse(com.nimbusds.jose.jwk.KeyUse.SIGNATURE).algorithm(JWSAlgorithm.RS256).generate();
                publicKeys = new JWKSet(active.toPublicJWK());
            } else {
                var set = JWKSet.parse(Files.readString(Path.of(file)));
                if (!(set.getKeyByKeyId(kid) instanceof RSAKey key) || !key.isPrivate()
                        || key.size() < 2048) throw new IllegalStateException("Invalid active RSA key");
                active = key;
                if (set.getKeys().stream().map(k -> k.getKeyID()).distinct().count() != set.getKeys().size())
                    throw new IllegalStateException("Duplicate key IDs");
                publicKeys = new JWKSet(set.getKeys().stream().<com.nimbusds.jose.jwk.JWK>map(k -> {
                    if (!(k instanceof RSAKey rsa) || rsa.size() < 2048 || k.getKeyID() == null)
                        throw new IllegalStateException("Invalid verification key");
                    return new RSAKey.Builder(rsa.toPublicJWK()).keyUse(com.nimbusds.jose.jwk.KeyUse.SIGNATURE)
                            .algorithm(JWSAlgorithm.RS256).build();
                }).toList());
            }
        } catch (Exception e) {
            // Deliberately exclude parser exceptions: malformed files may contain private material.
            throw new IllegalStateException("Cannot load Identity signing keys");
        }
    }

    public static boolean local(Environment env) {
        boolean local = Arrays.stream(env.getActiveProfiles()).anyMatch(p -> p.equals("p01-local") || p.equals("test"));
        boolean production = Arrays.stream(env.getActiveProfiles()).anyMatch(p -> p.equals("prod") || p.equals("production"));
        if (local && production) throw new IllegalStateException("Local and production profiles cannot be combined");
        return local && !production;
    }

    public Map<String, Object> jwks() { return publicKeys.toJSONObject(); }
    public RSAKey verificationKey() { return active.toPublicJWK(); }

    public String issue(UUID user, UUID session, List<String> roles) {
        var now = Instant.now();
        var claims = new JWTClaimsSet.Builder().issuer(issuer).subject(user.toString()).audience(audiences)
                .issueTime(Date.from(now)).expirationTime(Date.from(now.plusSeconds(ACCESS_TTL_SECONDS)))
                .jwtID(UUID.randomUUID().toString()).claim("sid", session.toString()).claim("roles", roles)
                .claim("scope", roles.contains("ADMIN") ? "identity:read identity:write identity:admin" : "identity:read identity:write")
                .build();
        var jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(active.getKeyID()).build(), claims);
        try { jwt.sign(new RSASSASigner(active)); return jwt.serialize(); }
        catch (Exception e) { throw new IllegalStateException("Cannot issue access token"); }
    }
}
