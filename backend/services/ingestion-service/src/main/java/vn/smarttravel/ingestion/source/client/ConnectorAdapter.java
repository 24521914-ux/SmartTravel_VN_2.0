package vn.smarttravel.ingestion.source.client;
import vn.smarttravel.ingestion.source.repository.PipelineStore;
import vn.smarttravel.ingestion.source.client.*;
import vn.smarttravel.ingestion.source.service.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.net.*;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import static vn.smarttravel.ingestion.source.repository.SqlStatements.*;
import static vn.smarttravel.ingestion.shared.web.ApiValues.*;

/** Connectors accept an operator-configured HTTP endpoint. No credential is stored in raw data. */
@Component
public class ConnectorAdapter {
    private final ObjectMapper json;
    private final String catalog,token;
    private final Set<String> hosts;private final boolean local;
    private final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).followRedirects(HttpClient.Redirect.NEVER).build();
    public ConnectorAdapter(ObjectMapper json,@Value("${ingestion.catalog.base-url:http://127.0.0.1:8302}")String catalog,@Value("${ingestion.catalog.token:}")String token,@Value("${ingestion.connector.allowed-hosts:127.0.0.1,localhost}")String hosts,org.springframework.core.env.Environment env) {this.local=Arrays.stream(env.getActiveProfiles()).anyMatch(p->Set.of("local","test","p01local","p02-local").contains(p));this.json=json;this.catalog=catalog;this.token=token;this.hosts=Set.of(hosts.split(","));}
    @SuppressWarnings("unchecked") private Map<String,Object> send(HttpRequest request) {
        try {var response=http.send(request,new vn.smarttravel.ingestion.shared.http.LimitedBodyHandler(1048576));require(response.statusCode()==200,503,response.statusCode()==429?"SOURCE_QUOTA":"DEPENDENCY_UNAVAILABLE");return json.readValue(response.body(),Map.class);}

        catch(org.springframework.web.server.ResponseStatusException e){throw e;}catch(Exception e){if(e instanceof InterruptedException)Thread.currentThread().interrupt();throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,"DEPENDENCY_UNAVAILABLE");}
    }
    public Map<String,Object> fetch(String uri,String cursor,String secretReference) {
        URI endpoint=URI.create(uri);require(("https".equals(endpoint.getScheme())||local&&"http".equals(endpoint.getScheme()))&&hosts.contains(endpoint.getHost())&&endpoint.getUserInfo()==null,422,"SOURCE_HOST_NOT_ALLOWED");
        String suffix=cursor==null?"":(uri.contains("?")?"&":"?")+"cursor="+URLEncoder.encode(cursor,java.nio.charset.StandardCharsets.UTF_8);
        var request=HttpRequest.newBuilder(URI.create(uri+suffix)).timeout(Duration.ofSeconds(3)).GET();
        if(secretReference!=null&&!secretReference.equals("none")){require(secretReference.matches("env:[A-Z][A-Z0-9_]*"),422,"INVALID_SECRET_REFERENCE");String credential=System.getenv(secretReference.substring(4));require(credential!=null&&!credential.isBlank(),503,"SOURCE_CREDENTIAL_MISSING");request.header("Authorization","Bearer "+credential);}
        var response=send(request.build());require(response.get("records") instanceof List<?> && ((List<?>)response.get("records")).size()<=100,422,"SOURCE_PAGE_LIMIT");return response;
    }
    public Map<String,Object> candidates(Map<String,Object>normalized) {
        try {var request=HttpRequest.newBuilder(URI.create(catalog+"/internal/v1/places/candidates")).timeout(Duration.ofSeconds(3)).header("Content-Type","application/json").header("Authorization","Bearer "+token).POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(map("name",normalized.get("name"),"latitude",normalized.get("latitude"),"longitude",normalized.get("longitude"))))).build();return send(request);}catch(com.fasterxml.jackson.core.JsonProcessingException e){throw new IllegalStateException(e);}
    }
}
