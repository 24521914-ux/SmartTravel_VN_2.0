package vn.smarttravel.identity.notifications.controller;

import java.util.*;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import vn.smarttravel.identity.notifications.service.NotificationService;
import vn.smarttravel.identity.shared.web.RequestHeaders;

@RestController
public class NotificationController {
    private final NotificationService service;
    public NotificationController(NotificationService service) { this.service=service; }
    @GetMapping("/api/v1/me/notifications")
    Map<String,Object> list(@AuthenticationPrincipal Jwt jwt, @RequestParam(required=false) String cursor,
                           @RequestParam(defaultValue="20") int limit) {
        return service.list(jwt,cursor,limit);
    }
    @PatchMapping("/api/v1/me/notifications/{notification_id}/read")
    ResponseEntity<?> read(@AuthenticationPrincipal Jwt jwt, @PathVariable("notification_id") UUID id,
                          @RequestHeader(value="Idempotency-Key",required=false) String key) {
        var result=service.read(jwt,id,RequestHeaders.idempotency(key));
        return ResponseEntity.ok().eTag("\""+result.get("version")+"\"").body(result);
    }
}
