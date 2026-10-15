package vn.smarttravel.catalog.offerings.controller;
import java.util.*;
import static vn.smarttravel.catalog.shared.web.Representations.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import vn.smarttravel.catalog.offerings.service.OfferingService;
@RestController
public class OfferingController {
    private final OfferingService service;public OfferingController(OfferingService service){this.service=service;}
    private UUID admin(Jwt jwt){var roles=jwt.getClaimAsStringList("roles");if(roles==null||!roles.contains("ADMIN"))throw new ResponseStatusException(HttpStatus.FORBIDDEN);return UUID.fromString(jwt.getSubject());}
    @GetMapping("/api/v1/offerings") Object list(){return page(((List<Map<String,Object>>)service.list(null,true)).stream().map(vn.smarttravel.catalog.shared.web.Representations::offering).toList());}
    @GetMapping("/api/v1/places/{id}/offerings") Object places(@PathVariable UUID id){return page(((List<Map<String,Object>>)service.list(id,true)).stream().map(vn.smarttravel.catalog.shared.web.Representations::offering).toList());}
    @GetMapping("/api/v1/admin/offerings") Object adminList(@AuthenticationPrincipal Jwt jwt){admin(jwt);return page(((List<Map<String,Object>>)service.list(null,false)).stream().map(vn.smarttravel.catalog.shared.web.Representations::offering).toList());}
    @GetMapping("/api/v1/admin/offerings/{id}") Object get(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id){admin(jwt);return offering((Map<String,Object>)service.get(id,false));}
    @PostMapping("/api/v1/admin/offerings") @ResponseStatus(HttpStatus.CREATED) Object create(@AuthenticationPrincipal Jwt jwt,@RequestBody Map<String,Object> body){return offering((Map<String,Object>)service.create(body,admin(jwt)));}
    @PatchMapping("/api/v1/admin/offerings/{id}") Object update(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestHeader(value="If-Match",required=false) String version,@RequestBody Map<String,Object> body){admin(jwt);return offering((Map<String,Object>)service.update(id,vn.smarttravel.catalog.shared.web.VersionHeaders.parse(version),body));}
    @DeleteMapping("/api/v1/admin/offerings/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) void delete(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestHeader(value="If-Match",required=false) String version){admin(jwt);service.archive(id,vn.smarttravel.catalog.shared.web.VersionHeaders.parse(version));}
}
