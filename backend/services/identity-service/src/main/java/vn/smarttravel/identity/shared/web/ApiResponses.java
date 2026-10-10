package vn.smarttravel.identity.shared.web;

import java.util.Map;
import java.util.UUID;

public final class ApiResponses {
    private ApiResponses() {}
    public static Map<String, Object> accepted() {
        return Map.of("request_id", UUID.randomUUID().toString(), "status", "ACCEPTED", "version", 1);
    }
}
