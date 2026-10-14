package vn.smarttravel.catalog.places.controller;
import vn.smarttravel.catalog.places.service.CatalogService;

import java.util.*;
import static vn.smarttravel.catalog.shared.web.Representations.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@RestController
public class CatalogController {
    private final CatalogService catalog;
    private final vn.smarttravel.catalog.infrastructure.persistence.service.IdempotencyService idempotency;
    public CatalogController(CatalogService catalog,vn.smarttravel.catalog.infrastructure.persistence.service.IdempotencyService idempotency){this.catalog=catalog;this.idempotency=idempotency;}
    static void role(Jwt jwt,String role){
        var roles=jwt==null?null:jwt.getClaimAsStringList("roles");
        if(roles==null||!roles.contains(role))throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Missing role");
        String status=jwt.getClaimAsString("status");if(status!=null&&!status.equals("ACTIVE"))throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Account inactive");
    }
    @GetMapping("/api/v1/places") public Object search(@RequestParam Map<String,String> query){return catalog.search(query);}
    @GetMapping("/api/v1/places/{id}") public Object place(@PathVariable UUID id){return vn.smarttravel.catalog.shared.web.Representations.place(catalog.place(id,true));}
    @GetMapping({"/api/v1/categories","/api/v1/tags","/api/v1/amenities","/api/v1/destinations","/api/v1/geographic-units"})
    public Object taxonomy(jakarta.servlet.http.HttpServletRequest request){String kind=request.getRequestURI().substring("/api/v1/".length()).replace('-','_');return catalog.publicTaxonomy(kind.replace('_','-'));}
    @PostMapping("/api/v1/admin/places") @ResponseStatus(HttpStatus.CREATED) public Object create(@AuthenticationPrincipal Jwt jwt,@RequestHeader(value="Idempotency-Key",required=false) String key,@RequestBody Map<String,Object> body){role(jwt,"ADMIN");return idempotency.execute(jwt.getSubject(),"create-place",key,body,()->vn.smarttravel.catalog.shared.web.Representations.place((Map<String,Object>)catalog.create(body,UUID.fromString(jwt.getSubject()))));}
    @PatchMapping("/api/v1/admin/places/{id}") public Object update(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestHeader(value="If-Match",required=false) String version,@RequestBody Map<String,Object> body){role(jwt,"ADMIN");if(version==null)throw new ResponseStatusException(HttpStatus.valueOf(428),"If-Match required");return vn.smarttravel.catalog.shared.web.Representations.place((Map<String,Object>)catalog.update(id,vn.smarttravel.catalog.shared.web.VersionHeaders.parse(version),body,UUID.fromString(jwt.getSubject())));}
    @GetMapping("/api/v1/admin/places/{id}") public Object adminPlace(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id){role(jwt,"ADMIN");return vn.smarttravel.catalog.shared.web.Representations.place(catalog.place(id,false));}
    @PutMapping("/api/v1/admin/places/{id}/status") public Object status(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestHeader(value="If-Match",required=false) String version,@RequestBody Map<String,Object> body){return update(jwt,id,version,Map.of("status",body.get("status")));}
    @DeleteMapping("/api/v1/admin/places/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void archive(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestHeader(value="If-Match",required=false) String version){update(jwt,id,version,Map.of("status","ARCHIVED"));}
    @PostMapping({"/internal/v1/places/batch","/internal/v1/places/validate"}) public Object batch(@AuthenticationPrincipal Jwt jwt,@RequestBody Map<String,Object> body,jakarta.servlet.http.HttpServletRequest request){Object input=body.getOrDefault("ids",body.get("place_ids"));if(!(input instanceof List<?> ids)||ids.isEmpty()||ids.size()>100||new HashSet<>(ids).size()!=ids.size())throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"1..100 unique ids required");boolean validation=request.getRequestURI().endsWith("/validate");var items=new ArrayList<Map<String,Object>>();var missing=new ArrayList<UUID>();for(Object value:ids){UUID id=UUID.fromString(value.toString());try{var row=catalog.place(id,false);items.add(validation?Map.of("place_id",id,"public","PUBLISHED".equals(row.get("status")),"version",row.get("version")):vn.smarttravel.catalog.shared.web.Representations.place(row));}catch(ResponseStatusException e){if(e.getStatusCode().value()!=404)throw e;missing.add(id);}}return Map.of("items",items,"missing_ids",missing);}
    @GetMapping("/api/v1/admin/places") Object adminList(@AuthenticationPrincipal Jwt jwt,@RequestParam Map<String,String> query){role(jwt,"ADMIN");return catalog.adminSearch(query);}
    @GetMapping("/internal/v1/places/snapshot") Object snapshot(@RequestParam Map<String,String> query){return catalog.adminSearch(query);}
    @PostMapping("/internal/v1/places/candidates") Object candidates(@RequestBody Map<String,Object> body){return catalog.candidates(body);}
}
