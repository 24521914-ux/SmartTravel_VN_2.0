package vn.smarttravel.identity.security.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import vn.smarttravel.identity.shared.exception.IdentityException;

/**
 * Service-to-service clients and the destination scopes each may request.
 * Grants are code (reviewed with the contract); secrets come from deployment config only.
 */
@Component
public class WorkloadClients {
    static final Map<String, Map<String, Set<String>>> GRANTS = Map.of(
            "catalog", Map.of("ingestion", Set.of("ingestion:policy:read")),
            "community", Map.of("catalog", Set.of("catalog:places:read")),
            "trip", Map.of("catalog", Set.of("catalog:places:read")),
            "ingestion", Map.of("catalog", Set.of("catalog:candidates:read")),
            "intelligence", Map.of("catalog", Set.of("catalog:places:read"),
                    "ingestion", Set.of("ingestion:policy:read"),
                    "community", Set.of("community:ratings:read"),
                    "identity", Set.of("identity:preferences:read"),
                    "trip", Set.of("trip:internal")));
    private final Map<String, byte[]> secrets;

    public WorkloadClients(Environment environment) {
        // Short secrets disable the client rather than weakening authentication.
        secrets = GRANTS.keySet().stream()
                .map(client -> Map.entry(client, environment.getProperty("identity.workload.secrets." + client, "")))
                .filter(entry -> entry.getValue().length() >= 32)
                .collect(java.util.stream.Collectors.toUnmodifiableMap(Map.Entry::getKey,
                        entry -> entry.getValue().getBytes(StandardCharsets.UTF_8)));
    }

    /** Returns the scopes to issue; requested scope is optional and must be a subset of the grant. */
    public List<String> authorize(String client, String secret, String audience, String requestedScope) {
        byte[] expected = client == null ? null : secrets.get(client);
        byte[] presented = (secret == null ? "" : secret).getBytes(StandardCharsets.UTF_8);
        // Compare against a dummy for unknown clients so timing does not reveal which IDs exist.
        boolean match = MessageDigest.isEqual(expected == null ? new byte[32] : expected, presented);
        if (expected == null || !match) throw new IdentityException(401, "INVALID_CLIENT");
        Set<String> granted = GRANTS.get(client).get(audience == null ? "" : audience);
        if (granted == null) throw new IdentityException(403, "INVALID_AUDIENCE");
        if (requestedScope == null || requestedScope.isBlank()) return granted.stream().sorted().toList();
        List<String> requested = Arrays.stream(requestedScope.trim().split(" +")).distinct().sorted().toList();
        if (!granted.containsAll(requested)) throw new IdentityException(403, "INVALID_SCOPE");
        return requested;
    }
}
