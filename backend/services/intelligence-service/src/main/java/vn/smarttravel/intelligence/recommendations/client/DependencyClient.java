package vn.smarttravel.intelligence.recommendations.client;

import static vn.smarttravel.intelligence.shared.util.IntelligenceSupport.*;
import vn.smarttravel.intelligence.projections.service.ProjectionService;
import vn.smarttravel.intelligence.recommendations.service.BasicService;
import vn.smarttravel.intelligence.recommendations.client.DependencyClient;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
public class DependencyClient {
    private final HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofMillis(500)).build();
    private final String catalog,ingestion,token;
    @Value("${intelligence.catalog-token:}") private String catalogToken="";
    @Value("${intelligence.ingestion-token:}") private String ingestionToken="";
    @Value("${intelligence.community-token:}") private String communityToken="";
    @Value("${intelligence.trip-token:}") private String tripToken="";
    @Value("${intelligence.trip-url:http://127.0.0.1:8104}") private String trip;
    @Value("${intelligence.identity-token:}") private String identityToken="";
    @org.springframework.beans.factory.annotation.Autowired(required=false) private vn.smarttravel.intelligence.shared.http.WorkloadTokens workloads=vn.smarttravel.intelligence.shared.http.WorkloadTokens.disabled();
    private static final Map<String,String> SCOPES=Map.of("catalog","catalog:places:read","ingestion","ingestion:policy:read","community","community:ratings:read","identity","identity:preferences:read","trip","trip:internal");
    // Scoped static token, then an Identity-issued client-credentials token, then the legacy shared token.
    private String credential(String base){String audience=base.equals(catalog)?"catalog":base.equals(ingestion)?"ingestion":base.equals(community)?"community":base.equals(trip)?"trip":"identity";String scoped=audience.equals("catalog")?catalogToken:audience.equals("ingestion")?ingestionToken:audience.equals("community")?communityToken:audience.equals("trip")?tripToken:identityToken;String access=workloads.token(scoped,audience,SCOPES.get(audience));return access.isBlank()?token:access;}
    @Value("${intelligence.community-url:http://127.0.0.1:8103}") private String community;
    @Value("${intelligence.identity-url:http://127.0.0.1:8101}") private String identity;
    public DependencyClient(@Value("${intelligence.catalog-url:http://127.0.0.1:8102}") String catalog,
            @Value("${intelligence.ingestion-url:http://127.0.0.1:8105}") String ingestion,
            @Value("${intelligence.workload-token:}") String token){this.catalog=catalog;this.ingestion=ingestion;this.token=token;}
    private JsonNode post(String base,String path,List<UUID> ids) {
        if(ids.isEmpty())return JSON.createObjectNode().putArray("items");
        try {
            var builder=HttpRequest.newBuilder(URI.create(base+path)).timeout(vn.smarttravel.intelligence.shared.http.RecommendationDeadline.remaining()).header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(json(Map.of("ids",ids))));
            String access=credential(base);if(!access.isBlank())builder.header("Authorization","Bearer "+access);
            var response=client.send(builder.build(),new vn.smarttravel.intelligence.shared.http.LimitedBodyHandler(1024*1024,vn.smarttravel.intelligence.shared.http.RecommendationDeadline.remaining()));
            if(response.statusCode()!=200)throw new IllegalStateException();
            JsonNode body=read(new String(response.body(),java.nio.charset.StandardCharsets.UTF_8));if(!body.path("items").isArray())throw new IllegalStateException();return body;
        }catch(Exception ex){if(ex instanceof InterruptedException)Thread.currentThread().interrupt();throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"DEPENDENCY_UNAVAILABLE");}
    }
    public Map<UUID,Long> visible(List<UUID> ids) {
        var result=new HashMap<UUID,Long>();
        for(JsonNode n:post(catalog,"/internal/v1/places/validate",ids).path("items"))if(n.path("public").asBoolean())result.put(uuid(n,"place_id"),n.path("version").asLong());
        return result;
    }
    public List<JsonNode> policies(List<UUID> ids) {
        var result=new ArrayList<JsonNode>();for(JsonNode p:post(ingestion,"/internal/v1/sources/policies/batch",ids).path("items"))result.add(p);
        if(result.size()!=ids.size())throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"SOURCE_POLICY_MISSING");return result;
    }
    public JsonNode snapshot(String cursor){return snapshot(catalog,"/internal/v1/places/features-snapshot",cursor);}
    public JsonNode ratingsSnapshot(String cursor){return snapshot(community,"/internal/v1/ratings/snapshot",cursor);}
    public JsonNode interactionsSnapshot(String cursor){return snapshot(trip,"/internal/v1/interactions/snapshot",cursor);}
    public JsonNode preferencesSnapshot(String cursor){return snapshot(identity,"/internal/v1/users/preferences/snapshot",cursor);}
    private JsonNode snapshot(String base,String path,String cursor){
        try{
            String query="?limit=100"+(cursor==null?"":"&cursor="+java.net.URLEncoder.encode(cursor,java.nio.charset.StandardCharsets.UTF_8));
            var request=HttpRequest.newBuilder(URI.create(base+path+query)).timeout(vn.smarttravel.intelligence.shared.http.RecommendationDeadline.remaining());String access=credential(base);if(!access.isBlank())request.header("Authorization","Bearer "+access);
            var response=client.send(request.GET().build(),new vn.smarttravel.intelligence.shared.http.LimitedBodyHandler(1024*1024,vn.smarttravel.intelligence.shared.http.RecommendationDeadline.remaining()));if(response.statusCode()!=200)throw new IllegalStateException();return read(new String(response.body(),java.nio.charset.StandardCharsets.UTF_8));
        }catch(Exception e){if(e instanceof InterruptedException)Thread.currentThread().interrupt();throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"SNAPSHOT_UNAVAILABLE");}
    }
}
