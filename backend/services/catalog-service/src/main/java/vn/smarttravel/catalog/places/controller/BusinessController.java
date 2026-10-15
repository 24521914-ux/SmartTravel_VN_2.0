package vn.smarttravel.catalog.places.controller;
import vn.smarttravel.catalog.places.service.BusinessService;
import java.util.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.http.HttpStatus;
import static vn.smarttravel.catalog.shared.web.Representations.*;
@RestController
public class BusinessController {
    private final BusinessService service;public BusinessController(BusinessService service){this.service=service;}
    private UUID user(Jwt jwt,String role){CatalogController.role(jwt,role);return UUID.fromString(jwt.getSubject());}
    private long version(String value){return vn.smarttravel.catalog.shared.web.VersionHeaders.parse(value);}
    private String decision(String action){return switch(action){case "APPROVE"->"APPROVED";case "REJECT"->"REJECTED";case "REVOKE"->"REVOKED";default->throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST);};}
    @GetMapping("/api/v1/businesses") Object list(@AuthenticationPrincipal Jwt jwt){return page(service.list(user(jwt,"BUSINESS")).stream().map(vn.smarttravel.catalog.shared.web.Representations::business).toList());}
    @PostMapping("/api/v1/businesses") @ResponseStatus(HttpStatus.CREATED) Object create(@AuthenticationPrincipal Jwt jwt,@RequestBody Map<String,Object> body){return business((Map<String,Object>)service.create(user(jwt,"BUSINESS"),body));}
    @GetMapping("/api/v1/businesses/{id}") Object get(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id){return business(service.get(id,user(jwt,"BUSINESS")));}
    @PatchMapping("/api/v1/businesses/{id}") Object update(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestHeader(value="If-Match",required=false) String expected,@RequestBody Map<String,Object> body){return business(service.update(id,user(jwt,"BUSINESS"),version(expected),body));}
    @DeleteMapping("/api/v1/businesses/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) void delete(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestHeader(value="If-Match",required=false) String expected){service.delete(id,user(jwt,"BUSINESS"),version(expected));}
    @GetMapping("/api/v1/businesses/{id}/members") Object members(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id){return page(service.members(id,user(jwt,"BUSINESS")).stream().map(vn.smarttravel.catalog.shared.web.Representations::member).toList());}
    @PostMapping("/api/v1/businesses/{id}/members") @ResponseStatus(HttpStatus.CREATED) Object add(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestBody Map<String,String> body){return vn.smarttravel.catalog.shared.web.Representations.member(service.ownMembership(id,user(jwt,"BUSINESS"),body.get("role")));}
    @GetMapping("/api/v1/businesses/{id}/members/{member}") Object member(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@PathVariable UUID member){return vn.smarttravel.catalog.shared.web.Representations.member(service.member(id,member,user(jwt,"BUSINESS")));}
    @PatchMapping("/api/v1/businesses/{id}/members/{member}") Object memberUpdate(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@PathVariable UUID member,@RequestHeader(value="If-Match",required=false) String expected,@RequestBody Map<String,String> body){return vn.smarttravel.catalog.shared.web.Representations.member(service.memberUpdate(id,member,user(jwt,"BUSINESS"),version(expected),body.get("role")));}
    @DeleteMapping("/api/v1/businesses/{id}/members/{member}") @ResponseStatus(HttpStatus.NO_CONTENT) void memberDelete(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@PathVariable UUID member,@RequestHeader(value="If-Match",required=false) String expected){service.memberDelete(id,member,user(jwt,"BUSINESS"),version(expected));}
    @PostMapping("/api/v1/businesses/{id}/verification") @ResponseStatus(HttpStatus.ACCEPTED) Object verification(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestBody Map<String,List<String>> body){return service.verification(id,user(jwt,"BUSINESS"),body.get("evidence_keys"));}
    @PostMapping("/api/v1/admin/business-verifications/{id}/review") @ResponseStatus(HttpStatus.ACCEPTED) Object verify(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestBody Map<String,String> body){return service.verificationReview(id,user(jwt,"ADMIN"),body.get("action"),body.get("reason"));}
    @PostMapping("/api/v1/businesses/{id}/claims") @ResponseStatus(HttpStatus.CREATED) Object claim(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestBody Map<String,Object> body){return service.claim(id,user(jwt,"BUSINESS"),body);}
    @PostMapping("/api/v1/admin/claims/{id}/review") @ResponseStatus(HttpStatus.ACCEPTED) Object decide(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestBody Map<String,String> body){service.reviewClaim(id,user(jwt,"ADMIN"),decision(body.get("action")),body.get("reason"));return accepted(id,1);}
    @PostMapping("/api/v1/claims/{id}/change-requests") @ResponseStatus(HttpStatus.ACCEPTED) Object request(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestBody Map<String,Object> body){var out=new LinkedHashMap<>((Map<String,Object>)service.request(id,user(jwt,"BUSINESS"),((Number)body.get("expected_version")).longValue(),(Map<String,Object>)body.get("fields")));out.remove("request_id");return out;}
    @PostMapping("/api/v1/admin/change-requests/{id}/review") @ResponseStatus(HttpStatus.ACCEPTED) Object apply(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestBody Map<String,String> body){service.reviewRequest(id,user(jwt,"ADMIN"),decision(body.get("action")),body.get("reason"));return accepted(id,1);}
}
