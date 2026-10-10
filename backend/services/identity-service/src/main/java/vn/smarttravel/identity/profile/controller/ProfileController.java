package vn.smarttravel.identity.profile.controller;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import vn.smarttravel.identity.profile.dto.UpdateProfileRequest;
import vn.smarttravel.identity.profile.service.ProfileService;
import vn.smarttravel.identity.shared.web.RequestHeaders;

@RestController
public class ProfileController {
    private final ProfileService service;
    public ProfileController(ProfileService service) { this.service = service; }

    @GetMapping("/api/v1/me")
    ResponseEntity<?> me(@AuthenticationPrincipal Jwt jwt) {
        var profile = service.profile(jwt);
        return ResponseEntity.ok().eTag("\""+profile.get("version")+"\"").body(profile);
    }

    @PatchMapping("/api/v1/me")
    ResponseEntity<?> profile(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody UpdateProfileRequest body,
                             @RequestHeader(value="If-Match",required=false) String etag) {
        var profile = service.updateProfile(jwt, body.displayName(), RequestHeaders.version(etag));
        return ResponseEntity.ok().eTag("\""+profile.get("version")+"\"").body(profile);
    }
}
