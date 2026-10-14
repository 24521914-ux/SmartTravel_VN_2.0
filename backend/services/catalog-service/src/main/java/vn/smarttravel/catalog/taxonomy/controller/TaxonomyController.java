package vn.smarttravel.catalog.taxonomy.controller;
import java.util.*;
import static vn.smarttravel.catalog.shared.web.Representations.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import vn.smarttravel.catalog.taxonomy.service.TaxonomyService;
@RestController
@RequestMapping("/api/v1/admin/{kind:categories|tags|amenities|destinations|geographic-units}")
public class TaxonomyController {
    private final TaxonomyService service;public TaxonomyController(TaxonomyService service){this.service=service;}
    private UUID actor(Jwt jwt){var roles=jwt.getClaimAsStringList("roles");if(roles==null||!roles.contains("ADMIN"))throw new ResponseStatusException(HttpStatus.FORBIDDEN);return UUID.fromString(jwt.getSubject());}
    @GetMapping Object list(@AuthenticationPrincipal Jwt jwt,@PathVariable String kind){actor(jwt);return page(((List<Map<String,Object>>)service.list(kind)).stream().map(row->taxonomy(kind,row)).toList());}
    @GetMapping("/{id}") Object get(@AuthenticationPrincipal Jwt jwt,@PathVariable String kind,@PathVariable UUID id){actor(jwt);return taxonomy(kind,(Map<String,Object>)service.get(kind,id));}
    @PostMapping @ResponseStatus(HttpStatus.CREATED) Object create(@AuthenticationPrincipal Jwt jwt,@PathVariable String kind,@RequestBody Map<String,Object> body){return taxonomy(kind,(Map<String,Object>)service.create(kind,body,actor(jwt)));}
    @PatchMapping("/{id}") Object update(@AuthenticationPrincipal Jwt jwt,@PathVariable String kind,@PathVariable UUID id,@RequestHeader(value="If-Match",required=false) String version,@RequestBody Map<String,Object> body){return taxonomy(kind,(Map<String,Object>)service.update(kind,id,vn.smarttravel.catalog.shared.web.VersionHeaders.parse(version),body,actor(jwt)));}
    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) void delete(@AuthenticationPrincipal Jwt jwt,@PathVariable String kind,@PathVariable UUID id,@RequestHeader(value="If-Match",required=false) String version){service.delete(kind,id,vn.smarttravel.catalog.shared.web.VersionHeaders.parse(version),actor(jwt));}
}
