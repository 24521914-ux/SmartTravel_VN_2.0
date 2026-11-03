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
        boolean local = Arrays.stream(env.getActiveProfiles()).anyMatch(p -> p.equals("p01-local") || p.equals("p02-local") || p.equals("test"));
        boolean production = Arrays.stream(env.getActiveProfiles()).anyMatch(p -> p.equals("prod") || p.equals("production") || p.equals("staging"));
        if (local && production) throw new IllegalStateException("Local and production profiles cannot be combined");
        return local && !production;
    }

    public Map<String, Object> jwks() { return publicKeys.toJSONObject(); }
    public RSAKey verificationKey() { return active.toPublicJWK(); }

    public String issue(UUID user, UUID session, List<String> roles) {
        return sign(user, session, roles, audiences, roles.contains("ADMIN") ? "identity:read identity:write identity:admin" : "identity:read identity:write", Instant.now().plusSeconds(ACCESS_TTL_SECONDS));
    }

    /** A short, destination-bound token preserves the original principal and session. */
    public String exchange(UUID user, UUID session, List<String> roles, String destination, Instant expires) {
        if (!java.util.Set.of("identity", "catalog", "community", "trip", "ingestion", "intelligence").contains(destination))
            throw new IllegalArgumentException("Unknown destination");
        String scope = destination + ":read " + destination + ":write";
        if (roles.contains("ADMIN")) scope += " " + destination + ":admin";
        return sign(user, session, roles, destination.equals("identity") ? List.of("identity") : List.of("identity", destination), scope,
                expires.isBefore(Instant.now().plusSeconds(60)) ? expires : Instant.now().plusSeconds(60));
    }

    /** Client-credentials token: no session, one destination, only scopes already granted to the client. */
    public String workload(String client, String audience, List<String> scopes) {
        if (client == null || client.isBlank() || scopes.isEmpty() || scopes.stream().anyMatch(s -> !s.startsWith(audience + ":")))
            throw new IllegalArgumentException("Scope must belong to destination");
        var now = Instant.now();
        var claims = new JWTClaimsSet.Builder().issuer(issuer).subject(workloadSubject(client).toString()).audience(List.of(audience))
                .issueTime(Date.from(now)).expirationTime(Date.from(now.plusSeconds(ACCESS_TTL_SECONDS)))
                .jwtID(UUID.randomUUID().toString()).claim("roles", List.of("SERVICE")).claim("client_id", client)
                .claim("scope", String.join(" ", scopes))
                .build();
        return sign(claims);
    }

    /** UUIDv5(NAMESPACE_URL, "smarttravel-workload:" + client), the subject the P02 provisioning tool used. */
    static UUID workloadSubject(String client) {
        try {
            var sha1 = java.security.MessageDigest.getInstance("SHA-1");
            sha1.update(java.util.HexFormat.of().parseHex("6ba7b8119dad11d180b400c04fd430c8"));
            byte[] hash = sha1.digest(("smarttravel-workload:" + client).getBytes(java.nio.charset.StandardCharsets.UTF_8));
            hash[6] = (byte) ((hash[6] & 0x0f) | 0x50);
            hash[8] = (byte) ((hash[8] & 0x3f) | 0x80);
            var buffer = java.nio.ByteBuffer.wrap(hash, 0, 16);
            return new UUID(buffer.getLong(), buffer.getLong());
        } catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException("Hash unavailable"); }
    }

    private String sign(UUID user, UUID session, List<String> roles, List<String> targetAudiences, String scope, Instant expires) {
        var now = Instant.now();
        var claims = new JWTClaimsSet.Builder().issuer(issuer).subject(user.toString()).audience(targetAudiences)
                .issueTime(Date.from(now)).expirationTime(Date.from(expires))
                .jwtID(UUID.randomUUID().toString()).claim("sid", session.toString()).claim("roles", roles)
                .claim("scope", scope)
                .build();
        return sign(claims);
    }

    private String sign(JWTClaimsSet claims) {
        var jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(active.getKeyID()).build(), claims);
        try { jwt.sign(new RSASSASigner(active)); String serialized = jwt.serialize();
            if (serialized.length() > 1024) throw new IllegalStateException("Access token exceeds frozen contract bound");
            return serialized; }
        catch (Exception e) { throw new IllegalStateException("Cannot issue access token"); }
    }

}
