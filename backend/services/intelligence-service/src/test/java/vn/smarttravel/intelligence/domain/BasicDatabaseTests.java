package vn.smarttravel.intelligence.domain;

import static vn.smarttravel.intelligence.shared.util.IntelligenceSupport.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.sun.net.httpserver.HttpServer;
import vn.smarttravel.intelligence.projections.service.ProjectionService;
import vn.smarttravel.intelligence.recommendations.service.BasicService;
import com.fasterxml.jackson.databind.JsonNode;
import java.net.InetSocketAddress;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@org.springframework.test.context.ActiveProfiles("test")
@SpringBootTest(properties={"security.jwt.jwk-set-uri=http://127.0.0.1:1/jwks","security.jwt.issuer=fixture","intelligence.workers-enabled=false","intelligence.transport.enabled=false","intelligence.model-deployment-enabled=true","intelligence.inference-deadline-ms=1000","logging.level.root=INFO"})
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named="INTELLIGENCE_DB_TESTS",matches="true")
class BasicDatabaseTests {
    @MockitoBean JwtDecoder decoder;
    @Autowired BasicService basic;
    @Autowired ProjectionService projections;
    @Autowired JdbcTemplate db;
    @Autowired MockMvc http;
    @Autowired vn.smarttravel.intelligence.models.service.ModelService models;
    @Autowired vn.smarttravel.intelligence.models.artifacts.ArtifactStore artifacts;
    @Autowired org.springframework.transaction.support.TransactionTemplate transactions;
    @Autowired vn.smarttravel.intelligence.infrastructure.idempotency.service.MutationService mutations;
    static final UUID source=UUID.randomUUID();
    static volatile boolean allowed=true;
    static volatile long policyDelay=0, visibilityDelay=0;
    static volatile java.util.concurrent.CountDownLatch visibilityEntered,visibilityRelease;
    static volatile String license="CC0-1.0-synthetic";
    static final Map<UUID,Boolean> visibility=new HashMap<>();
    static HttpServer stub;
    static UUID user=UUID.randomUUID(), category=UUID.randomUUID();
    @DynamicPropertySource static void dependencies(DynamicPropertyRegistry registry)throws Exception {
        stub=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        stub.createContext("/internal/v1/places/validate",exchange->{
            JsonNode body=read(new String(exchange.getRequestBody().readAllBytes()));var items=new ArrayList<>();
            for(var id:body.path("ids")){UUID key=UUID.fromString(id.asText());items.add(Map.of("place_id",key,"public",visibility.getOrDefault(key,true),"version",1));}
            if(visibilityEntered!=null){visibilityEntered.countDown();try{visibilityRelease.await(2,java.util.concurrent.TimeUnit.SECONDS);}catch(InterruptedException ex){Thread.currentThread().interrupt();}}
            byte[] bytes=json(Map.of("items",items,"missing_ids",List.of())).getBytes();exchange.sendResponseHeaders(200,bytes.length);if(visibilityDelay>0)try{Thread.sleep(visibilityDelay);}catch(InterruptedException ex){Thread.currentThread().interrupt();}exchange.getResponseBody().write(bytes);exchange.close();
        });
        stub.createContext("/internal/v1/sources/policies/batch",exchange->{
            if(policyDelay>0)try{Thread.sleep(policyDelay);}catch(InterruptedException e){Thread.currentThread().interrupt();}
            byte[] bytes=json(Map.of("items",List.of(Map.of("source_id",source,"source_version",1,"license_version",license,"allow_storage",true,"allow_training",allowed,"status",allowed?"PERMITTED":"REVOKED")),"missing_ids",List.of())).getBytes();
            try{exchange.sendResponseHeaders(200,bytes.length);exchange.getResponseBody().write(bytes);}finally{exchange.close();}
        });
        stub.setExecutor(java.util.concurrent.Executors.newCachedThreadPool(r->{Thread t=new Thread(r);t.setDaemon(true);return t;}));
        stub.start();registry.add("intelligence.catalog-url",()->"http://127.0.0.1:"+stub.getAddress().getPort());registry.add("intelligence.ingestion-url",()->"http://127.0.0.1:"+stub.getAddress().getPort());
        var root=java.nio.file.Files.createTempDirectory("intelligence-test-artifacts-");registry.add("intelligence.artifact-root",root::toString);
    }
    @AfterAll static void stop(){if(stub!=null)stub.stop(0);}
    @BeforeEach void clean(){for(String table:List.of("inbox_events","outbox_events","recommendation_requests","model_deployments","model_versions","training_jobs","dataset_users","dataset_sources","dataset_versions","source_policies","place_features","user_feature_profiles","user_tombstones","interactions","interaction_rate_limits","projection_versions"))db.update("delete from intelligence."+table);visibility.clear();allowed=true;policyDelay=0;visibilityDelay=0;visibilityEntered=null;visibilityRelease=null;license="CC0-1.0-synthetic";}
    static JsonNode event(String type,JsonNode payload,long version){return read(json(Map.of("event_id",UUID.randomUUID(),"event_type",type,"schema_version",1,"producer",type.substring(0,type.indexOf('.')),"aggregate_version",version,"occurred_at",Instant.now().toString(),"payload",payload)));}
    void consent(boolean enabled,long version){projections.consume(event("identity.preferences.changed.v1",read(json(Map.of("user_id",user,"preferences",Map.of("category_ids",List.of(category)),"personalization_enabled",enabled,"consent_version",version))),version));}
    UUID place(Object price,String status,int ratings,double sum){UUID id=UUID.randomUUID();var f=new LinkedHashMap<String,Object>();f.put("category_ids",List.of(category));f.put("currency","VND");f.put("price",price);projections.consume(event("catalog.place.upserted.v1",read(json(Map.of("place_id",id,"status",status,"features",f))),1));if(ratings>0)projections.consume(event("community.rating-summary.changed.v1",read(json(Map.of("place_id",id,"count",ratings,"sum",sum))),1));return id;}
    JsonNode criteria(){return read("{\"topN\":10,\"currency\":\"VND\",\"budget\":100,\"category_ids\":[\""+category+"\"]}");}
    @Test void historyClearRejectsUnseenDelayedAndSnapshotEventsButAllowsNewEvents(){
        consent(true,1);
        JsonNode payload=read(json(Map.of("user_id",user,"place_id",UUID.randomUUID(),"trip_id",UUID.randomUUID(),"item_id",UUID.randomUUID())));
        JsonNode delayed=event("trip.item.added.v1",payload,1);
        JsonNode historical=event("trip.item.added.v1",payload,2);
        basic.deleteHistory(user);
        assertThat(projections.consume(delayed)).isTrue();
        projections.rebuild(UUID.randomUUID(),"interaction",read(json(Map.of("items",List.of(historical),"as_of",Instant.now().toString(),"watermark",2))));
        assertThat(db.queryForObject("select count(*) from intelligence.interactions where user_id=?",Long.class,user)).isZero();
        JsonNode fresh=event("trip.item.added.v1",payload,3);
        assertThat(projections.consume(fresh)).isTrue();
        assertThat(projections.consume(fresh)).isFalse();
        assertThat(db.queryForObject("select count(*) from intelligence.interactions where user_id=?",Long.class,user)).isEqualTo(1);
    }
    @Test void hiddenPagesAndSlowResponseBodyHaveOneBoundedBudget(){
        for(int i=0;i<110;i++){UUID id=place("10","PUBLISHED",0,0);visibility.put(id,false);}
        UUID visible=place("10","PUBLISHED",0,0);
        assertThat(read(json(basic.recommend(null,criteria()))).path("items").size()).isEqualTo(1);
        visibilityDelay=5000;long start=System.nanoTime();
        assertThatThrownBy(()->basic.recommend(null,criteria())).hasMessageContaining("DEPENDENCY_UNAVAILABLE");
        assertThat(java.time.Duration.ofNanos(System.nanoTime()-start)).isLessThan(java.time.Duration.ofSeconds(4));
    }
    @Test void internalRoutesRequireWorkloadAndAcceptNonUuidSubject()throws Exception {
        var userToken=jwt().jwt(j->j.subject(user.toString()).claim("sid",UUID.randomUUID().toString())).authorities(new SimpleGrantedAuthority("SCOPE_intelligence:internal"));
        http.perform(post("/internal/v1/events").with(userToken).contentType("application/json").content("{}")).andExpect(status().isForbidden());
        var workload=jwt().jwt(j->j.subject("catalog-worker").claim("client_id","catalog-worker")).authorities(new SimpleGrantedAuthority("SCOPE_intelligence:internal"));
        http.perform(post("/internal/v1/events").with(workload).contentType("application/json").content("{}")).andExpect(status().isBadRequest());
    }
    @Test void maximumFrozenLicenseCodeAndIdempotencyBounds(){
        license="L".repeat(1024);UUID dataset=datasetFixture();
        var result=models.enqueue(user,read(json(Map.of("dataset_id",dataset,"seed",7,"code_revision","c".repeat(1024)))));
        assertThat(result.get("code_revision")).isEqualTo("c".repeat(1024));
        assertThat(db.queryForObject("select length(license_version) from intelligence.dataset_sources where dataset_version_id=?",Integer.class,dataset)).isEqualTo(1024);
        assertThatThrownBy(()->mutations.execute("dataset",user,"k".repeat(129),null,null,datasetRequest(),202,null,()->models.build(user,datasetRequest()))).hasMessageContaining("IDEMPOTENCY");
    }
    @Test void sourceRevocationSerializesUntilFinalCatalogValidationCompletes()throws Exception {
        UUID dataset=datasetFixture(),model=trained(dataset);models.validate(user,model,"fixture");models.deploy(user,model,"fixture",false);
        visibilityEntered=new java.util.concurrent.CountDownLatch(1);visibilityRelease=new java.util.concurrent.CountDownLatch(1);
        var pool=java.util.concurrent.Executors.newFixedThreadPool(2);
        try{
            var response=pool.submit(()->models.recommend(null,criteria()));assertThat(visibilityEntered.await(2,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            var revoke=pool.submit(()->projections.consume(event("ingestion.source-policy.changed.v1",read(json(Map.of("source_id",source,"license_version",license,"allow_training",false,"status","REVOKED"))),2)));
            Thread.sleep(100);assertThat(revoke.isDone()).isFalse();visibilityRelease.countDown();assertThat(response.get(3,java.util.concurrent.TimeUnit.SECONDS).get("version")).isEqualTo("linear-sgd-v1");revoke.get(3,java.util.concurrent.TimeUnit.SECONDS);
            assertThat(db.queryForObject("select status from intelligence.model_versions where model_version_id=?",String.class,model)).isEqualTo("REVOKED");
        }finally{visibilityRelease.countDown();pool.shutdownNow();}
    }
    @Test void hardFiltersMissingUnknownFinalVisibilityStableSmoothing(){
        UUID a=place("30","PUBLISHED",100,450),b=place("30","PUBLISHED",1,5);
        place("1000","PUBLISHED",100,500);place(null,"PUBLISHED",1,5);place("10","HIDDEN",100,500);
        UUID hidden=place("1","PUBLISHED",100,500);visibility.put(hidden,false);
        var first=basic.recommend(null,criteria());var second=basic.recommend(null,criteria());
        assertThat(read(json(first)).path("items").size()).isEqualTo(2);
        assertThat(read(json(first)).path("items").get(0).path("place_id").asText()).isEqualTo(a.toString());
        assertThat(read(json(first)).path("items")).isEqualTo(read(json(second)).path("items"));
        assertThatThrownBy(()->basic.recommend(null,read("{\"topN\":1,\"currency\":\"USD\"}"))).hasMessageContaining("UNSUPPORTED_CURRENCY");
    }
    @Test void clientDedupConsentRevokeTombstoneAndServerAttribution(){
        consent(true,1);UUID event=UUID.randomUUID(),place=UUID.randomUUID();
        JsonNode input=read(json(Map.of("analytics_consent",true,"consent_version",1,"items",List.of(Map.of("event_id",event,"session_id",UUID.randomUUID(),"type","PLACE_VIEW","place_id",place,"query","private email deliberately redacted","occurred_at",Instant.now().toString())))));
        basic.interactions(user,input);basic.interactions(user,input);assertThat(db.queryForObject("select count(*) from intelligence.interactions",Integer.class)).isEqualTo(1);
        assertThat(basic.history(user,20,null).toString()).doesNotContain("private email");
        projections.consume(event("community.review.changed.v1",read(json(Map.of("user_id",user,"place_id",place,"change_kind","MODERATED"))),1));assertThat(db.queryForObject("select count(*) from intelligence.interactions",Integer.class)).isEqualTo(1);
        consent(false,2);assertThat(db.queryForObject("select count(*) from intelligence.interactions",Integer.class)).isZero();consent(true,1);assertThat(projections.profile(user)).isEmpty();
        projections.consume(event("identity.user.deletion-requested.v1",read(json(Map.of("user_id",user,"deletion_request_id",UUID.randomUUID(),"policy_version",1))),3));consent(true,4);assertThat(projections.profile(user)).isEmpty();
        assertThat(db.queryForObject("select count(*) from intelligence.outbox_events where event_type='domain.user-data-deleted.v1'",Integer.class)).isEqualTo(1);
    }
    @Test void snapshotCannotOverwriteNewerRatingOrRevokedConsentAndTripAttributionDedups(){
        UUID id=place("10","PUBLISHED",4,16);consent(true,1);
        UUID recommendation=UUID.randomUUID(),item=UUID.randomUUID(),trip=UUID.randomUUID();
        var added=event("trip.item.added.v1",read(json(Map.of("user_id",user,"place_id",id,"item_id",item,"trip_id",trip,"recommendation_request_id",recommendation))),1);
        projections.consume(added);projections.consume(added);
        assertThat(db.queryForObject("select count(*) from intelligence.interactions where event_type='TRIP_ITEM_ADDED'",Integer.class)).isEqualTo(1);
        assertThat(read(db.queryForObject("select context from intelligence.interactions where event_type='TRIP_ITEM_ADDED'",String.class)).path("recommendation_request_id").asText()).isEqualTo(recommendation.toString());
        projections.consume(event("community.rating-summary.changed.v1",read(json(Map.of("place_id",id,"count",8,"sum",40))),3));
        projections.rebuild(user,"rating",read(json(Map.of("items",List.of(Map.of("place_id",id,"version",2,"count",1,"sum",1)),"as_of",Instant.now().toString(),"watermark",2))));
        assertThat(read(db.queryForObject("select features from intelligence.place_features where place_id=?",String.class,id)).path("rating_count").asInt()).isEqualTo(8);
        consent(false,3);
        projections.rebuild(user,"preferences",read(json(Map.of("items",List.of(Map.of("user_id",user,"version",2,"consent_version",2,"personalization_enabled",true)),"as_of",Instant.now().toString(),"watermark",2))));
        assertThat(projections.profile(user)).isEmpty();
        assertThat(db.queryForObject("select count(*) from intelligence.interactions",Integer.class)).isZero();
    }
    @Test void oldTripSnapshotDoesNotResurrectPurgedHistoryAfterConsentReenabled(){
        consent(true,1);UUID id=UUID.randomUUID();
        var delayed=(com.fasterxml.jackson.databind.node.ObjectNode)event("trip.item.added.v1",read(json(Map.of("user_id",user,"place_id",id,"item_id",UUID.randomUUID(),"trip_id",UUID.randomUUID()))),1);
        delayed.put("occurred_at",Instant.now().minusSeconds(60).toString());
        consent(false,2);consent(true,3);
        projections.rebuild(user,"interaction",read(json(Map.of("items",List.of(delayed),"as_of",Instant.now().toString(),"watermark",1))));
        assertThat(db.queryForObject("select count(*) from intelligence.interactions",Integer.class)).isZero();
    }
    @Test void versionsIndependentInboxAndUnsupportedSchema(){
        UUID id=place("10","PUBLISHED",4,16);var rating=event("community.rating-summary.changed.v1",read(json(Map.of("place_id",id,"count",3,"sum",15))),2);assertThat(projections.consume(rating)).isTrue();assertThat(projections.consume(rating)).isFalse();
        projections.consume(event("catalog.place.upserted.v1",read(json(Map.of("place_id",id,"status","PUBLISHED","features",Map.of("price","20","currency","VND")))),2));
        assertThat(read(db.queryForObject("select features from intelligence.place_features where place_id=?",String.class,id)).path("rating_count").asInt()).isEqualTo(3);
        projections.consume(event("catalog.place.visibility-changed.v1",read(json(Map.of("place_id",id,"status","HIDDEN"))),3));
        projections.consume(event("catalog.place.upserted.v1",read(json(Map.of("place_id",id,"status","PUBLISHED","features",Map.of()))),2));assertThat(db.queryForObject("select status from intelligence.place_features where place_id=?",String.class,id)).isEqualTo("HIDDEN");
    }
    @Test void ratingBeforeCatalogRebuildPreservesRatingAndBlockedUserCannotReenable(){
        UUID id=UUID.randomUUID();projections.consume(event("community.rating-summary.changed.v1",read(json(Map.of("place_id",id,"count",10,"sum",40))),1));
        var payload=read(json(Map.of("place_id",id,"status","PUBLISHED","version",1,"price",10,"currency","VND","category_ids",List.of(category))));projections.consume(event("catalog.place.upserted.v1",payload,1));
        assertThat(db.queryForObject("select status from intelligence.place_features where place_id=?",String.class,id)).isEqualTo("PUBLISHED");
        assertThat(db.queryForObject("select embedding is not null from intelligence.place_features where place_id=?",Boolean.class,id)).isTrue();
        db.update("update intelligence.place_features set features='{}' where place_id=?",id);
        projections.rebuild(user,read(json(Map.of("items",List.of(payload),"as_of",Instant.now().toString(),"watermark",1))));
        assertThat(read(db.queryForObject("select features from intelligence.place_features where place_id=?",String.class,id)).path("price").asInt()).isEqualTo(10);
        consent(true,1);projections.consume(event("identity.user.status-changed.v1",read(json(Map.of("user_id",user,"status","BLOCKED","version",2))),2));consent(true,3);assertThat(projections.profile(user)).isEmpty();
    }
    @Test void rateRetentionSignedCursorAndInvalidClientEvent(){
        consent(true,1);var items=new ArrayList<Object>();for(int i=0;i<3;i++){var item=new LinkedHashMap<String,Object>();item.put("event_id",UUID.randomUUID());item.put("session_id",UUID.randomUUID());item.put("type","SEARCH");item.put("place_id",null);item.put("query",null);item.put("occurred_at",Instant.now().toString());items.add(item);}
        JsonNode request=read(json(Map.of("items",items,"analytics_consent",true,"consent_version",1)));basic.interactions(user,request);
        String cursor=(String)basic.history(user,1,null).get("next_cursor");assertThat(cursor).isNotNull();assertThat(read(json(basic.history(user,1,cursor))).path("items").size()).isEqualTo(1);assertThatThrownBy(()->basic.history(UUID.randomUUID(),1,cursor)).hasMessageContaining("CURSOR_QUERY_MISMATCH");
        db.update("update intelligence.interaction_rate_limits set count=300 where actor_key=?",user.toString());assertThatThrownBy(()->basic.interactions(user,request)).hasMessageContaining("RATE_LIMITED");
        db.update("update intelligence.interactions set occurred_at=now()-interval '91 days' where user_id=?",user);assertThat(basic.retention()).isEqualTo(3);
    }
    @Test void deletingHistoryKeepsConsentPreferencesAndAcceptsNewInteraction(){
        consent(true,1);var before=projections.profile(user).orElseThrow();
        JsonNode input=read(json(Map.of("analytics_consent",true,"consent_version",1,"items",List.of(Map.of("event_id",UUID.randomUUID(),"session_id",UUID.randomUUID(),"type","PLACE_VIEW","place_id",UUID.randomUUID(),"occurred_at",Instant.now().toString())))));
        basic.interactions(user,input);basic.deleteHistory(user);
        assertThat(db.queryForObject("select count(*) from intelligence.interactions where user_id=?",Integer.class,user)).isZero();
        assertThat(projections.profile(user)).contains(before);
        basic.interactions(user,input);assertThat(db.queryForObject("select count(*) from intelligence.interactions where user_id=?",Integer.class,user)).isEqualTo(1);
    }
    @Test void httpGuestContractAndScopeOwnership()throws Exception {
        place("5","PUBLISHED",0,0);
        http.perform(post("/api/v1/recommendations").contentType("application/json").content(json(criteria()))).andExpect(status().isOk()).andExpect(jsonPath("$.request_id").exists()).andExpect(jsonPath("$.version").value("basic-v1")).andExpect(jsonPath("$.data_as_of").exists()).andExpect(jsonPath("$.fallback").value(false));
        http.perform(get("/api/v1/me/interactions")).andExpect(status().isUnauthorized());
        http.perform(get("/api/v1/me/interactions").with(jwt().jwt(j->j.subject(user.toString())))).andExpect(status().isForbidden());
        http.perform(get("/api/v1/me/interactions").with(jwt().jwt(j->j.subject(user.toString())).authorities(new SimpleGrantedAuthority("SCOPE_intelligence:read")))).andExpect(status().isOk()).andExpect(jsonPath("$.items").isEmpty());
    }
    JsonNode datasetRequest(){return read(json(Map.of("source_ids",List.of(source),"feature_schema_version",1,"criteria",Map.of("start",Instant.now().minusSeconds(3600).toString(),"end",Instant.now().plusSeconds(1).toString()))));}
    UUID datasetFixture(){
        for(int i=0;i<30;i++){
            UUID id=new UUID(0,i+1);int count=10+i;
            projections.consume(event("catalog.place.upserted.v1",read(json(Map.of("place_id",id,"status","PUBLISHED","features",Map.of("source_id",source,"category_ids",List.of(category),"currency","VND","price","10","popularity",i*3)))),1));
            projections.consume(event("community.rating-summary.changed.v1",read(json(Map.of("place_id",id,"count",count,"sum",count*(3.0+(i%10)*.2)))),1));
        }
        return (UUID)models.build(user,datasetRequest()).get("dataset_id");
    }
    UUID trained(UUID dataset){var job=models.enqueue(user,read(json(Map.of("dataset_id",dataset,"seed",7,"code_revision","fixture-linear-v1"))));UUID id=(UUID)job.get("job_id");assertThat(models.claim()).contains(id);UUID model=models.train(id);assertThat(models.job(id).get("status")).isEqualTo("SUCCEEDED");return model;}
    @Test void immutableDatasetTrainingReproducibilityValidationActivationRollback(){
        UUID dataset=datasetFixture();UUID first=trained(dataset),second=trained(dataset);
        assertThat(db.queryForObject("select checksum from intelligence.model_versions where model_version_id=?",String.class,first)).isEqualTo(db.queryForObject("select checksum from intelligence.model_versions where model_version_id=?",String.class,second));
        models.validate(user,first,"fixture gate");models.validate(user,second,"fixture gate");models.deploy(user,first,"fixture only",false);models.deploy(user,second,"fixture only",false);models.deploy(user,first,"rollback fixture",true);
        assertThat(db.queryForObject("select count(*) from intelligence.model_deployments where deactivated_at is null",Integer.class)).isEqualTo(1);
        assertThat(models.recommend(null,criteria()).get("version")).isEqualTo("linear-sgd-v1");
        assertThat(db.queryForObject("select count(*) from intelligence.outbox_events where event_type='intelligence.model.deployed.v1'",Integer.class)).isEqualTo(3);
    }
    @Test void idempotencySeparatesModelResourcesAndKeepsSameResourceReplay(){
        UUID dataset=datasetFixture(),first=trained(dataset),second=trained(dataset);String key=UUID.randomUUID().toString();
        var body=Map.of("reason","fixture review");
        var result=mutations.execute("model-validate",user,key,"model:"+first,"\"1\"",body,202,()->((Number)models.model(first).get("version")).longValue(),()->models.validate(user,first,"fixture review"));
        assertThat(read(json(mutations.execute("model-validate",user,key,"model:"+first,"\"1\"",body,202,()->((Number)models.model(first).get("version")).longValue(),()->models.validate(user,first,"fixture review"))))).isEqualTo(read(json(result)));
        assertThatThrownBy(()->mutations.execute("model-validate",user,key,"model:"+second,"\"1\"",body,202,()->((Number)models.model(second).get("version")).longValue(),()->models.validate(user,second,"fixture review"))).hasMessageContaining("IDEMPOTENCY");
        assertThat(models.model(second).get("status")).isEqualTo("TRAINED");
    }
    @Test void policyForbiddenChecksumCancelAndRevocationNeverReenabledByOldEvent(){
        UUID dataset=datasetFixture();UUID model=trained(dataset);models.validate(user,model,"fixture");models.deploy(user,model,"fixture",false);
        var queued=models.enqueue(user,read(json(Map.of("dataset_id",dataset,"seed",8,"code_revision","fixture"))));assertThat(models.cancel(user,(UUID)queued.get("job_id")).get("status")).isEqualTo("CANCELLED");
        String checksum=db.queryForObject("select checksum from intelligence.dataset_versions where dataset_version_id=?",String.class,dataset);
        db.update("update intelligence.dataset_versions set checksum=? where dataset_version_id=?","0".repeat(64),dataset);
        assertThatThrownBy(()->models.enqueue(user,read(json(Map.of("dataset_id",dataset,"seed",7,"code_revision","fixture"))))).hasMessageContaining("CHECKSUM_MISMATCH");db.update("update intelligence.dataset_versions set checksum=? where dataset_version_id=?",checksum,dataset);
        allowed=false;assertThatThrownBy(()->models.build(user,datasetRequest())).hasMessageContaining("SOURCE_TRAINING_FORBIDDEN");
        projections.consume(event("ingestion.source-policy.changed.v1",read(json(Map.of("source_id",source,"license_version","CC0-1.0-synthetic","allow_training",false,"status","REVOKED"))),2));
        projections.consume(event("ingestion.source-policy.changed.v1",read(json(Map.of("source_id",source,"license_version","CC0-1.0-synthetic","allow_training",true,"status","PERMITTED"))),1));
        assertThat(models.dataset(dataset).get("status")).isEqualTo("REVOKED");assertThat(models.model(model).get("status")).isEqualTo("REVOKED");assertThatThrownBy(()->models.deploy(user,model,"rollback",true)).hasMessageContaining("MODEL_REVOKED");
    }
    @Test void blockedAndDeletedAdminCannotMutateOrReplay(){
        UUID dataset=datasetFixture(),model=trained(dataset);
        var enqueue=read(json(Map.of("dataset_id",dataset,"seed",7,"code_revision","fixture")));
        var queued=models.enqueue(user,enqueue);UUID job=(UUID)queued.get("job_id");
        String key=UUID.randomUUID().toString();mutations.execute("fixture",user,key,null,null,Map.of(),202,null,()->Map.of("ok",true));
        projections.consume(event("identity.user.status-changed.v1",read(json(Map.of("user_id",user,"status","DISABLED","version",2))),2));
        assertThatThrownBy(()->models.build(user,datasetRequest())).hasMessageContaining("403");
        assertThatThrownBy(()->models.enqueue(user,enqueue)).hasMessageContaining("403");
        assertThatThrownBy(()->models.cancel(user,job)).hasMessageContaining("403");
        assertThatThrownBy(()->models.validate(user,model,"fixture")).hasMessageContaining("403");
        assertThatThrownBy(()->models.deploy(user,model,"fixture",false)).hasMessageContaining("403");
        assertThatThrownBy(()->mutations.execute("fixture",user,key,null,null,Map.of(),202,null,()->Map.of("unexpected",true))).hasMessageContaining("403");
        assertThat(models.job(job).get("status")).isEqualTo("QUEUED");
        projections.consume(event("identity.user.deletion-requested.v1",read(json(Map.of("user_id",user,"deletion_request_id",UUID.randomUUID(),"policy_version",1))),3));
        assertThatThrownBy(()->models.enqueue(user,enqueue)).hasMessageContaining("403");
    }
    @Test void deletionAnonymizesAdministrativeAndTechnicalIdentifiers(){
        UUID dataset=datasetFixture(),model=trained(dataset);models.validate(user,model,"fixture");models.deploy(user,model,"fixture",false);
        consent(true,1);basic.interactions(user,read(json(Map.of("analytics_consent",true,"consent_version",1,"items",List.of(Map.of("event_id",UUID.randomUUID(),"session_id",UUID.randomUUID(),"type","PLACE_VIEW","place_id",new UUID(0,1),"occurred_at",Instant.now().toString()))))));
        mutations.execute("fixture",user,"privacy-key",null,null,Map.of(),202,null,()->Map.of("ok",true));
        db.update("insert into intelligence.dataset_users(dataset_version_id,user_id,consent_version) values(?,?,1)",dataset,user);
        projections.consume(event("identity.user.deletion-requested.v1",read(json(Map.of("user_id",user,"deletion_request_id",UUID.randomUUID(),"policy_version",1))),2));
        for(String table:List.of("interaction_rate_limits","idempotency_records"))assertThat(db.queryForObject("select count(*) from intelligence."+table+" where actor_key=?",Integer.class,user.toString())).isZero();
        assertThat(db.queryForObject("select count(*) from intelligence.audit_logs where actor_id=? or entity_id=?",Integer.class,user,user.toString())).isZero();
        assertThat(db.queryForObject("select count(*) from intelligence.dataset_versions where created_by=?",Integer.class,user)).isZero();
        assertThat(db.queryForObject("select count(*) from intelligence.model_deployments where activated_by=?",Integer.class,user)).isZero();
        assertThat(db.queryForObject("select count(*) from intelligence.dataset_users where user_id=?",Integer.class,user)).isZero();
        assertThat(models.dataset(dataset).get("status")).isEqualTo("REVOKED");
        assertThat(models.model(model).get("status")).isEqualTo("REVOKED");
        assertThat(projections.tombstoned(user)).isTrue();
    }
    @Test void deletionFenceSerializesConcurrentAdminMutation()throws Exception{
        UUID dataset=datasetFixture();var held=new java.util.concurrent.CountDownLatch(1);var release=new java.util.concurrent.CountDownLatch(1);var started=new java.util.concurrent.CountDownLatch(1);
        var pool=java.util.concurrent.Executors.newFixedThreadPool(2);
        try{
            var deleting=pool.submit(()->transactions.executeWithoutResult(tx->{projections.consume(event("identity.user.deletion-requested.v1",read(json(Map.of("user_id",user,"deletion_request_id",UUID.randomUUID(),"policy_version",1))),2));held.countDown();try{assertThat(release.await(5,java.util.concurrent.TimeUnit.SECONDS)).isTrue();}catch(InterruptedException ex){throw new IllegalStateException(ex);}}));
            assertThat(held.await(5,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            var mutating=pool.submit(()->{started.countDown();return models.enqueue(user,read(json(Map.of("dataset_id",dataset,"seed",7,"code_revision","fixture"))));});
            assertThat(started.await(5,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(()->mutating.get(200,java.util.concurrent.TimeUnit.MILLISECONDS)).isInstanceOf(java.util.concurrent.TimeoutException.class);
            release.countDown();deleting.get(5,java.util.concurrent.TimeUnit.SECONDS);
            assertThatThrownBy(()->mutating.get(5,java.util.concurrent.TimeUnit.SECONDS)).hasCauseInstanceOf(org.springframework.web.server.ResponseStatusException.class).hasMessageContaining("403");
            assertThat(db.queryForObject("select count(*) from intelligence.training_jobs",Integer.class)).isZero();
        }finally{release.countDown();pool.shutdownNow();}
    }
    @Test void deletionWaitsForUncommittedAdminCreationAndPurgesItsIdentifiers()throws Exception{
        datasetFixture();var held=new java.util.concurrent.CountDownLatch(1);var release=new java.util.concurrent.CountDownLatch(1);var started=new java.util.concurrent.CountDownLatch(1);
        var pool=java.util.concurrent.Executors.newFixedThreadPool(2);
        try{
            var creating=pool.submit(()->transactions.executeWithoutResult(tx->{mutations.execute("dataset",user,"held-create",null,null,datasetRequest(),202,null,()->models.build(user,datasetRequest()));held.countDown();try{assertThat(release.await(5,java.util.concurrent.TimeUnit.SECONDS)).isTrue();}catch(InterruptedException ex){throw new IllegalStateException(ex);}}));
            assertThat(held.await(5,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            var deleting=pool.submit(()->{started.countDown();return projections.consume(event("identity.user.deletion-requested.v1",read(json(Map.of("user_id",user,"deletion_request_id",UUID.randomUUID(),"policy_version",1))),2));});
            assertThat(started.await(5,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(()->deleting.get(200,java.util.concurrent.TimeUnit.MILLISECONDS)).isInstanceOf(java.util.concurrent.TimeoutException.class);
            release.countDown();creating.get(5,java.util.concurrent.TimeUnit.SECONDS);deleting.get(5,java.util.concurrent.TimeUnit.SECONDS);
            assertThat(db.queryForObject("select count(*) from intelligence.dataset_versions where created_by=?",Integer.class,user)).isZero();
            assertThat(db.queryForObject("select count(*) from intelligence.idempotency_records where actor_key=?",Integer.class,user.toString())).isZero();
            assertThat(db.queryForObject("select count(*) from intelligence.audit_logs where actor_id=?",Integer.class,user)).isZero();
        }finally{release.countDown();pool.shutdownNow();}
    }
    @Test void activeModelChecksumAndMalformedSchemaFallBackButCatalogFailureClosesResponse(){
        UUID dataset=datasetFixture(),model=trained(dataset);models.validate(user,model,"fixture");models.deploy(user,model,"fixture",false);
        db.update("update intelligence.model_versions set checksum=? where model_version_id=?","0".repeat(64),model);
        assertModelValidationFallback();
        for(String content:List.of("{\"feature_schema_version\":2,\"weights\":[1,0,0]}","{\"feature_schema_version\":1,\"weights\":[\"invalid\",0,0]}","{\"feature_schema_version\":1,\"weights\":{\"a\":1,\"b\":0,\"c\":0}}")){
            db.update("update intelligence.model_versions set artifact_object_key=?,checksum=? where model_version_id=?",artifacts.write(content),hash(content),model);
            assertModelValidationFallback();
        }
        // A failed final visibility check cannot be converted into a successful fallback.
        visibilityDelay=5000;int before=db.queryForObject("select count(*) from intelligence.recommendation_requests",Integer.class);
        assertThatThrownBy(()->models.recommend(null,criteria())).hasMessageContaining("503");
        assertThat(db.queryForObject("select count(*) from intelligence.recommendation_requests",Integer.class)).isEqualTo(before);
    }
    void assertModelValidationFallback(){
        var response=models.recommend(null,criteria());assertThat(response.get("fallback")).isEqualTo(true);assertThat(response.get("version")).isEqualTo("basic-v1");
        assertThat(read(json(response)).path("items")).isNotEmpty();
        assertThat(db.queryForObject("select fallback_reason from intelligence.recommendation_requests where request_id=?",String.class,response.get("request_id"))).isEqualTo("MODEL_VALIDATION_FAILED");
    }
    @Test void inferenceDeadlineFallsBackAndConcurrentDeploymentSingleActive()throws Exception {
        UUID dataset=datasetFixture(),first=trained(dataset),second=trained(dataset);models.validate(user,first,"fixture");models.validate(user,second,"fixture");
        var executor=java.util.concurrent.Executors.newFixedThreadPool(2);
        try{var a=executor.submit(()->models.deploy(user,first,"concurrent fixture A",false));var b=executor.submit(()->models.deploy(user,second,"concurrent fixture B",false));a.get();b.get();}finally{executor.shutdownNow();}
        assertThat(db.queryForObject("select count(*) from intelligence.model_deployments where deactivated_at is null",Integer.class)).isEqualTo(1);
        policyDelay=1500;long start=System.nanoTime();var response=models.recommend(null,criteria());assertThat(response.get("fallback")).isEqualTo(true);assertThat(response.get("version")).isEqualTo("basic-v1");assertThat((System.nanoTime()-start)/1_000_000).isLessThan(1400);
        assertThat(db.queryForObject("select fallback_reason from intelligence.recommendation_requests where request_id=?",String.class,response.get("request_id"))).isEqualTo("MODEL_TIMEOUT");policyDelay=0;
    }
    JsonNode provider(String pattern,String method,String uri,int status,JsonNode body,String key,String match)throws Exception{
        var request=org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request(org.springframework.http.HttpMethod.valueOf(method.toUpperCase()),uri)
                .with(jwt().jwt(j->j.subject(user.toString())).authorities(new SimpleGrantedAuthority("SCOPE_intelligence:admin"),new SimpleGrantedAuthority("SCOPE_intelligence:read"),new SimpleGrantedAuthority("SCOPE_intelligence:write"))).contentType("application/json");
        if(body!=null)request.content(json(body));if(key!=null)request.header("Idempotency-Key",key);if(match!=null)request.header("If-Match",match);
        var result=http.perform(request).andExpect(status().is(status)).andReturn();JsonNode output=read(result.getResponse().getContentAsString());
        JsonNode contract=JSON.readTree(java.nio.file.Files.readString(java.nio.file.Path.of("../../contracts/openapi/intelligence.yaml")));JsonNode schema=contract.path("paths").path(pattern).path(method).path("responses").path(Integer.toString(status)).path("content").path("application/json").path("schema");
        assertThat(com.networknt.schema.JsonSchemaFactory.getInstance(com.networknt.schema.SpecVersion.VersionFlag.V202012).getSchema(schema).validate(output)).as(pattern+" "+method).isEmpty();return output;
    }
    @Test void all14FrozenHttpOperationsProviderPreconditionsAndIdempotency()throws Exception{
        UUID fixture=datasetFixture();consent(true,1);
        provider("/api/v1/recommendations","post","/api/v1/recommendations",200,criteria(),null,null);
        var item=new LinkedHashMap<String,Object>();item.put("event_id",UUID.randomUUID());item.put("session_id",UUID.randomUUID());item.put("type","SEARCH");item.put("place_id",null);item.put("query",null);item.put("occurred_at",Instant.now().toString());
        provider("/api/v1/interactions/batch","post","/api/v1/interactions/batch",202,read(json(Map.of("items",List.of(item),"analytics_consent",true,"consent_version",1))),null,null);
        provider("/api/v1/me/interactions","get","/api/v1/me/interactions",200,null,null,null);
        provider("/api/v1/me/interactions","delete","/api/v1/me/interactions",202,null,"delete-key",null);
        JsonNode buildRequest=datasetRequest();var dataset=provider("/api/v1/admin/datasets","post","/api/v1/admin/datasets",202,buildRequest,"dataset-key",null);
        assertThat(provider("/api/v1/admin/datasets","post","/api/v1/admin/datasets",202,buildRequest,"dataset-key",null)).isEqualTo(dataset);
        provider("/api/v1/admin/datasets/{dataset_id}","get","/api/v1/admin/datasets/"+dataset.path("dataset_id").asText(),200,null,null,null);
        var job=provider("/api/v1/admin/training-jobs","post","/api/v1/admin/training-jobs",202,read(json(Map.of("dataset_id",dataset.path("dataset_id").asText(),"seed",9,"code_revision","provider-fixture"))),"job-key",null);
        UUID jobId=UUID.fromString(job.path("job_id").asText());assertThat(models.claim()).contains(jobId);UUID model=models.train(jobId);
        provider("/api/v1/admin/training-jobs/{job_id}","get","/api/v1/admin/training-jobs/"+jobId,200,null,null,null);
        UUID cancel=(UUID)models.enqueue(user,read(json(Map.of("dataset_id",fixture,"seed",8,"code_revision","provider-cancel")))).get("job_id");
        provider("/api/v1/admin/training-jobs/{job_id}/cancel","post","/api/v1/admin/training-jobs/"+cancel+"/cancel",202,null,null,"1");
        provider("/api/v1/admin/models","get","/api/v1/admin/models",200,null,null,null);
        provider("/api/v1/admin/models/{model_id}/metrics","get","/api/v1/admin/models/"+model+"/metrics",200,null,null,null);
        var reason=read("{\"reason\":\"fixture provider gate\"}");
        provider("/api/v1/admin/models/{model_id}/validate","post","/api/v1/admin/models/"+model+"/validate",202,reason,"validate-key","1");
        provider("/api/v1/admin/models/{model_id}/deploy","post","/api/v1/admin/models/"+model+"/deploy",202,reason,"deploy-key",models.model(model).get("version").toString());
        provider("/api/v1/admin/models/{model_id}/rollback","post","/api/v1/admin/models/"+model+"/rollback",202,reason,"rollback-key",models.model(model).get("version").toString());
        var admin=jwt().jwt(j->j.subject(user.toString())).authorities(new SimpleGrantedAuthority("SCOPE_intelligence:admin"));
        http.perform(post("/api/v1/admin/models/"+model+"/deploy").with(admin).header("Idempotency-Key","missing-match").contentType("application/json").content(json(reason))).andExpect(status().isPreconditionRequired());
        http.perform(post("/api/v1/admin/models/"+model+"/deploy").with(admin).header("Idempotency-Key","stale-match").header("If-Match","1").contentType("application/json").content(json(reason))).andExpect(status().isConflict());
        http.perform(post("/api/v1/admin/datasets").with(admin).header("Idempotency-Key","dataset-key").contentType("application/json").content(json(datasetRequest()))).andExpect(status().isConflict());
    }
}
