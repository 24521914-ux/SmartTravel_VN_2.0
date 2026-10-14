package vn.smarttravel.ingestion.source.controller;
import vn.smarttravel.ingestion.source.client.*;
import vn.smarttravel.ingestion.source.service.*;
import java.util.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.http.ResponseEntity;
import static vn.smarttravel.ingestion.shared.web.ApiValues.*;
@RestController
public class PipelineController {
 private final PipelineService service;
 public PipelineController(PipelineService service){this.service=service;}
 private UUID actor(Jwt jwt,String scope){String scopes=jwt.getClaimAsString("scope");require(scopes!=null&&Arrays.asList(scopes.split(" ")).contains(scope),403,"FORBIDDEN");if(scope.equals("ingestion:admin")){var roles=jwt.getClaimAsStringList("roles");require(roles!=null&&roles.contains("ADMIN")&&!jwt.hasClaim("client_id"),403,"ADMIN_REQUIRED");UUID actor=id(jwt.getSubject());service.guardActor(actor);return actor;}require(!jwt.hasClaim("sid")&&jwt.getClaimAsString("client_id")!=null&&!jwt.getClaimAsString("client_id").isBlank(),403,"WORKLOAD_IDENTITY_REQUIRED");return new UUID(0,0);}
 private ResponseEntity<Object> ok(Object body,int status){var builder=ResponseEntity.status(status).cacheControl(org.springframework.http.CacheControl.noStore());if(body instanceof Map<?,?>m&&m.get("version")!=null)builder.eTag(m.get("version").toString());return builder.body(body);}
 @GetMapping("/api/v1/admin/data-sources") public Object sources(@AuthenticationPrincipal Jwt jwt,@RequestParam(defaultValue="20")int limit,@RequestParam(required=false)String cursor){actor(jwt,"ingestion:admin");return ok(service.paginate(service.sources(null),limit,cursor),200);}
 @PostMapping("/api/v1/admin/data-sources") public Object create(@AuthenticationPrincipal Jwt jwt,@RequestBody Map<String,Object>b){return ok(service.createSource(actor(jwt,"ingestion:admin"),b),201);}
 @GetMapping("/api/v1/admin/data-sources/{source}") public Object source(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID source){actor(jwt,"ingestion:admin");return ok(service.sources(source),200);}
 @PatchMapping("/api/v1/admin/data-sources/{source}") public Object patch(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID source,@RequestHeader(value="If-Match",required=false)String v,@RequestBody Map<String,Object>b){return ok(service.patchSource(actor(jwt,"ingestion:admin"),source,v,b,false),200);}
 @DeleteMapping("/api/v1/admin/data-sources/{source}") public Object revoke(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID source,@RequestHeader(value="If-Match",required=false)String v){service.revokeSource(actor(jwt,"ingestion:admin"),source,v);return ok(null,204);}
 @PatchMapping("/api/v1/admin/data-sources/{source}/policy") public Object patchPolicy(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID source,@RequestHeader(value="If-Match",required=false)String v,@RequestBody Map<String,Object>b){return ok(service.patchSource(actor(jwt,"ingestion:admin"),source,v,b,true),200);}
 @PostMapping("/api/v1/admin/data-sources/{source}/import-jobs") public Object createJob(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID source,@RequestHeader(value="Idempotency-Key",required=false)String key,@RequestBody Map<String,Object>b){return ok(service.createJob(actor(jwt,"ingestion:admin"),source,key,text(b,"mode",20)),202);}
 @GetMapping("/api/v1/admin/import-jobs/{job}") public Object job(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID job){actor(jwt,"ingestion:admin");return ok(service.job(job),200);}
 @GetMapping("/api/v1/admin/import-jobs/{job}/items") public Object items(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID job,@RequestParam(defaultValue="20")int limit,@RequestParam(required=false)String cursor){actor(jwt,"ingestion:admin");return ok(service.paginate(service.items(job,"items"),limit,cursor),200);}
 @GetMapping("/api/v1/admin/import-jobs/{job}/errors") public Object errors(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID job,@RequestParam(defaultValue="20")int limit,@RequestParam(required=false)String cursor){actor(jwt,"ingestion:admin");return ok(service.paginate(service.items(job,"errors"),limit,cursor),200);}
 @GetMapping("/api/v1/admin/import-jobs/{job}/candidates") public Object candidates(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID job,@RequestParam(defaultValue="20")int limit,@RequestParam(required=false)String cursor){actor(jwt,"ingestion:admin");return ok(service.paginate(service.items(job,"candidates"),limit,cursor),200);}
 @PostMapping("/api/v1/admin/import-jobs/{job}/retry") public Object retry(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID job,@RequestHeader(value="If-Match",required=false)String v){return ok(service.retry(actor(jwt,"ingestion:admin"),job,v),202);}
 @PostMapping("/api/v1/admin/import-jobs/{job}/cancel") public Object cancel(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID job,@RequestHeader(value="If-Match",required=false)String v){return ok(service.cancel(actor(jwt,"ingestion:admin"),job,v),202);}
 @PostMapping("/api/v1/admin/import-items/{item}/decision") public Object decide(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID item,@RequestHeader(value="If-Match",required=false)String v,@RequestBody Map<String,Object>b){return ok(service.decide(actor(jwt,"ingestion:admin"),item,v,b),200);}
 @GetMapping("/internal/v1/sources/{source}/policy") public Object policy(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID source){actor(jwt,"ingestion:policy:read");return ok(service.policy(source),200);}
 @PostMapping("/internal/v1/sources/policies/batch") public Object policies(@AuthenticationPrincipal Jwt jwt,@RequestBody Map<String,Object>b){actor(jwt,"ingestion:policy:read");require(b.get("ids") instanceof List<?>,400,"INVALID_IDS");return ok(service.policies(((List<?>)b.get("ids")).stream().map(vn.smarttravel.ingestion.shared.web.ApiValues::id).toList()),200);}
 @PostMapping("/internal/v1/source-links") public Object links(@AuthenticationPrincipal Jwt jwt,@RequestBody Map<String,Object>b){actor(jwt,"ingestion:links:read");require(b.get("external_ids") instanceof List<?>,400,"INVALID_IDS");return ok(service.links(id(b.get("source_id")),((List<?>)b.get("external_ids")).stream().map(Object::toString).toList()),200);}
}
