package vn.smarttravel.community.contributions.controller;
import java.util.*;
import static vn.smarttravel.community.shared.web.Representations.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import vn.smarttravel.community.contributions.service.ContributionService;
@RestController
public class ContributionController {
    private final ContributionService service;private final vn.smarttravel.community.infrastructure.persistence.service.IdempotencyService idempotency;
    public ContributionController(ContributionService service,vn.smarttravel.community.infrastructure.persistence.service.IdempotencyService idempotency){this.service=service;this.idempotency=idempotency;}
    private String user(Jwt jwt){return UUID.fromString(jwt.getSubject()).toString();}
    private String admin(Jwt jwt){if(jwt.getClaimAsStringList("roles")==null||!jwt.getClaimAsStringList("roles").contains("ADMIN"))throw new ResponseStatusException(HttpStatus.FORBIDDEN);return user(jwt);}
    @PostMapping("/api/v1/contributions") @ResponseStatus(HttpStatus.CREATED) Object create(@AuthenticationPrincipal Jwt jwt,@RequestHeader(value="Idempotency-Key",required=false) String key,@RequestBody Map<String,Object> body){return idempotency.execute(user(jwt),"create-contribution",key,body,()->contribution(service.create(user(jwt),body)));}
    @GetMapping("/api/v1/me/contributions") Object list(@AuthenticationPrincipal Jwt jwt){return page(service.list(user(jwt)).stream().map(vn.smarttravel.community.shared.web.Representations::contribution).toList());}
    @PatchMapping("/api/v1/contributions/{id}") Object edit(@AuthenticationPrincipal Jwt jwt,@PathVariable String id,@RequestHeader(value="If-Match",required=false) String version,@RequestBody Map<String,Object> body){return contribution(service.edit(id,user(jwt),vn.smarttravel.community.shared.web.VersionHeaders.parse(version),body));}
    @PostMapping("/api/v1/contributions/{id}/withdraw") Object withdraw(@AuthenticationPrincipal Jwt jwt,@PathVariable String id,@RequestHeader(value="If-Match",required=false) String version){return contribution(service.withdraw(id,user(jwt),vn.smarttravel.community.shared.web.VersionHeaders.parse(version)));}
    @GetMapping("/api/v1/admin/contributions") Object pending(@AuthenticationPrincipal Jwt jwt){admin(jwt);return page(service.pending().stream().map(vn.smarttravel.community.shared.web.Representations::contribution).toList());}
    @PostMapping("/api/v1/admin/contributions/{id}/moderate") @ResponseStatus(HttpStatus.ACCEPTED) Object moderate(@AuthenticationPrincipal Jwt jwt,@PathVariable String id,@RequestHeader(value="If-Match",required=false) String version,@RequestBody Map<String,String> body){var row=service.moderate(id,admin(jwt),vn.smarttravel.community.shared.web.VersionHeaders.parse(version),body.get("action"),body.get("reason"));return accepted(id,((Number)row.get("version")).longValue());}
}
