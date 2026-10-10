package vn.smarttravel.identity.auth.controller;

import java.util.Map;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import vn.smarttravel.identity.auth.service.SessionService;

@RestController
public class SessionController {
    private final SessionService service;
    public SessionController(SessionService service) { this.service = service; }

    @GetMapping("/api/v1/me/sessions")
    Map<String, Object> sessions(@AuthenticationPrincipal Jwt jwt,
                                @RequestParam(required=false) String cursor, @RequestParam(defaultValue="20") int limit) {
        return service.sessions(jwt, cursor, limit);
    }

    @DeleteMapping("/api/v1/me/sessions/{session_id}")
    ResponseEntity<?> deleteSession(@AuthenticationPrincipal Jwt jwt, @PathVariable("session_id") UUID session) {
        service.deleteSession(jwt, session); return ResponseEntity.noContent().build();
    }
}
