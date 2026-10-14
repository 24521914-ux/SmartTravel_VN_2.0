package vn.smarttravel.intelligence.models.controller;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.*;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import vn.smarttravel.intelligence.models.service.ModelService;
import static vn.smarttravel.intelligence.shared.util.IntelligenceSupport.*;

@RestController
@RequestMapping("/api/v1/admin")
public class ModelController {
    private final ModelService models;
    private final vn.smarttravel.intelligence.infrastructure.idempotency.service.MutationService mutations;
    public ModelController(ModelService models,vn.smarttravel.intelligence.infrastructure.idempotency.service.MutationService mutations){this.models=models;this.mutations=mutations;}
    private UUID actor(Authentication auth){return UUID.fromString(auth.getName());}
    private String reason(JsonNode body){fields(body,Set.of("reason"));require(!body.path("reason").asText().isBlank()&&body.path("reason").asText().length()<=1024,"REASON_REQUIRED");return body.path("reason").asText();}
    @PostMapping("/datasets") public ResponseEntity<?> build(Authentication auth,@RequestHeader(value="Idempotency-Key",required=false) String key,@RequestBody JsonNode request){return ResponseEntity.status(HttpStatus.ACCEPTED).body(mutations.execute("dataset",actor(auth),key,null,null,request,202,null,()->models.build(actor(auth),request)));}
    @GetMapping("/datasets/{id}") public Object dataset(@PathVariable UUID id){return models.dataset(id);}
    @PostMapping("/training-jobs") public ResponseEntity<?> enqueue(Authentication auth,@RequestHeader(value="Idempotency-Key",required=false) String key,@RequestBody JsonNode request){return ResponseEntity.status(HttpStatus.ACCEPTED).body(mutations.execute("training-job",actor(auth),key,null,null,request,202,null,()->models.enqueue(actor(auth),request)));}
    @GetMapping("/training-jobs/{id}") public Object job(@PathVariable UUID id){return models.job(id);}
    @PostMapping("/training-jobs/{id}/cancel") @ResponseStatus(HttpStatus.ACCEPTED) public Object cancel(Authentication auth,@PathVariable UUID id,@RequestHeader(value="If-Match",required=false) String match){return mutations.versioned(actor(auth),"job:"+id,match,()->((Number)models.job(id).get("version")).longValue(),()->models.cancel(actor(auth),id));}
    @GetMapping("/models") public Object models(@RequestParam(defaultValue="20") int limit,@RequestParam(required=false) String cursor){return models.models(limit,cursor);}
    @GetMapping("/models/{id}/metrics") public Object metrics(@PathVariable UUID id){return models.model(id).get("metrics");}
    @PostMapping("/models/{id}/validate") public ResponseEntity<?> validate(Authentication auth,@PathVariable UUID id,@RequestHeader(value="Idempotency-Key",required=false) String key,@RequestHeader(value="If-Match",required=false) String match,@RequestBody JsonNode body){return ResponseEntity.accepted().body(mutations.execute("model-validate",actor(auth),key,"model:"+id,match,body,202,()->((Number)models.model(id).get("version")).longValue(),()->models.validate(actor(auth),id,reason(body))));}
    @PostMapping("/models/{id}/deploy") public ResponseEntity<?> deploy(Authentication auth,@PathVariable UUID id,@RequestHeader(value="Idempotency-Key",required=false) String key,@RequestHeader(value="If-Match",required=false) String match,@RequestBody JsonNode body){return ResponseEntity.accepted().body(mutations.execute("model-deploy",actor(auth),key,"model:"+id,match,body,202,()->((Number)models.model(id).get("version")).longValue(),()->models.deploy(actor(auth),id,reason(body),false)));}
    @PostMapping("/models/{id}/rollback") public ResponseEntity<?> rollback(Authentication auth,@PathVariable UUID id,@RequestHeader(value="Idempotency-Key",required=false) String key,@RequestHeader(value="If-Match",required=false) String match,@RequestBody JsonNode body){return ResponseEntity.accepted().body(mutations.execute("model-rollback",actor(auth),key,"model:"+id,match,body,202,()->((Number)models.model(id).get("version")).longValue(),()->models.deploy(actor(auth),id,reason(body),true)));}
}
