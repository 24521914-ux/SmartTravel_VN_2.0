package vn.smarttravel.community.reviews.integration;

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
import org.springframework.data.mongodb.core.*;
import org.springframework.data.mongodb.core.query.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;

@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")
@EnabledIfEnvironmentVariable(named="COMMUNITY_DB_TESTS",matches="true")
class CommunityProviderTests {
    static final ObjectMapper JSON=new ObjectMapper();
    final Set<String> seen=new HashSet<>();
    static final String USER="10000000-0000-0000-0000-000000000001",OTHER="10000000-0000-0000-0000-000000000002",PLACE="20000000-0000-0000-0000-000000000001";
    static HttpServer stub=start();
    @Autowired MockMvc mvc;@Autowired MongoTemplate mongo;
    static HttpServer start(){try{var s=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);s.createContext("/",e->{
        // Validation and enrichment have distinct frozen response contracts.
        Map<String,Object> place=e.getRequestURI().getPath().equals("/internal/v1/places/validate")
            ?Map.of("place_id",PLACE,"public",true,"version",1)
            :Map.of("place_id",PLACE,"status","PUBLISHED","version",1);
        byte[] bytes=JSON.writeValueAsBytes(Map.of("items",List.of(place),"missing_ids",List.of()));e.getResponseHeaders().set("Content-Type","application/json");e.sendResponseHeaders(200,bytes.length);e.getResponseBody().write(bytes);e.close();});s.start();return s;}catch(Exception e){throw new ExceptionInInitializerError(e);}}
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r){String base="http://127.0.0.1:"+stub.getAddress().getPort();r.add("catalog.base-url",()->base);r.add("security.jwt.jwk-set-uri",()->base+"/jwks");r.add("security.jwt.issuer",()->"fixture");r.add("community.transport.enabled",()->"false");}
    @BeforeEach void clear(){for(String name:List.of("reviews","rating_summaries","favorites","collections","collection_items","collection_visibility_events","outbox_events","moderation_actions","contributions","inbox_events","audit_logs","idempotency_keys","review_reports"))mongo.remove(new Query(),name);}
    @AfterAll static void stop(){stub.stop(0);}
    JsonNode http(String method,String path,Object body,int expected,Long version)throws Exception{
        var request=MockMvcRequestBuilders.request(org.springframework.http.HttpMethod.valueOf(method),path).with(jwt().jwt(j->j.subject(USER).claim("roles",List.of("ADMIN","SERVICE")).claim("scope","community:read community:write community:admin community:ratings:read")));
        if(body!=null)request.contentType("application/json").content(JSON.writeValueAsBytes(body));if(version!=null)request.header("If-Match",version);if(method.equals("POST"))request.header("Idempotency-Key",UUID.randomUUID().toString());
        var response=mvc.perform(request).andReturn().getResponse();assertThat(response.getStatus()).as(method+" "+path+" "+response.getContentAsString()).isEqualTo(expected);if(expected==204)assertThat(response.getContentAsString()).isEmpty();
        var result=expected==204?JSON.createObjectNode():JSON.readTree(response.getContentAsString());var contract=JSON.readTree(Files.readString(Path.of("../../contracts/openapi/community.yaml")));
        for(var it=contract.path("paths").fields();it.hasNext();){var entry=it.next();if(path.split("\\?",2)[0].matches(entry.getKey().replaceAll("\\{[^}]+}","[^/]+"))&&entry.getValue().has(method.toLowerCase())){seen.add(entry.getValue().path(method.toLowerCase()).path("operationId").asText());var schema=entry.getValue().path(method.toLowerCase()).path("responses").path(""+expected).path("content").path("application/json").path("schema");if(!schema.isMissingNode())assertThat(JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012).getSchema(schema).validate(result)).as("frozen provider "+path).isEmpty();}}
        return result;
    }
    @Test void reportedReviewQueuePreservesAckAndExposesActualReviewForAdmin()throws Exception{
        String content="Actual reported review body",reason="Specific reported business concern";
        String review=http("POST","/api/v1/places/"+PLACE+"/reviews",Map.of("rating",3,"content",content,"media_keys",List.of()),201,null).path("review_id").asText();
        http("POST","/api/v1/admin/reviews/"+review+"/moderate",Map.of("action","APPROVE","reason","Reviewed fixture"),202,1L);
        String report=http("POST","/api/v1/reviews/"+review+"/reports",Map.of("reason",reason),202,null).path("request_id").asText();
        var item=http("GET","/api/v1/admin/reports",null,200,null).path("items").get(0);
        assertThat(item.path("request_id").asText()).isEqualTo(report);assertThat(item.path("status").asText()).isEqualTo("COMPLETED");assertThat(item.path("version").asLong()).isEqualTo(1);
        assertThat(item.path("review_id").asText()).isEqualTo(review);assertThat(item.path("reason").asText()).isEqualTo(reason);assertThat(item.path("report_status").asText()).isEqualTo("OPEN");
        assertThat(item.path("review_content").asText()).isEqualTo(content);assertThat(item.path("place_id").asText()).isEqualTo(PLACE);assertThat(item.has("reporter_id")).isFalse();
        var nonAdmin=MockMvcRequestBuilders.get("/api/v1/admin/reports").with(jwt().jwt(j->j.subject(OTHER).claim("roles",List.of("USER")).claim("scope","community:read community:write")));
        assertThat(mvc.perform(nonAdmin).andReturn().getResponse().getStatus()).isEqualTo(403);
        http("POST","/api/v1/admin/reports/"+report+"/moderate",Map.of("action","REJECT","reason","Inspected real content"),202,1L);
        assertThat(http("GET","/api/v1/admin/reports",null,200,null).path("items").size()).isZero();
    }
    @Test void cursorListsExposeEveryRecordBeyondOneHundredWithoutDuplicates()throws Exception{
        var reports=new ArrayList<org.bson.Document>();var reviews=new ArrayList<org.bson.Document>();var favorites=new ArrayList<org.bson.Document>();var collections=new ArrayList<org.bson.Document>();var contributions=new ArrayList<org.bson.Document>();Date now=new Date();
        for(int index=0;index<101;index++){
            String review=UUID.randomUUID().toString();
            reviews.add(new org.bson.Document("_id",review).append("user_id",UUID.randomUUID().toString()).append("place_id",PLACE).append("rating",3).append("content","Visible review "+index).append("status","APPROVED").append("version",1L).append("created_at",now).append("updated_at",now));
            reviews.add(new org.bson.Document("_id",UUID.randomUUID().toString()).append("user_id",UUID.randomUUID().toString()).append("place_id",PLACE).append("rating",4).append("content","Pending review "+index).append("status","PENDING").append("version",1L).append("created_at",now).append("updated_at",now));
            reports.add(new org.bson.Document("_id",UUID.randomUUID().toString()).append("review_id",review).append("reporter_id",USER).append("reason","Report "+index).append("status","OPEN").append("version",1L).append("created_at",now));
            favorites.add(new org.bson.Document("_id",UUID.randomUUID().toString()).append("user_id",USER).append("place_id",UUID.randomUUID().toString()).append("created_at",now));
            collections.add(new org.bson.Document("_id",UUID.randomUUID().toString()).append("owner_id",USER).append("name","Collection "+index).append("visibility","PRIVATE").append("version",1L).append("created_at",now).append("updated_at",now));
            contributions.add(new org.bson.Document("_id",UUID.randomUUID().toString()).append("user_id",USER).append("type","ADD_PLACE").append("payload",new org.bson.Document("name","Contribution "+index)).append("payload_schema_version",1L).append("status","PENDING").append("version",1L).append("created_at",now).append("updated_at",now));
        }
        mongo.insert(reviews,"reviews");mongo.insert(reports,"review_reports");mongo.insert(favorites,"favorites");mongo.insert(collections,"collections");mongo.insert(contributions,"contributions");
        for(var endpoint:Map.of("/api/v1/admin/reports","request_id","/api/v1/admin/reviews","review_id","/api/v1/places/"+PLACE+"/reviews","review_id","/api/v1/me/favorites","place_id","/api/v1/me/collections","collection_id","/api/v1/me/contributions","contribution_id","/api/v1/admin/contributions","contribution_id").entrySet()){
            var first=http("GET",endpoint.getKey()+"?limit=100",null,200,null);assertThat(first.path("items").size()).as(endpoint.getKey()).isEqualTo(100);
            String cursor=first.path("next_cursor").asText();assertThat(cursor).isNotBlank().isNotEqualTo("null");
            var second=http("GET",endpoint.getKey()+"?limit=100&cursor="+cursor,null,200,null);assertThat(second.path("items").size()).as(endpoint.getKey()).isEqualTo(1);assertThat(second.path("next_cursor").isNull()).isTrue();
            Set<String> ids=new HashSet<>();first.path("items").forEach(item->ids.add(item.path(endpoint.getValue()).asText()));second.path("items").forEach(item->ids.add(item.path(endpoint.getValue()).asText()));assertThat(ids).hasSize(101);
        }
    }
    @Test void allThirtyTwoFrozenOperationsReturnValidatedProviderResponses()throws Exception{
        String review=http("POST","/api/v1/places/"+PLACE+"/reviews",Map.of("rating",5,"content","Licensed synthetic review","media_keys",List.of()),201,null).path("review_id").asText();
        http("GET","/api/v1/places/"+PLACE+"/reviews",null,200,null);http("GET","/api/v1/admin/reviews",null,200,null);
        http("POST","/api/v1/admin/reviews/"+review+"/moderate",Map.of("action","APPROVE","reason","Checked fixture"),202,1L);
        String report=http("POST","/api/v1/reviews/"+review+"/reports",Map.of("reason","Fixture report"),202,null).path("request_id").asText();
        http("GET","/api/v1/admin/reports",null,200,null);http("POST","/api/v1/admin/reports/"+report+"/moderate",Map.of("action","REJECT","reason","Checked fixture"),202,1L);
        http("PATCH","/api/v1/reviews/"+review,Map.of("rating",4,"content","Edited fixture","media_keys",List.of()),200,2L);
        http("PUT","/api/v1/me/favorites/"+PLACE,null,204,null);http("GET","/api/v1/me/favorites",null,200,null);http("DELETE","/api/v1/me/favorites/"+PLACE,null,204,null);
        String collection=http("POST","/api/v1/me/collections",Map.of("name","x".repeat(1024),"visibility","PUBLIC"),201,null).path("collection_id").asText();String mine="/api/v1/me/collections/"+collection,publicPath="/api/v1/collections/"+collection;
        http("GET","/api/v1/me/collections",null,200,null);http("GET",mine,null,200,null);http("GET",publicPath,null,200,null);http("PATCH",mine,Map.of("name","Renamed fixture"),200,1L);
        String item=http("POST",publicPath+"/items",Map.of("place_id",PLACE,"note","Fixture note"),201,2L).path("item_id").asText();http("GET",publicPath+"/items",null,200,null);http("GET",publicPath+"/items/"+item,null,200,null);http("PATCH",publicPath+"/items/"+item,Map.of("note","Updated note"),200,3L);http("PUT",publicPath+"/items/order",Map.of("item_ids",List.of(item)),200,4L);http("DELETE",publicPath+"/items/"+item,null,204,5L);http("DELETE",mine,null,204,6L);
        var contributionBody=Map.of("type","EDIT","target_id",PLACE,"expected_version",1,"fields",Map.of("name","Proposed licensed name"));String contribution=http("POST","/api/v1/contributions",contributionBody,201,null).path("contribution_id").asText();http("GET","/api/v1/me/contributions",null,200,null);http("PATCH","/api/v1/contributions/"+contribution,Map.of("fields",Map.of("name","Edited proposal")),200,1L);http("GET","/api/v1/admin/contributions",null,200,null);http("POST","/api/v1/admin/contributions/"+contribution+"/moderate",Map.of("action","APPROVE","reason","Checked proposal"),202,2L);
        String withdraw=http("POST","/api/v1/contributions",contributionBody,201,null).path("contribution_id").asText();http("POST","/api/v1/contributions/"+withdraw+"/withdraw",Map.of(),200,1L);
        http("POST","/internal/v1/ratings/batch",Map.of("ids",List.of(PLACE)),200,null);http("GET","/internal/v1/ratings/snapshot",null,200,null);http("DELETE","/api/v1/reviews/"+review,null,204,3L);
        for(var row:mongo.find(new Query(),org.bson.Document.class,"outbox_events")){var event=JSON.readTree(row.get("envelope",org.bson.Document.class).toJson());var schema=JSON.readTree(Files.readString(Path.of("../../contracts/events/"+event.path("event_type").asText()+".schema.json")));assertThat(JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012).getSchema(schema).validate(event)).as("outgoing event "+event.path("event_type")).isEmpty();}
        var frozen=JSON.readTree(Files.readString(Path.of("../../contracts/openapi/community.yaml")));Set<String> required=new HashSet<>();for(JsonNode path:frozen.path("paths"))for(JsonNode operation:path)required.add(operation.path("operationId").asText());assertThat(seen).containsExactlyInAnyOrderElementsOf(required);
        var rejected=MockMvcRequestBuilders.post("/api/v1/me/collections").with(jwt().jwt(j->j.subject(USER).claim("scope","community:write"))).contentType("application/json").content(JSON.writeValueAsBytes(Map.of("name","x".repeat(1025),"visibility","PRIVATE")));assertThat(mvc.perform(rejected).andReturn().getResponse().getStatus()).isEqualTo(400);
    }
}
