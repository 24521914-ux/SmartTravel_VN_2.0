package vn.smarttravel.identity.security.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import vn.smarttravel.identity.security.service.IssuerKeys;

@RestController
public class JwksController {
    private final IssuerKeys keys;
    public JwksController(IssuerKeys keys) { this.keys = keys; }

    @GetMapping("/.well-known/jwks.json")
    ResponseEntity<?> jwks() { return ResponseEntity.ok().header("Cache-Control", "public, max-age=60").body(keys.jwks()); }
}
