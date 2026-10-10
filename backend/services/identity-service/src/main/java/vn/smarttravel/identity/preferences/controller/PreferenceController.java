package vn.smarttravel.identity.preferences.controller;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import vn.smarttravel.identity.preferences.service.PreferenceService;
import vn.smarttravel.identity.shared.web.RequestHeaders;

@RestController
public class PreferenceController {
    private final PreferenceService service;
    public PreferenceController(PreferenceService service) { this.service=service; }
    @GetMapping("/api/v1/me/preferences")
    ResponseEntity<?> get(@AuthenticationPrincipal Jwt jwt) { return response(service.get(jwt)); }
    @PutMapping("/api/v1/me/preferences")
    ResponseEntity<?> update(@AuthenticationPrincipal Jwt jwt, @RequestBody JsonNode body,
                            @RequestHeader(value="If-Match",required=false) String etag,
                            @RequestHeader(value="Idempotency-Key",required=false) String key) {
        return response(service.update(jwt,body,RequestHeaders.version(etag),RequestHeaders.idempotency(key)));
    }
    @GetMapping("/api/v1/preference-options")
    Object options(@RequestParam(required=false) String cursor, @RequestParam(defaultValue="20") int limit) {
        return service.options(cursor,limit);
    }
    private ResponseEntity<?> response(java.util.Map<String,Object> body) {
        return ResponseEntity.ok().eTag("\""+body.get("version")+"\"").body(body);
    }
}
