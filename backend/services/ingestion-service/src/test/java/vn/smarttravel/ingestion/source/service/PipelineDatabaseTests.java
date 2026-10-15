package vn.smarttravel.ingestion.source.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import java.net.InetSocketAddress;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static vn.smarttravel.ingestion.shared.web.ApiValues.*;

@org.springframework.test.context.ActiveProfiles("test")
@SpringBootTest(properties="logging.level.org.springframework=INFO")
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named="DOMAIN_DB_TESTS",matches="true")
class PipelineDatabaseTests {
    static final ObjectMapper JSON=new ObjectMapper();
    static final UUID ADMIN=UUID.fromString("00000000-0000-4000-8000-000000000001"),PLACE=UUID.fromString("10000000-0000-4000-8000-000000000001"),CATEGORY=UUID.fromString("20000000-0000-4000-8000-000000000001");
    static final HttpServer stub=start();
    static volatile boolean candidates,quota;
    static volatile List<?> records=List.of();
    static volatile int pages;
    @Autowired PipelineService service;
    @Autowired PipelineEvents events;
    @Autowired JdbcTemplate db;
    @Autowired MockMvc mvc;
    @Autowired org.springframework.transaction.PlatformTransactionManager transactions;
    static String uri(){return "http://127.0.0.1:"+stub.getAddress().getPort()+"/source";}
    static HttpServer start(){try{var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);server.createContext("/",exchange->{try{Object response;int status=200;if(exchange.getRequestURI().getPath().contains("candidates"))response=map("items",candidates?List.of(candidate()):List.of(),"missing_ids",List.of());else{status=quota?429:200;pages++;boolean first=exchange.getRequestURI().getRawQuery()==null;response=map("records",records,"next_cursor",pages<2?"page-2":null,"checkpoint","offset-2");}byte[]bytes=JSON.writeValueAsBytes(response);exchange.getResponseHeaders().set("Content-Type","application/json");exchange.sendResponseHeaders(status,bytes.length);exchange.getResponseBody().write(bytes);}finally{exchange.close();}});server.start();return server;}catch(Exception e){throw new ExceptionInInitializerError(e);}}
    static Map<String,Object> candidate(){return map("place_id",PLACE.toString(),"name","Synthetic licensed place","status","PUBLISHED","version",2,"latitude",10.76,"longitude",106.66,"category_ids",List.of(CATEGORY.toString()),"tag_ids",List.of(),"amenity_ids",List.of(),"geographic_unit_id",CATEGORY.toString(),"destination_ids",List.of(),"price",10000,"currency","VND","opening_hours",List.of(),"media_keys",List.of(),"source_version",2);}
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r){String url="http://127.0.0.1:"+stub.getAddress().getPort();r.add("ingestion.catalog.base-url",()->url);r.add("security.jwt.jwk-set-uri",()->url+"/jwks");r.add("security.jwt.issuer",()->"test");r.add("ingestion.transport.enabled",()->"false");r.add("ingestion.worker.enabled",()->"false");}
    private void clearAuditFixture(){var config=new org.springframework.jdbc.datasource.DriverManagerDataSource(System.getenv("DB_URL"),System.getenv("DB_MIGRATION_USER"),System.getenv("DB_MIGRATION_PASSWORD"));new org.springframework.jdbc.core.JdbcTemplate(config).update("DELETE FROM ingestion.audit_logs");}
    @BeforeEach void reset(){clearAuditFixture();quota=candidates=false;pages=2;records=List.of(raw("poi-1"));for(String table:List.of("match_candidates","import_items","source_place_links","raw_records","import_jobs","source_checkpoints","data_sources","outbox_events","inbox_events","idempotency_records","user_tombstones","user_status"))db.update("DELETE FROM ingestion."+table);}
    static Map<String,Object> raw(String external){return map("external_id",external,"name","  Synthetic licensed place  ","latitude",10.76,"longitude",106.66,"category_ids",List.of(CATEGORY.toString()),"price",10000,"currency","VND","opening_hours",List.of());}
    Map<String,Object> sourceBody(){return map("name","Licensed synthetic source","uri",uri(),"secret_reference","none","license_version","CC0-synthetic-v1","allow_storage",true,"allow_training",false);}
    UUID source(){return id(service.createSource(ADMIN,sourceBody()).get("source_id"));}
    UUID job(UUID source,String key){return id(service.createJob(ADMIN,source,key,"FULL").get("job_id"));}
    String matchJob(UUID job){return "\""+service.job(job).get("version")+"\"";}
    String matchSource(UUID source){return "\""+service.sources(source).get("version")+"\"";}
    Map<String,Object> item(UUID job){return db.queryForList("SELECT * FROM ingestion.import_items WHERE job_id=? ORDER BY import_item_id",job).getFirst();}
    Map<String,Object> ack(Map<String,Object>item){return map("event_id",UUID.randomUUID(),"event_type","catalog.place-import.applied.v1","schema_version",1,"aggregate_version",1,"payload",map("command_id",item.get("command_id"),"source_id",item.get("source_id"),"place_id",item.get("proposed_place_id"),"catalog_version",3));}
    @SuppressWarnings("unchecked") Map<String,Object> http(String method,String path,Object body,int expected,String match,String key)throws Exception{var request=MockMvcRequestBuilders.request(org.springframework.http.HttpMethod.valueOf(method),path).with(jwt().jwt(j->{if(path.startsWith("/internal/"))j.claim("client_id","fixture-catalog");j.subject(ADMIN.toString()).claim("scope",path.startsWith("/internal/")?"ingestion:policy:read ingestion:links:read":"ingestion:admin").claim("roles",List.of("ADMIN"));}));if(body!=null)request.contentType("application/json").content(JSON.writeValueAsBytes(body));if(match!=null)request.header("If-Match",match);if(key!=null)request.header("Idempotency-Key",key);var response=mvc.perform(request).andReturn().getResponse();assertThat(response.getStatus()).as(method+" "+path+" "+response.getContentAsString()).isEqualTo(expected);if(expected==204)return Map.of();var value=JSON.readValue(response.getContentAsString(),Map.class);var contract=JSON.readTree(Files.readString(Path.of("../../contracts/openapi/ingestion.yaml")));for(var it=contract.path("paths").fields();it.hasNext();){var entry=it.next();if(path.matches(entry.getKey().replaceAll("\\{[^}]+}","[^/]+"))){var schema=entry.getValue().path(method.toLowerCase()).path("responses").path(String.valueOf(expected)).path("content").path("application/json").path("schema");if(!schema.isMissingNode())vn.smarttravel.ingestion.shared.web.ContractRequestAdvice.validate(value,JSON.convertValue(schema,Map.class));}}return value;}
    @Test void allFrozenAdminAndInternalProviderOperationsUseRealRows()throws Exception{
        UUID source=id(http("POST","/api/v1/admin/data-sources",sourceBody(),201,null,null).get("source_id"));String p="/api/v1/admin/data-sources/"+source;
        http("GET","/api/v1/admin/data-sources",null,200,null,null);http("GET",p,null,200,null,null);http("PATCH",p,map("name","Updated source"),200,matchSource(source),null);http("PATCH",p+"/policy",map("allow_training",true),200,matchSource(source),null);http("GET","/internal/v1/sources/"+source+"/policy",null,200,null,null);http("POST","/internal/v1/sources/policies/batch",map("ids",List.of(source.toString(),UUID.randomUUID().toString())),200,null,null);
        candidates=true;UUID job=id(http("POST",p+"/import-jobs",map("mode","FULL"),202,null,"workflow").get("job_id"));service.process(job);String j="/api/v1/admin/import-jobs/"+job;http("GET",j,null,200,null,null);http("GET",j+"/items",null,200,null,null);http("GET",j+"/errors",null,200,null,null);http("GET",j+"/candidates",null,200,null,null);var item=item(job);UUID itemId=(UUID)item.get("import_item_id");http("POST","/api/v1/admin/import-items/"+itemId+"/decision",map("action","MATCH","place_id",PLACE.toString(),"reason","Ground truth fixture review"),200,"\""+item.get("version")+"\"",null);http("POST",j+"/retry",null,202,matchJob(job),null);events.consume(ack(item(job)));http("POST","/internal/v1/source-links",map("source_id",source.toString(),"external_ids",List.of("poi-1")),200,null,null);
        UUID cancelled=id(http("POST",p+"/import-jobs",map("mode","INCREMENTAL"),202,null,"cancel").get("job_id"));http("POST","/api/v1/admin/import-jobs/"+cancelled+"/cancel",null,202,matchJob(cancelled),null);http("DELETE",p,null,204,matchSource(source),null);
    }
    @Test void duplicateInputStableRetryAndDelayedAckNeverAdvanceCheckpoint(){UUID source=source(),job=job(source,"first");records=List.of(raw("poi-1"),raw("poi-1"));service.process(job);assertThat(db.queryForObject("SELECT count(*) FROM ingestion.raw_records",Long.class)).isEqualTo(1);assertThat(db.queryForObject("SELECT count(*) FROM ingestion.import_items",Long.class)).isEqualTo(1);assertThat(service.job(job).get("status")).isEqualTo("RUNNING");assertThat(db.queryForObject("SELECT count(*) FROM ingestion.source_checkpoints",Long.class)).isZero();var before=item(job);service.retry(ADMIN,job,matchJob(job));assertThat(item(job).get("command_id")).isEqualTo(before.get("command_id"));assertThat(item(job).get("proposed_place_id")).isEqualTo(before.get("proposed_place_id"));var result=ack(item(job));events.consume(result);events.consume(result);assertThat(service.job(job).get("status")).isEqualTo("SUCCEEDED");assertThat(db.queryForObject("SELECT count(*) FROM ingestion.source_place_links",Long.class)).isEqualTo(1);UUID second=job(source,"second");service.process(second);assertThat(db.queryForObject("SELECT count(*) FROM ingestion.raw_records",Long.class)).isEqualTo(1);assertThat(item(second).get("status")).isEqualTo("SKIPPED");assertThat(service.job(second).get("status")).isEqualTo("SUCCEEDED");}
    @Test void canonicalReorderedKeysDedupButChangedHashCreatesRevision(){UUID source=source(),job=job(source,"first");service.process(job);events.consume(ack(item(job)));var reordered=new TreeMap<String,Object>(raw("poi-1"));records=List.of(reordered);UUID second=job(source,"second");service.process(second);assertThat(db.queryForObject("SELECT count(*) FROM ingestion.raw_records",Long.class)).isEqualTo(1);reordered.put("price",11000);UUID third=job(source,"changed");service.process(third);assertThat(db.queryForObject("SELECT count(*) FROM ingestion.raw_records",Long.class)).isEqualTo(2);assertThat(item(third).get("operation")).isEqualTo("UPDATE");assertThat(item(third).get("expected_catalog_version")).isEqualTo(3L);}
    @Test void invalidRowsRemainQuarantinedAndPartialDoesNotAdvanceCheckpoint(){UUID source=source(),job=job(source,"invalid");var invalid=new LinkedHashMap<>(raw("poi-bad"));invalid.put("latitude",100);var malformed=new LinkedHashMap<>(raw("bad"));malformed.remove("external_id");records=List.of(raw("poi-1"),invalid,malformed);service.process(job);var good=db.queryForList("SELECT * FROM ingestion.import_items WHERE status='SENT'").getFirst();events.consume(ack(good));assertThat(service.job(job).get("status")).isEqualTo("PARTIAL");assertThat(db.queryForObject("SELECT count(*) FROM ingestion.import_items WHERE status='FAILED'",Long.class)).isEqualTo(2);assertThat(db.queryForObject("SELECT count(*) FROM ingestion.raw_records",Long.class)).isEqualTo(3);assertThat(db.queryForObject("SELECT count(*) FROM ingestion.source_checkpoints",Long.class)).isZero();}
    @Test void policiesSourceLocksQuotaAndCancellationPreventUnsafeProcessing(){UUID source=source(),job=job(source,"running");assertThatThrownBy(()->job(source,"concurrent")).hasMessageContaining("SOURCE_JOB_ACTIVE");assertThatThrownBy(()->service.createJob(ADMIN,source,"running","REPLAY")).hasMessageContaining("IDEMPOTENCY_CONFLICT");quota=true;assertThatThrownBy(()->service.process(job)).hasMessageContaining("SOURCE_QUOTA");assertThat(db.queryForObject("SELECT count(*) FROM ingestion.raw_records",Long.class)).isZero();service.patchSource(ADMIN,source,matchSource(source),map("allow_storage",false,"status","REVOKED"),true);assertThat(service.job(job).get("status")).isEqualTo("CANCELLED");assertThatThrownBy(()->job(source,"blocked")).hasMessageContaining("SOURCE_STORAGE_NOT_PERMITTED");service.process(job);assertThat(db.queryForObject("SELECT count(*) FROM ingestion.raw_records",Long.class)).isZero();}
    @Test void conflictsRequireReviewAndNeverUpdateLinkBeforeApplied(){UUID source=source(),job=job(source,"conflict");service.process(job);var item=item(job);var reject=map("event_id",UUID.randomUUID(),"event_type","catalog.place-import.rejected.v1","schema_version",1,"payload",map("command_id",item.get("command_id"),"source_id",source,"error_code","PROTECTED_FIELD_CONFLICT","reason","Fixture protected field conflict"));events.consume(reject);assertThat(item(job).get("status")).isEqualTo("NEEDS_REVIEW");assertThat(db.queryForObject("SELECT count(*) FROM ingestion.source_place_links",Long.class)).isZero();service.decide(ADMIN,(UUID)item.get("import_item_id"),"\""+item(job).get("version")+"\"",map("action","REJECT","place_id",null,"reason","Reject fixture conflict"));assertThat(service.job(job).get("status")).isEqualTo("SUCCEEDED");assertThat(db.queryForObject("SELECT count(*) FROM ingestion.source_place_links",Long.class)).isZero();}
    @Test void paginationReplayAndDeletionAnonymizationKeepProvenance(){pages=0;UUID source=source(),job=job(source,"paged");service.process(job);assertThat(service.job(job).get("status")).isEqualTo("RUNNING");service.process(job);events.consume(ack(item(job)));assertThat(service.job(job).get("checkpoint")).isEqualTo("offset-2");UUID replay=id(service.createJob(ADMIN,source,"replay","REPLAY").get("job_id"));service.process(replay);assertThat(service.job(replay).get("status")).isEqualTo("SUCCEEDED");var event=map("event_id",UUID.randomUUID(),"event_type","identity.user.deletion-requested.v1","schema_version",1,"aggregate_version",1,"payload",map("user_id",ADMIN,"deletion_request_id",UUID.randomUUID()));events.consume(event);events.consume(event);assertThat(db.queryForObject("SELECT count(*) FROM ingestion.import_jobs WHERE requested_by IS NOT NULL",Long.class)).isZero();assertThat(db.queryForObject("SELECT count(*) FROM ingestion.raw_records",Long.class)).isEqualTo(1);assertThat(db.queryForObject("SELECT count(*) FROM ingestion.outbox_events WHERE event_type='domain.user-data-deleted.v1'",Long.class)).isEqualTo(1);}
    @Test void matchingGroundTruthIsOnlyFixtureCalibration(){var near=candidate();assertThat(PipelineService.score(raw("a"),near)).isEqualTo(0.3);var exact=new LinkedHashMap<>(raw("a"));exact.put("name","Synthetic licensed place");assertThat(PipelineService.score(exact,near)).isEqualTo(1);var far=new LinkedHashMap<>(near);far.put("latitude",20);far.put("name","Other place");assertThat(PipelineService.score(exact,far)).isZero();}
    @Test void sourceCursorDetectsPolicyMutation(){UUID a=source(),b=source();var first=service.paginate(service.sources(null),1,null);String cursor=first.get("next_cursor").toString();assertThat(service.paginate(service.sources(null),1,cursor).get("items")).asList().hasSize(1);service.patchSource(ADMIN,a,matchSource(a),map("allow_training",true),true);assertThatThrownBy(()->service.paginate(service.sources(null),1,cursor)).hasMessageContaining("CURSOR_VERSION_CONFLICT");}
    @Test void humanScopeCannotBecomeWorkloadOrForgedAdmin()throws Exception{for(String path:List.of("/api/v1/admin/data-sources","/internal/v1/sources/"+UUID.randomUUID()+"/policy")){var response=mvc.perform(MockMvcRequestBuilders.get(path).with(jwt().jwt(j->j.subject(ADMIN.toString()).claim("roles",List.of("USER")).claim("sid",UUID.randomUUID().toString()).claim("scope","ingestion:admin ingestion:policy:read")))).andReturn().getResponse();assertThat(response.getStatus()).isEqualTo(403);}}
    @Test void credentialBearingSourceUriCannotPersistSecrets(){var body=sourceBody();body.put("uri","https://operator:secret@example.invalid/source");assertThatThrownBy(()->service.createSource(ADMIN,body)).hasMessageContaining("SOURCE_URI_INVALID");assertThat(db.queryForObject("SELECT count(*) FROM ingestion.data_sources",Long.class)).isZero();}
    @Test void frozenNamesLicenseAndLongUriPersistWithoutTruncation(){var input=sourceBody();input.put("name","x".repeat(1024));input.put("license_version","v".repeat(1024));input.put("uri",uri()+"?fixture="+"x".repeat(3000));var result=service.createSource(ADMIN,input);assertThat(result.get("name")).isEqualTo(input.get("name"));assertThat(result.get("license_version")).isEqualTo(input.get("license_version"));assertThat(result.get("uri")).isEqualTo(input.get("uri"));}
    @Test void frozenMaximumRecordNameAndSourceIdentifierReachAppliedLink(){
        String external="e".repeat(1024),name="n".repeat(1024);
        var input=raw(external);input.put("name",name);records=List.of(input);
        UUID source=source(),job=job(source,"maximum-source-fields");service.process(job);
        assertThat(item(job).get("status")).isEqualTo("SENT");
        assertThat(JSON.valueToTree(service.links(source,List.of(external))).path("missing_ids").get(0).asText()).isEqualTo(external);
        events.consume(ack(item(job)));
        assertThat(service.job(job).get("status")).isEqualTo("SUCCEEDED");
        assertThat(db.queryForObject("SELECT external_id FROM ingestion.source_place_links",String.class)).isEqualTo(external);
        assertThat(db.queryForObject("SELECT normalized_payload->>'name' FROM ingestion.import_items",String.class)).isEqualTo(name);
    }
    @Test void deletionWaitsForUncommittedJobAndAnonymizesItBeforeAcknowledging()throws Exception{
        UUID source=source();var created=new CountDownLatch(1);var release=new CountDownLatch(1);var deleting=new CountDownLatch(1);
        var executor=Executors.newFixedThreadPool(2);
        try{
            var create=executor.submit(()->new org.springframework.transaction.support.TransactionTemplate(transactions).execute(status->{
                service.createJob(ADMIN,source,"concurrent-deletion","FULL");created.countDown();
                try{if(!release.await(10,TimeUnit.SECONDS))throw new IllegalStateException("Test release timeout");}catch(InterruptedException error){throw new IllegalStateException(error);}
                return true;
            }));
            assertThat(created.await(10,TimeUnit.SECONDS)).isTrue();
            var delete=executor.submit(()->{deleting.countDown();events.consume(map("event_id",UUID.randomUUID(),"event_type","identity.user.deletion-requested.v1","schema_version",1,"aggregate_version",1,"payload",map("user_id",ADMIN,"deletion_request_id",UUID.randomUUID())));});
            assertThat(deleting.await(5,TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(()->delete.get(200,TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
            release.countDown();create.get(10,TimeUnit.SECONDS);delete.get(10,TimeUnit.SECONDS);
            assertThat(db.queryForObject("SELECT count(*) FROM ingestion.import_jobs WHERE requested_by=?",Long.class,ADMIN)).isZero();
            assertThat(db.queryForObject("SELECT count(*) FROM ingestion.audit_logs WHERE actor_id=?",Long.class,ADMIN)).isZero();
            assertThat(db.queryForObject("SELECT count(*) FROM ingestion.outbox_events WHERE event_type='domain.user-data-deleted.v1'",Long.class)).isEqualTo(1);
            assertThatThrownBy(()->service.createJob(ADMIN,source,"deleted-admin","FULL")).hasMessageContaining("USER_DELETED");
        }finally{release.countDown();executor.shutdownNow();}
    }
    @Test void suspendedOperatorCannotMutateAndStaleActivationCannotRestoreAccess(){
        UUID source=source();
        java.util.function.BiConsumer<String,Long> status=(value,version)->events.consume(map("event_id",UUID.randomUUID(),"event_type","identity.user.status-changed.v1","schema_version",1,"aggregate_version",version,"payload",map("user_id",ADMIN,"status",value,"version",version)));
        status.accept("DISABLED",2L);
        assertThatThrownBy(()->service.createJob(ADMIN,source,"suspended","FULL")).hasMessageContaining("USER_INACTIVE");
        assertThatThrownBy(()->service.patchSource(ADMIN,source,matchSource(source),map("allow_training",true),true)).hasMessageContaining("USER_INACTIVE");
        status.accept("ACTIVE",1L);
        assertThatThrownBy(()->service.createSource(ADMIN,sourceBody())).hasMessageContaining("USER_INACTIVE");
        status.accept("ACTIVE",3L);assertThat(service.createJob(ADMIN,source,"reactivated","FULL").get("status")).isEqualTo("QUEUED");
        assertThat(db.queryForObject("SELECT count(*) FROM ingestion.import_jobs",Long.class)).isEqualTo(1);
    }
    @Test void priceNormalizationAndLocalAddressRespectFrozenCommandSchema()throws Exception{
        var priced=raw("priced");priced.put("price","10000.50");priced.put("address","  Cafe\u0301   district  ");
        var unknown=raw("unknown");unknown.put("price",null);records=List.of(priced,unknown);
        UUID source=source(),job=job(source,"normalized-fields");service.process(job);
        assertThat(db.queryForObject("SELECT normalized_payload->>'address' FROM ingestion.import_items i JOIN ingestion.raw_records r USING(raw_id) WHERE r.external_id='priced'",String.class)).isEqualTo("Caf\u00e9 district");
        assertThat(db.queryForObject("SELECT jsonb_typeof(normalized_payload->'price') FROM ingestion.import_items i JOIN ingestion.raw_records r USING(raw_id) WHERE r.external_id='priced'",String.class)).isEqualTo("number");
        assertThat(db.queryForObject("SELECT (normalized_payload->>'price')::numeric FROM ingestion.import_items i JOIN ingestion.raw_records r USING(raw_id) WHERE r.external_id='priced'",java.math.BigDecimal.class)).isEqualByComparingTo("10000.50");
        assertThat(db.queryForObject("SELECT count(*) FROM ingestion.outbox_events WHERE event_type='ingestion.place.upsert-requested.v1'",Long.class)).isEqualTo(2);
        var schemas=JSON.readValue(getClass().getResourceAsStream("/event-contracts.json"),Map.class);
        for(var row:db.queryForList("SELECT payload::text FROM ingestion.outbox_events WHERE event_type='ingestion.place.upsert-requested.v1'")){
            var envelope=JSON.readValue(row.get("payload").toString(),Map.class);
            vn.smarttravel.ingestion.shared.web.ContractRequestAdvice.validate(envelope,(Map<?,?>)schemas.get("ingestion.place.upsert-requested.v1"));
            assertThat(JSON.valueToTree(envelope).path("payload").path("normalized").has("address")).isFalse();
        }
        assertThat(db.queryForObject("SELECT normalized_payload->'price'='null'::jsonb FROM ingestion.import_items i JOIN ingestion.raw_records r USING(raw_id) WHERE r.external_id='unknown'",Boolean.class)).isTrue();
    }
    @Test void nonfiniteNegativePricesAndPrimitiveRowsAreQuarantinedWithoutLosingGoodRows(){
        var input=new ArrayList<Object>();input.add(raw("good"));
        for(String price:List.of("Infinity","NaN","-1")){var invalid=raw("bad-"+price);invalid.put("price",price);input.add(invalid);}
        input.add("malformed synthetic row");input.add(null);input.add(List.of("malformed array"));records=input;
        UUID source=source(),job=job(source,"quarantine-types");service.process(job);
        assertThat(db.queryForObject("SELECT count(*) FROM ingestion.import_items WHERE status='FAILED'",Long.class)).isEqualTo(6);
        assertThat(db.queryForObject("SELECT count(*) FROM ingestion.raw_records",Long.class)).isEqualTo(7);
        events.consume(ack(db.queryForList("SELECT * FROM ingestion.import_items WHERE status='SENT'").getFirst()));
        assertThat(service.job(job).get("status")).isEqualTo("PARTIAL");
        assertThat(db.queryForObject("SELECT count(*) FROM ingestion.source_checkpoints",Long.class)).isZero();
        assertThat(db.queryForObject("SELECT count(*) FROM ingestion.raw_records WHERE payload ? 'invalid_record_type'",Long.class)).isEqualTo(3);
    }
    @AfterAll static void stop(){stub.stop(0);}
}
