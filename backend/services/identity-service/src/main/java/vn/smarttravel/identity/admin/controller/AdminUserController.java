package vn.smarttravel.identity.admin.controller;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import vn.smarttravel.identity.admin.service.AdminUserService;
import vn.smarttravel.identity.shared.web.RequestHeaders;

@RestController
public class AdminUserController {
    private final AdminUserService service;
    public AdminUserController(AdminUserService service) { this.service=service; }
    @GetMapping("/api/v1/admin/users")
    Object users(@AuthenticationPrincipal Jwt jwt,@RequestParam(required=false) String cursor,@RequestParam(defaultValue="20") int limit) {
        return service.page(jwt,cursor,limit);
    }
    @PatchMapping("/api/v1/admin/users/{user_id}/status")
    ResponseEntity<?> status(@AuthenticationPrincipal Jwt jwt,@PathVariable("user_id") UUID user,@RequestBody JsonNode body,
                            @RequestHeader(value="If-Match",required=false) String etag) {
        return response(service.status(jwt,user,body,RequestHeaders.version(etag)));
    }
    @PutMapping("/api/v1/admin/users/{user_id}/roles")
    ResponseEntity<?> roles(@AuthenticationPrincipal Jwt jwt,@PathVariable("user_id") UUID user,@RequestBody JsonNode body,
                           @RequestHeader(value="If-Match",required=false) String etag) {
        return response(service.roles(jwt,user,body,RequestHeaders.version(etag)));
    }
    private ResponseEntity<?> response(java.util.Map<String,Object> body) {
        return ResponseEntity.ok().eTag("\""+body.get("version")+"\"").body(body);
    }
}
