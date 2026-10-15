package vn.smarttravel.identity.internal.controller;

import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import vn.smarttravel.identity.internal.dto.UserBatchRequest;
import vn.smarttravel.identity.internal.service.UserBatchService;

@RestController
public class UserBatchController {
    private final UserBatchService service;
    public UserBatchController(UserBatchService service) { this.service=service; }
    @PostMapping("/internal/v1/users/status/batch")
    Object status(@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody UserBatchRequest body) { return service.batch(jwt,body.ids(),false); }
    @PostMapping("/internal/v1/users/preferences/batch")
    Object preferences(@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody UserBatchRequest body) { return service.batch(jwt,body.ids(),true); }
    @GetMapping("/internal/v1/users/preferences/snapshot")
    Object snapshot(@AuthenticationPrincipal Jwt jwt,@RequestParam(required=false) String cursor,
            @RequestParam(defaultValue="100") int limit) {
        java.util.UUID after=null; String watermark=null;
        if(cursor!=null) {
            String[] parts=cursor.split(":",-1);
            try {
                if(parts.length!=2 || !parts[1].matches("[a-f0-9]{32}")) throw new IllegalArgumentException();
                after=java.util.UUID.fromString(parts[0]); watermark=parts[1];
            } catch(IllegalArgumentException error) { throw new vn.smarttravel.identity.shared.exception.IdentityException(400,"INVALID_CURSOR"); }
        }
        return service.preferencesSnapshot(jwt,after,limit,watermark);
    }
}
