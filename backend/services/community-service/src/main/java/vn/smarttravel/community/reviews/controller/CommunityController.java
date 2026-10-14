package vn.smarttravel.community.reviews.controller;
import java.util.*;
import org.bson.Document;
import static vn.smarttravel.community.shared.web.Representations.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import vn.smarttravel.community.reviews.service.CommunityService;

@RestController
public class CommunityController {
    private final vn.smarttravel.community.reviews.service.ModerationService moderation;
    private final CommunityService service;private final vn.smarttravel.community.infrastructure.persistence.service.IdempotencyService idempotency;
    public CommunityController(CommunityService service,vn.smarttravel.community.infrastructure.persistence.service.IdempotencyService idempotency,vn.smarttravel.community.reviews.service.ModerationService moderation){this.service=service;this.idempotency=idempotency;this.moderation=moderation;}
    private String user(Jwt jwt){String status=jwt.getClaimAsString("status");if(status!=null&&!status.equals("ACTIVE"))throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Account inactive");return UUID.fromString(jwt.getSubject()).toString();}
    private String admin(Jwt jwt){var roles=jwt.getClaimAsStringList("roles");if(roles==null||!roles.contains("ADMIN"))throw new ResponseStatusException(HttpStatus.FORBIDDEN);return user(jwt);}
    private long version(String header){return vn.smarttravel.community.shared.web.VersionHeaders.parse(header);}
    @GetMapping("/api/v1/places/{id}/reviews") Object reviews(@PathVariable String id){return page(((List<Document>)service.reviews(id)).stream().map(vn.smarttravel.community.shared.web.Representations::review).toList());}
    @PostMapping("/api/v1/places/{id}/reviews") @ResponseStatus(HttpStatus.CREATED) Object create(@AuthenticationPrincipal Jwt jwt,@PathVariable String id,@RequestHeader(value="Idempotency-Key",required=false) String key,@RequestBody Map<String,Object> body){if(!(body.get("rating") instanceof Number))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Rating required");return idempotency.execute(user(jwt),"create-review:"+id,key,body,()->review((Document)service.createWithMedia(user(jwt),id,((Number)body.get("rating")).intValue(),Objects.toString(body.get("content"),""),(List<String>)body.get("media_keys"))));}
    @PatchMapping("/api/v1/reviews/{id}") Object edit(@AuthenticationPrincipal Jwt jwt,@PathVariable String id,@RequestHeader(value="If-Match",required=false) String expected,@RequestBody Map<String,Object> body){return review((Document)service.editWithMedia(user(jwt),id,version(expected),((Number)body.get("rating")).intValue(),Objects.toString(body.get("content"),""),(List<String>)body.get("media_keys")));}
    @DeleteMapping("/api/v1/reviews/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) void delete(@AuthenticationPrincipal Jwt jwt,@PathVariable String id,@RequestHeader(value="If-Match",required=false) String expected){service.editReview(user(jwt),id,version(expected),null,null,true);}
    @PostMapping("/api/v1/admin/reviews/{id}/moderate") @ResponseStatus(HttpStatus.ACCEPTED) Object moderate(@AuthenticationPrincipal Jwt jwt,@PathVariable String id,@RequestHeader(value="If-Match",required=false) String expected,@RequestBody Map<String,String> body){var row=(Document)service.moderate(admin(jwt),id,version(expected),body.get("action"),body.get("reason"));return accepted(id,((Number)row.get("version")).longValue());}
    @GetMapping("/api/v1/me/favorites") Object favorites(@AuthenticationPrincipal Jwt jwt){return page(((List<Document>)service.favorites(user(jwt))).stream().map(vn.smarttravel.community.shared.web.Representations::favorite).toList());}
    @PutMapping("/api/v1/me/favorites/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) void favorite(@AuthenticationPrincipal Jwt jwt,@PathVariable String id){service.favorite(user(jwt),id,true);}
    @DeleteMapping("/api/v1/me/favorites/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) void unfavorite(@AuthenticationPrincipal Jwt jwt,@PathVariable String id){service.favorite(user(jwt),id,false);}
    @PostMapping("/api/v1/reviews/{id}/reports") @ResponseStatus(HttpStatus.ACCEPTED) Object report(@AuthenticationPrincipal Jwt jwt,@PathVariable String id,@RequestBody Map<String,String> body){var row=moderation.report(id,user(jwt),body.get("reason"));return accepted(row.getString("_id"),((Number)row.get("version")).longValue());}
    @GetMapping("/api/v1/admin/reviews") Object pending(@AuthenticationPrincipal Jwt jwt){admin(jwt);return page(moderation.queue("reviews").stream().map(vn.smarttravel.community.shared.web.Representations::review).toList());}
    @GetMapping("/api/v1/admin/reports") Object reports(@AuthenticationPrincipal Jwt jwt){admin(jwt);return page(moderation.queue("review_reports").stream().map(row->accepted(row.getString("_id"),((Number)row.get("version")).longValue())).toList());}
    @PostMapping("/api/v1/admin/reports/{id}/moderate") @ResponseStatus(HttpStatus.ACCEPTED) Object reportDecision(@AuthenticationPrincipal Jwt jwt,@PathVariable String id,@RequestHeader("If-Match") String expected,@RequestBody Map<String,String> body){var row=moderation.moderate(id,admin(jwt),version(expected),body.get("action"),body.get("reason"));return accepted(id,((Number)row.get("version")).longValue());}
    @PostMapping("/internal/v1/ratings/batch") Object ratings(@RequestBody Map<String,List<String>> body){var ids=body.get("ids");var rows=moderation.ratings(ids);var found=rows.stream().map(d->d.getString("_id")).collect(java.util.stream.Collectors.toSet());return Map.of("items",rows.stream().map(vn.smarttravel.community.shared.web.Representations::rating).toList(),"missing_ids",ids.stream().filter(id->!found.contains(id)).toList());}
    @GetMapping("/internal/v1/ratings/snapshot") Object ratings(){return page(moderation.snapshot().stream().map(vn.smarttravel.community.shared.web.Representations::rating).toList());}
}
