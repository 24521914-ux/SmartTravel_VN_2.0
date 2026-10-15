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
    private String credential(String base){String scoped=base.equals(catalog)?catalogToken:base.equals(ingestion)?ingestionToken:token;return scoped==null||scoped.isBlank()?token:scoped;}
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
}
