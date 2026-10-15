package vn.smarttravel.catalog.places.integration;

import com.fasterxml.jackson.databind.*;
import com.networknt.schema.*;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.context.*;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;

@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")
@EnabledIfEnvironmentVariable(named="CATALOG_DB_TESTS",matches="true")
class CatalogProviderTests {
    static final ObjectMapper JSON=new ObjectMapper();
    final Set<String> seen=new HashSet<>();
    static final String USER="10000000-0000-0000-0000-000000000001",OTHER="10000000-0000-0000-0000-000000000002",PLACE="20000000-0000-0000-0000-000000000001";
    static HttpServer stub=start();
    @Autowired MockMvc mvc;@Autowired org.springframework.jdbc.core.JdbcTemplate db;
    @Autowired vn.smarttravel.catalog.media.service.MediaService media;
    static HttpServer start(){try{var s=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);s.createContext("/",e->{byte[] bytes=JSON.writeValueAsBytes(Map.of("clean",true));e.getResponseHeaders().set("Content-Type","application/json");e.sendResponseHeaders(200,bytes.length);e.getResponseBody().write(bytes);e.close();});s.start();return s;}catch(Exception e){throw new ExceptionInInitializerError(e);}}
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r){String base="http://127.0.0.1:"+stub.getAddress().getPort();r.add("catalog.media.scanner-url",()->base);r.add("ingestion.base-url",()->base);r.add("security.jwt.jwk-set-uri",()->base+"/jwks");r.add("security.jwt.issuer",()->"fixture");r.add("catalog.transport.enabled",()->"false");}
    @AfterAll static void stop(){stub.stop(0);}
    JsonNode http(String method,String path,Object body,int expected,Long version)throws Exception{
        var request=MockMvcRequestBuilders.request(org.springframework.http.HttpMethod.valueOf(method),path).with(jwt().jwt(j->j.subject(USER).claim("roles",List.of("ADMIN","SERVICE","BUSINESS")).claim("scope","catalog:read catalog:write catalog:admin catalog:business catalog:places:read catalog:places:validate catalog:candidates:read")));
        if(body!=null)request.contentType("application/json").content(JSON.writeValueAsBytes(body));if(version!=null)request.header("If-Match",version);if(method.equals("POST"))request.header("Idempotency-Key",UUID.randomUUID().toString());
        var response=mvc.perform(request).andReturn().getResponse();assertThat(response.getStatus()).as(method+" "+path+" "+response.getContentAsString()).isEqualTo(expected);if(expected==204)assertThat(response.getContentAsString()).isEmpty();
        var result=expected==204?JSON.createObjectNode():JSON.readTree(response.getContentAsString());var contract=JSON.readTree(Files.readString(Path.of("../../contracts/openapi/catalog.yaml")));
        for(var it=contract.path("paths").fields();it.hasNext();){var entry=it.next();if(path.matches(entry.getKey().replaceAll("\\{[^}]+}","[^/]+"))&&entry.getValue().has(method.toLowerCase())){seen.add(entry.getValue().path(method.toLowerCase()).path("operationId").asText());var schema=entry.getValue().path(method.toLowerCase()).path("responses").path(""+expected).path("content").path("application/json").path("schema");if(!schema.isMissingNode())assertThat(JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012).getSchema(schema).validate(result)).as("frozen provider "+path).isEmpty();}}
        return result;
    }
    @Test void allSixtySixFrozenOperationsReturnValidatedProviderResponses()throws Exception{
        Map<String,String> ids=new HashMap<>();
        for(String kind:List.of("geographic-units","categories","tags","amenities","destinations")){
            Map<String,Object> body=new HashMap<>(Map.of("name","x".repeat(1024)));if(kind.equals("geographic-units")){body.put("level","PROVINCE");body.put("aliases",List.of("Synthetic former name"));}if(kind.equals("destinations")){body.put("geographic_unit_ids",List.of(ids.get("geographic-units")));}
            String prefix="/api/v1/admin/"+kind;var created=http("POST",prefix,body,201,null);String id=created.path(kind.equals("destinations")?"destination_id":"id").asText();ids.put(kind,id);
            http("GET",prefix,null,200,null);http("GET",prefix+"/"+id,null,200,null);http("PATCH",prefix+"/"+id,Map.of("name","Updated "+kind),200,1L);http("GET","/api/v1/"+kind,null,200,null);
        }
        var body=new LinkedHashMap<String,Object>();body.put("name","Synthetic licensed place");body.put("latitude",10.76);body.put("longitude",106.66);body.put("category_ids",List.of(ids.get("categories")));body.put("tag_ids",List.of(ids.get("tags")));body.put("amenity_ids",List.of(ids.get("amenities")));body.put("geographic_unit_id",ids.get("geographic-units"));body.put("price",0);body.put("currency","VND");body.put("opening_hours",List.of());body.put("media_keys",List.of());
        String place=http("POST","/api/v1/admin/places",body,201,null).path("place_id").asText();String admin="/api/v1/admin/places/"+place;
        http("GET","/api/v1/admin/places",null,200,null);http("GET",admin,null,200,null);http("PATCH",admin,Map.of("name","Updated licensed place"),200,1L);http("PUT",admin+"/status",Map.of("status","PUBLISHED"),200,2L);http("GET","/api/v1/places",null,200,null);http("GET","/api/v1/places/"+place,null,200,null);
        for(String route:List.of("batch","validate"))http("POST","/internal/v1/places/"+route,Map.of("ids",List.of(place)),200,null);http("GET","/internal/v1/places/snapshot",null,200,null);http("POST","/internal/v1/places/candidates",Map.of("name","Updated licensed place","latitude",10.76,"longitude",106.66),200,null);
        String offering=http("POST","/api/v1/admin/offerings",Map.of("place_id",place,"type","SERVICE","name","Fixture offering","price",0,"currency","VND"),201,null).path("offering_id").asText();String offer="/api/v1/admin/offerings/"+offering;
        http("GET","/api/v1/admin/offerings",null,200,null);http("GET",offer,null,200,null);http("PATCH",offer,Map.of("name","Edited offering"),200,1L);http("GET","/api/v1/offerings",null,200,null);http("GET","/api/v1/places/"+place+"/offerings",null,200,null);http("DELETE",offer,null,204,2L);
        String business=http("POST","/api/v1/businesses",Map.of("name","x".repeat(1024)),201,null).path("business_id").asText();String b="/api/v1/businesses/"+business;
        http("GET","/api/v1/businesses",null,200,null);http("GET",b,null,200,null);http("PATCH",b,Map.of("name","Edited business"),200,1L);
        String member=http("POST",b+"/members",Map.of("role","OWNER"),201,null).path("member_id").asText();http("GET",b+"/members",null,200,null);http("GET",b+"/members/"+member,null,200,null);http("PATCH",b+"/members/"+member,Map.of("role","OWNER"),200,1L);
        UUID fixtureMember=UUID.randomUUID();db.update("INSERT INTO catalog.business_members(business_id,user_id,member_id,member_role) VALUES(?,?,?,'EDITOR')",UUID.fromString(business),UUID.fromString(OTHER),fixtureMember);http("DELETE",b+"/members/"+fixtureMember,null,204,1L);
        String verification=http("POST",b+"/verification",Map.of("evidence_keys",List.of("private/"+USER+"/synthetic-proof")),202,null).path("request_id").asText();http("POST","/api/v1/admin/business-verifications/"+verification+"/review",Map.of("action","APPROVE","reason","Verified synthetic evidence"),202,null);
        String claim=http("POST",b+"/claims",Map.of("place_id",place,"evidence_keys",List.of("private/"+USER+"/synthetic-proof")),201,null).path("claim_id").asText();http("POST","/api/v1/admin/claims/"+claim+"/review",Map.of("action","APPROVE","reason","Checked fixture"),202,null);
        String change=http("POST","/api/v1/claims/"+claim+"/change-requests",Map.of("fields",Map.of("name","Business proposal"),"expected_version",3),202,null).path("change_request_id").asText();http("POST","/api/v1/admin/change-requests/"+change+"/review",Map.of("action","REJECT","reason","Fixture rejected"),202,null);
        var uploaded=(Map<String,Object>)media.upload(new byte[]{(byte)137,80,78,71,13,10,26,10},"image/png",UUID.fromString(USER),false);http("POST","/api/v1/admin/media/"+uploaded.get("media_id")+"/review",Map.of("action","APPROVE","reason","Clean fixture"),202,null);
        http("DELETE",b,null,204,3L);http("DELETE",admin,null,204,3L);
        for(String kind:List.of("geographic-units","categories","tags","amenities","destinations"))http("DELETE","/api/v1/admin/"+kind+"/"+ids.get(kind),null,204,2L);
        for(var row:db.queryForList("SELECT payload::text envelope FROM catalog.outbox_events")){var event=JSON.readTree(row.get("envelope").toString());var schema=JSON.readTree(Files.readString(Path.of("../../contracts/events/"+event.path("event_type").asText()+".schema.json")));assertThat(JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012).getSchema(schema).validate(event)).as("outgoing event "+event.path("event_type")).isEmpty();}
        var frozen=JSON.readTree(Files.readString(Path.of("../../contracts/openapi/catalog.yaml")));Set<String> required=new HashSet<>();for(JsonNode path:frozen.path("paths"))for(JsonNode operation:path)required.add(operation.path("operationId").asText());assertThat(seen).containsExactlyInAnyOrderElementsOf(required);
        var rejected=MockMvcRequestBuilders.post("/api/v1/businesses").with(jwt().jwt(j->j.subject(USER).claim("roles",List.of("BUSINESS")).claim("scope","catalog:write"))).contentType("application/json").content(JSON.writeValueAsBytes(Map.of("name","x".repeat(1025))));assertThat(mvc.perform(rejected).andReturn().getResponse().getStatus()).isEqualTo(400);
    }
}
