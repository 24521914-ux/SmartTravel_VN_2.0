package vn.smarttravel.intelligence.recommendations.controller;

import static vn.smarttravel.intelligence.shared.util.IntelligenceSupport.*;
import vn.smarttravel.intelligence.projections.service.ProjectionService;
import vn.smarttravel.intelligence.recommendations.service.BasicService;
import vn.smarttravel.intelligence.recommendations.client.DependencyClient;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.*;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.*;

@RestController
public class IntelligenceController {
    private final BasicService basic;
    private final vn.smarttravel.intelligence.infrastructure.idempotency.service.MutationService mutations;
    private final ProjectionService projections;
    private final vn.smarttravel.intelligence.models.service.ModelService models;
    private final vn.smarttravel.intelligence.infrastructure.transport.service.EventContracts contracts;
    public IntelligenceController(BasicService basic,ProjectionService projections,vn.smarttravel.intelligence.models.service.ModelService models,vn.smarttravel.intelligence.infrastructure.transport.service.EventContracts contracts,vn.smarttravel.intelligence.infrastructure.idempotency.service.MutationService mutations){this.mutations=mutations;this.basic=basic;this.projections=projections;this.models=models;this.contracts=contracts;}
    static UUID user(Authentication auth){return auth==null?null:UUID.fromString(auth.getName());}
    @PostMapping("/api/v1/recommendations") public Object recommendations(Authentication auth,@RequestBody JsonNode input){return models.recommend(user(auth),input);}
    @PostMapping("/api/v1/interactions/batch") @ResponseStatus(org.springframework.http.HttpStatus.ACCEPTED) public Object interactions(Authentication auth,@RequestBody JsonNode input){return basic.interactions(user(auth),input);}
    @GetMapping("/api/v1/me/interactions") public Object history(Authentication auth,@RequestParam(defaultValue="20") int limit,@RequestParam(required=false) String cursor){return basic.history(user(auth),limit,cursor);}
    @DeleteMapping("/api/v1/me/interactions") @ResponseStatus(org.springframework.http.HttpStatus.ACCEPTED) public Object delete(Authentication auth,@RequestHeader(value="Idempotency-Key",required=false) String key){return mutations.execute("history-delete",user(auth),key,"user:"+user(auth),null,Map.of(),202,null,()->basic.deleteHistory(user(auth)));}
    @PostMapping("/internal/v1/events") public Object event(@RequestBody JsonNode event){contracts.validate(event);return Map.of("processed",projections.consume(event));}
}
