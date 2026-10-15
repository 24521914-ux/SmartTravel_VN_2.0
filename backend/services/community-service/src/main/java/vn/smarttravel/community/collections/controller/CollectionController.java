package vn.smarttravel.community.collections.controller;
import java.util.*;
import org.springframework.http.HttpStatus;
import static vn.smarttravel.community.shared.web.Representations.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import vn.smarttravel.community.collections.service.CollectionService;
@RestController
public class CollectionController {
    private final CollectionService service;public CollectionController(CollectionService service){this.service=service;}
    private String user(Jwt jwt){return jwt==null?null:UUID.fromString(jwt.getSubject()).toString();}
    @GetMapping("/api/v1/me/collections") Object list(@AuthenticationPrincipal Jwt jwt){return page(service.list(user(jwt)).stream().map(vn.smarttravel.community.shared.web.Representations::collection).toList());}
    @PostMapping("/api/v1/me/collections") @ResponseStatus(HttpStatus.CREATED) Object create(@AuthenticationPrincipal Jwt jwt,@RequestBody Map<String,Object> body){return collection(service.create(user(jwt),body));}
    @GetMapping("/api/v1/me/collections/{id}") Object mine(@AuthenticationPrincipal Jwt jwt,@PathVariable String id){return collection(service.get(id,user(jwt),true));}
    @GetMapping("/api/v1/collections/{id}") Object get(@AuthenticationPrincipal Jwt jwt,@PathVariable String id){return collection(service.get(id,user(jwt),false));}
    @PatchMapping("/api/v1/me/collections/{id}") Object update(@AuthenticationPrincipal Jwt jwt,@PathVariable String id,@RequestHeader(value="If-Match",required=false) String version,@RequestBody Map<String,Object> body){return collection(service.update(id,user(jwt),vn.smarttravel.community.shared.web.VersionHeaders.parse(version),body));}
    @DeleteMapping("/api/v1/me/collections/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) void delete(@AuthenticationPrincipal Jwt jwt,@PathVariable String id,@RequestHeader(value="If-Match",required=false) String version){service.delete(id,user(jwt),vn.smarttravel.community.shared.web.VersionHeaders.parse(version));}
    @GetMapping("/api/v1/collections/{id}/items") Object items(@AuthenticationPrincipal Jwt jwt,@PathVariable String id){return page(service.items(id,user(jwt)).stream().map(vn.smarttravel.community.shared.web.Representations::item).toList());}
    @PostMapping("/api/v1/collections/{id}/items") @ResponseStatus(HttpStatus.CREATED) Object add(@AuthenticationPrincipal Jwt jwt,@PathVariable String id,@RequestHeader(value="If-Match",required=false) String version,@RequestBody Map<String,Object> body){return vn.smarttravel.community.shared.web.Representations.item(service.add(id,user(jwt),vn.smarttravel.community.shared.web.VersionHeaders.parse(version),body));}
    @GetMapping("/api/v1/collections/{id}/items/{item}") Object item(@AuthenticationPrincipal Jwt jwt,@PathVariable String id,@PathVariable String item){return vn.smarttravel.community.shared.web.Representations.item(service.item(id,item,user(jwt)));}
    @PatchMapping("/api/v1/collections/{id}/items/{item}") Object note(@AuthenticationPrincipal Jwt jwt,@PathVariable String id,@PathVariable String item,@RequestHeader(value="If-Match",required=false) String version,@RequestBody Map<String,Object> body){return vn.smarttravel.community.shared.web.Representations.item(service.updateItem(id,item,user(jwt),vn.smarttravel.community.shared.web.VersionHeaders.parse(version),body));}
    @DeleteMapping("/api/v1/collections/{id}/items/{item}") @ResponseStatus(HttpStatus.NO_CONTENT) void remove(@AuthenticationPrincipal Jwt jwt,@PathVariable String id,@PathVariable String item,@RequestHeader(value="If-Match",required=false) String version){service.deleteItem(id,item,user(jwt),vn.smarttravel.community.shared.web.VersionHeaders.parse(version));}
    @PutMapping("/api/v1/collections/{id}/items/order") Object reorder(@AuthenticationPrincipal Jwt jwt,@PathVariable String id,@RequestHeader(value="If-Match",required=false) String version,@RequestBody Map<String,List<String>> body){service.reorder(id,user(jwt),vn.smarttravel.community.shared.web.VersionHeaders.parse(version),body.get("item_ids"));return accepted(id,vn.smarttravel.community.shared.web.VersionHeaders.parse(version)+1);}
}
