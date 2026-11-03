package vn.smarttravel.catalog.infrastructure.events.client;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
@Component
public class SourcePolicyClient {
    private final vn.smarttravel.catalog.shared.http.BoundedJsonClient client;
    public SourcePolicyClient(@Value("${ingestion.base-url:http://127.0.0.1:8105}") String base,@Value("${ingestion.service-token:}") String token,vn.smarttravel.catalog.shared.http.WorkloadTokens workloads){client=new vn.smarttravel.catalog.shared.http.BoundedJsonClient(base,()->workloads.token(token,"ingestion","ingestion:policy:read"));}
    public Map<String,Object> policy(UUID source){Map<String,Object> result=client.request("GET","/internal/v1/sources/"+source+"/policy",null);if(!source.toString().equals(result.get("source_id"))||!(result.get("source_version") instanceof Number)||!(result.get("allow_storage") instanceof Boolean)||!Set.of("PERMITTED","REVOKED").contains(result.get("status")))throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Invalid source policy response");return result;}
}
