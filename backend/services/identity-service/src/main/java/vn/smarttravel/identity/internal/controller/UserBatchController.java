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
}
