package vn.smarttravel.identity.auth.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import vn.smarttravel.identity.auth.dto.*;
import vn.smarttravel.identity.auth.service.AuthRateLimit;
import vn.smarttravel.identity.auth.service.AuthService;
import vn.smarttravel.identity.auth.service.SocialAuthService;
import vn.smarttravel.identity.security.support.Tokens;
import vn.smarttravel.identity.shared.web.ApiResponses;
import vn.smarttravel.identity.shared.web.RequestHeaders;

@RestController
public class AuthController {
    private final AuthService service;
    private final SocialAuthService socialAuth;
    private final AuthRateLimit limits;

    public AuthController(AuthService service, SocialAuthService socialAuth, AuthRateLimit limits) {
        this.service = service; this.socialAuth = socialAuth; this.limits = limits;
    }

    // Never trust X-Forwarded-For from public clients; deployment must configure a trusted proxy explicitly.
    private void limit(String action, String account, HttpServletRequest request) { limits.check(action, account, request.getRemoteAddr()); }

    @PostMapping("/api/v1/auth/register")
    ResponseEntity<?> register(@Valid @RequestBody RegisterRequest body, @RequestHeader(value="Idempotency-Key",required=false) String key, HttpServletRequest request) {
        RequestHeaders.idempotency(key); limit("register", AuthService.canonical(body.email()), request);
        return ResponseEntity.accepted().body(service.register(body.email(), body.password(), body.displayName(), key));
    }

    @PostMapping("/api/v1/auth/login")
    Map<String, Object> login(@Valid @RequestBody LoginRequest body, HttpServletRequest request) {
        limit("login", AuthService.canonical(body.email()), request); return service.login(body.email(), body.password());
    }

    @PostMapping("/api/v1/auth/social")
    Map<String, Object> socialLogin(@Valid @RequestBody SocialLoginRequest body, HttpServletRequest request) {
        limit("social-login", body.provider().trim().toLowerCase(java.util.Locale.ROOT) + ":" + Tokens.hash(body.token()), request);
        return socialAuth.login(body.provider(), body.token());
    }

    @PostMapping("/api/v1/auth/social/google")
    Map<String, Object> googleLogin(@Valid @RequestBody SocialTokenRequest body, HttpServletRequest request) {
        limit("social-login", "google:" + Tokens.hash(body.token()), request);
        return socialAuth.login("google", body.token());
    }

    @PostMapping("/api/v1/auth/social/facebook")
    Map<String, Object> facebookLogin(@Valid @RequestBody SocialTokenRequest body, HttpServletRequest request) {
        limit("social-login", "facebook:" + Tokens.hash(body.token()), request);
        return socialAuth.login("facebook", body.token());
    }

    @PostMapping("/api/v1/auth/refresh")
    Map<String, Object> refresh(@Valid @RequestBody RefreshTokenRequest body, HttpServletRequest request) {
        limit("refresh", Tokens.hash(body.refreshToken()), request); return service.refresh(body.refreshToken());
    }

    @PostMapping("/api/v1/auth/logout")
    ResponseEntity<?> logout(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody RefreshTokenRequest body) {
        service.logout(jwt, body.refreshToken()); return ResponseEntity.noContent().build();
    }

    @PostMapping("/api/v1/auth/verify-email")
    ResponseEntity<?> verify(@Valid @RequestBody AccountTokenRequest body, HttpServletRequest request) {
        limit("verify", Tokens.hash(body.token()), request);
        return ResponseEntity.accepted().body(service.consumeAccountToken(body.token(), "VERIFY_EMAIL", null));
    }

    @PostMapping("/api/v1/auth/resend-verification")
    ResponseEntity<?> resend(@Valid @RequestBody ForgotPasswordRequest body, HttpServletRequest request) {
        limit("resend-verification", AuthService.canonical(body.email()), request);
        service.resendVerification(body.email());
        // Identical response for unknown, active, pending and cooldown accounts.
        return ResponseEntity.accepted().body(ApiResponses.accepted());
    }

    @PostMapping("/api/v1/auth/forgot-password")
    ResponseEntity<?> forgot(@Valid @RequestBody ForgotPasswordRequest body, HttpServletRequest request) {
        limit("forgot", AuthService.canonical(body.email()), request); service.forgot(body.email());
        return ResponseEntity.accepted().body(ApiResponses.accepted());
    }

    @PostMapping("/api/v1/auth/reset-password")
    ResponseEntity<?> reset(@Valid @RequestBody ResetPasswordRequest body, HttpServletRequest request) {
        limit("reset", Tokens.hash(body.token()), request);
        return ResponseEntity.accepted().body(service.consumeAccountToken(body.token(), "RESET_PASSWORD", body.password()));
    }

    @PutMapping("/api/v1/me/password")
    ResponseEntity<?> password(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ChangePasswordRequest body) {
        service.changePassword(jwt, body.currentPassword(), body.newPassword()); return ResponseEntity.noContent().build();
    }
}
