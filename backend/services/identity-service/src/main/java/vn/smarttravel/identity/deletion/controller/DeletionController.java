package vn.smarttravel.identity.deletion.controller;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.*;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import vn.smarttravel.identity.deletion.service.DeletionService;
import vn.smarttravel.identity.shared.web.RequestHeaders;

@RestController
public class DeletionController {
    private final DeletionService service;
    public DeletionController(DeletionService service) { this.service=service; }
    @PostMapping("/api/v1/me/deletion-requests")
    ResponseEntity<?> request(@AuthenticationPrincipal Jwt jwt, @RequestBody JsonNode body,
                             @RequestHeader(value="Idempotency-Key",required=false) String key) {
        var result=service.request(jwt,body,RequestHeaders.idempotency(key));
        return ResponseEntity.accepted().eTag("\""+result.get("version")+"\"").body(result);
    }
    @GetMapping("/internal/v1/deletion-requests/{request_id}")
    Map<String,Object> status(@AuthenticationPrincipal Jwt jwt, @PathVariable("request_id") UUID request) {
        return service.status(jwt,request);
    }
}
