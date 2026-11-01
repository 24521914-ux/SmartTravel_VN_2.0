package vn.smarttravel.catalog.places.integration;

import java.util.*;
import java.util.concurrent.*;
import javax.sql.DataSource;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.flywaydb.core.Flyway;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import vn.smarttravel.catalog.places.repository.CatalogRepository;
import vn.smarttravel.catalog.places.repository.BusinessRepository;
import vn.smarttravel.catalog.taxonomy.repository.TaxonomyRepository;
import vn.smarttravel.catalog.offerings.repository.OfferingRepository;
import vn.smarttravel.catalog.infrastructure.persistence.repository.IdempotencyRepository;
import static org.assertj.core.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="CATALOG_DB_TESTS",matches="true")
class CatalogDatabaseTests {
    static AnnotationConfigApplicationContext context;
    static com.sun.net.httpserver.HttpServer policyStub;static volatile boolean policyDown;static volatile String policyStatus="PERMITTED";static UUID source=UUID.randomUUID();
    static JdbcTemplate db;static CatalogRepository places;static BusinessRepository business;
    static final UUID USER=UUID.fromString("10000000-0000-0000-0000-000000000001");
    static final UUID OTHER=UUID.fromString("10000000-0000-0000-0000-000000000002");
    static final UUID GEO=UUID.fromString("20000000-0000-0000-0000-000000000001");
    @Configuration @EnableTransactionManagement static class Config {
        @Bean DataSource dataSource(){return new DriverManagerDataSource(System.getenv("DB_URL"),System.getenv("DB_USER"),System.getenv("DB_PASSWORD"));}
        @Bean JdbcTemplate jdbc(DataSource data){return new JdbcTemplate(data);}
        @Bean DataSourceTransactionManager transactionManager(DataSource data){return new DataSourceTransactionManager(data);}
        @Bean ObjectMapper json(){return new ObjectMapper().findAndRegisterModules();}
        @Bean CatalogRepository places(JdbcTemplate db,ObjectMapper json){return new CatalogRepository(db,json);}
        @Bean BusinessRepository business(JdbcTemplate db,CatalogRepository places,ObjectMapper json){return new BusinessRepository(db,places,json);}
        @Bean TaxonomyRepository taxonomy(JdbcTemplate db,CatalogRepository places){return new TaxonomyRepository(db,places);}
        @Bean OfferingRepository offerings(JdbcTemplate db,CatalogRepository places){return new OfferingRepository(db,places);}
        @Bean vn.smarttravel.catalog.infrastructure.events.client.SourcePolicyClient policy(){return new vn.smarttravel.catalog.infrastructure.events.client.SourcePolicyClient("http://127.0.0.1:"+policyStub.getAddress().getPort(),"fixture");}
        @Bean vn.smarttravel.catalog.infrastructure.events.repository.EventRepository events(JdbcTemplate db,CatalogRepository places,IdempotencyRepository idempotency,vn.smarttravel.catalog.infrastructure.events.client.SourcePolicyClient policy,ObjectMapper json,DataSourceTransactionManager manager){return new vn.smarttravel.catalog.infrastructure.events.repository.EventRepository(db,places,idempotency,policy,json,manager);}
        @Bean IdempotencyRepository idempotency(JdbcTemplate db,ObjectMapper json){return new IdempotencyRepository(db,json);}
    }
    @BeforeAll static void setup()throws Exception{policyStub=com.sun.net.httpserver.HttpServer.create(new java.net.InetSocketAddress("127.0.0.1",0),0);policyStub.createContext("/",exchange->{var response=new ObjectMapper().writeValueAsBytes(Map.of("source_id",source.toString(),"status",policyStatus,"allow_storage",policyStatus.equals("PERMITTED"),"source_version",1));exchange.getResponseHeaders().set("Content-Type","application/json");exchange.sendResponseHeaders(policyDown?503:200,response.length);exchange.getResponseBody().write(response);exchange.close();});policyStub.start();
        Flyway.configure().dataSource(System.getenv("DB_URL"),System.getenv("DB_MIGRATION_USER"),System.getenv("DB_MIGRATION_PASSWORD")).load().migrate();
        context=new AnnotationConfigApplicationContext(Config.class);db=context.getBean(JdbcTemplate.class);places=context.getBean(CatalogRepository.class);business=context.getBean(BusinessRepository.class);
        db.update("INSERT INTO catalog.geographic_units(geographic_unit_id,unit_type,code,name_vi,version,valid_from,status) VALUES(?,'PROVINCE','fixture','Hồ Chí Minh',1,'2020-01-01','ACTIVE')",GEO);
    }
    @AfterAll static void close(){if(context!=null)context.close();if(policyStub!=null)policyStub.stop(0);}
    Map<String,Object> input(String name){return new HashMap<>(Map.of("name_vi",name,"address","fixture address","geographic_unit_id",GEO.toString(),"lat",10.77,"lon",106.69));}
    UUID create(String name){return (UUID)places.create(input(name),USER).get("place_id");}
    @Test void frontendPlacePatchBindsGeographicUuidAndPersistsReadAfterWrite(){
        UUID id=create("Frontend place patch fixture"),updatedGeo=UUID.randomUUID();
        db.update("INSERT INTO catalog.geographic_units(geographic_unit_id,unit_type,code,name_vi,version,valid_from,status) VALUES(?,'PROVINCE',?,'Other fixture',1,'2020-01-01','ACTIVE')",updatedGeo,updatedGeo.toString());
        var body=new LinkedHashMap<String,Object>();body.put("name","Updated frontend place");body.put("latitude",10.8);body.put("longitude",106.7);body.put("geographic_unit_id",updatedGeo.toString());body.put("price",null);body.put("currency","VND");body.put("category_ids",List.of());body.put("tag_ids",List.of());body.put("amenity_ids",List.of());body.put("destination_ids",List.of());body.put("media_keys",List.of());
        var saved=places.update(id,1,body,USER);
        assertThat(saved.get("version")).isEqualTo(2L);
        var actual=places.place(id,false);
        assertThat(actual.get("name")).isEqualTo("Updated frontend place");assertThat(actual.get("geographic_unit_id")).isEqualTo(updatedGeo);
        assertThat(((Number)actual.get("latitude")).doubleValue()).isEqualTo(10.8);assertThat(((Number)actual.get("longitude")).doubleValue()).isEqualTo(106.7);assertThat(actual.get("price")).isNull();
        assertThat(db.queryForObject("SELECT count(*) FROM catalog.place_versions WHERE place_id=?",Integer.class,id)).isEqualTo(2);
    }
    @Test void offeringPaginationRetainsRecordsBeyondFirstHundred(){
        UUID place=create("Offering cursor anchor");
        db.update("INSERT INTO catalog.offerings(offering_id,place_id,item_type,name_vi) SELECT gen_random_uuid(),?,'SERVICE','Cursor offering '||i FROM generate_series(1,101) i",place);
        var offerings=context.getBean(OfferingRepository.class);
        var rows=offerings.list(place,false);
        assertThat(rows).hasSize(101);
        var request=new org.springframework.mock.web.MockHttpServletRequest("GET","/api/v1/admin/offerings");
        request.setParameter("limit","100");
        org.springframework.web.context.request.RequestContextHolder.setRequestAttributes(new org.springframework.web.context.request.ServletRequestAttributes(request));
        try{
            var first=vn.smarttravel.catalog.shared.web.Representations.page(rows);
            assertThat((List<?>)first.get("items")).hasSize(100);
            request.setParameter("cursor",first.get("next_cursor").toString());
            var second=vn.smarttravel.catalog.shared.web.Representations.page(rows);
            assertThat((List<?>)second.get("items")).hasSize(1);
            assertThat(second.get("next_cursor")).isNull();
        }finally{org.springframework.web.context.request.RequestContextHolder.resetRequestAttributes();}
    }
    @Test void frontendOfferingPatchPersistsAnchorTypePriceAndPublication(){
        UUID first=create("First offering frontend anchor"),second=create("Second offering frontend anchor");
        places.update(first,1,Map.of("status","PUBLISHED"),USER);places.update(second,1,Map.of("status","PUBLISHED"),USER);
        var offerings=context.getBean(OfferingRepository.class);
        UUID id=(UUID)offerings.create(Map.of("place_id",first.toString(),"type","SERVICE","name","Frontend service","price",10000,"currency","VND"),USER).get("offering_id");
        offerings.update(id,1,Map.of("place_id",second.toString(),"type","ACTIVITY","name","Updated frontend activity","price",0,"currency","VND","status","PUBLISHED"));
        var actual=offerings.get(id,false);
        assertThat(actual.get("place_id")).isEqualTo(second);assertThat(actual.get("item_type")).isEqualTo("ACTIVITY");assertThat(actual.get("name_vi")).isEqualTo("Updated frontend activity");
        assertThat(((Number)actual.get("price_min")).doubleValue()).isZero();assertThat(actual.get("status")).isEqualTo("PUBLISHED");assertThat(((Number)actual.get("version")).longValue()).isEqualTo(2L);
        assertThat(offerings.list(first,true)).isEmpty();assertThat(offerings.list(second,true)).extracting(row->row.get("offering_id")).containsExactly(id);
        assertThatThrownBy(()->offerings.update(id,1,Map.of("name","Stale edit"))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThat(offerings.get(id,false).get("name_vi")).isEqualTo("Updated frontend activity");
    }
    @Test void frontendTaxonomyPatchPersistsGeographicLevelAndInactiveCreation(){
        var taxonomy=context.getBean(TaxonomyRepository.class);
        UUID id=(UUID)taxonomy.create("geographic-units",Map.of("name","Frontend geography","level","PROVINCE"),USER).get("geographic_unit_id");
        taxonomy.update("geographic-units",id,1L,Map.of("name","Updated geography","level","DISTRICT"),USER);
        var actual=taxonomy.get("geographic-units",id);
        assertThat(actual.get("name_vi")).isEqualTo("Updated geography");assertThat(actual.get("unit_type")).isEqualTo("DISTRICT");assertThat(((Number)actual.get("version")).longValue()).isEqualTo(2L);
        for(String kind:List.of("tags","amenities")){
            var created=taxonomy.create(kind,Map.of("name","Inactive "+kind,"active",false),USER);
            assertThat(created.get("active")).isEqualTo(false);
        }
    }
    @Test void mutationHistoryOutboxVisibilityAndOldRating(){
        UUID id=create("Bảo tàng fixture");assertThat(places.search(Map.of("q","bao tang"))).isEmpty();
        places.update(id,1,Map.of("status","PUBLISHED","price_min",0,"price_max",0),USER);
        assertThat(places.search(Map.of("q","bao tang","minPrice","0","maxPrice","0"))).hasSize(1);
        var rating=Map.<String,Object>of("place_id",id,"count",2,"sum",9,"version",3,"as_of","2026-10-10T00:00:00Z");UUID event=UUID.randomUUID();
        assertThat(places.rating(event,rating)).isTrue();assertThat(places.rating(event,rating)).isFalse();
        places.rating(UUID.randomUUID(),Map.of("place_id",id,"count",1,"sum",1,"version",1,"as_of","2026-10-10T00:00:00Z"));
        assertThat(places.search(Map.of("minRating","4"))).hasSize(1);
        places.update(id,2,Map.of("status","HIDDEN"),USER);assertThatThrownBy(()->places.place(id,true)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThat(db.queryForObject("SELECT count(*) FROM catalog.place_versions WHERE place_id=?",Integer.class,id)).isEqualTo(3);
        assertThat(db.queryForObject("SELECT source_version FROM catalog.place_rating_summary WHERE place_id=?",Long.class,id)).isEqualTo(3);
    }
    @Test void internalFeatureSnapshotIncludesAuditedLineageWithoutChangingPublicPlace(){
        UUID id=create("Lineage bootstrap fixture");
        db.update("UPDATE catalog.place_versions SET source_id=? WHERE place_id=? AND version_no=1",source,id);
        var feature=places.featureSnapshot().stream().filter(row->id.equals(row.get("place_id"))).findFirst().orElseThrow();
        assertThat(feature.get("source_id")).isEqualTo(source);
        assertThat(vn.smarttravel.catalog.shared.web.Representations.place(places.place(id,false))).doesNotContainKey("source_id");
    }
    @Test void concurrentVersionAllowsOneCommit()throws Exception{
        UUID id=create("Concurrency fixture");var pool=Executors.newFixedThreadPool(2);var latch=new CountDownLatch(1);
        try{var tasks=new ArrayList<Future<Boolean>>();for(int n=0;n<2;n++){final int current=n;tasks.add(pool.submit(()->{latch.await();try{places.update(id,1,Map.of("description","writer "+current),USER);return true;}catch(org.springframework.web.server.ResponseStatusException e){return false;}}));}latch.countDown();int wins=0;for(var task:tasks)if(task.get())wins++;assertThat(wins).isEqualTo(1);assertThat(places.place(id,false).get("version")).isEqualTo(2L);}finally{pool.shutdownNow();}
    }
    @Test void businessRequiresVerifiedMembershipAndConflictPreservesPlace(){
        UUID place=create("Business fixture");UUID company=(UUID)business.create(USER,Map.of("display_name","fixture business")).get("business_id");
        assertThatThrownBy(()->business.claim(company,USER,Map.of("place_id",place,"evidence_object_key","private/evidence"))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        business.verify(company,1,"VERIFIED");
        assertThatThrownBy(()->business.claim(company,OTHER,Map.of("place_id",place,"evidence_object_key","private/evidence"))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        @SuppressWarnings("unchecked") var claim=(Map<String,Object>)business.claim(company,USER,Map.of("place_id",place,"evidence_object_key","private/evidence"));UUID claimId=(UUID)claim.get("claim_id");business.reviewClaim(claimId,OTHER,"APPROVED","validated");
        @SuppressWarnings("unchecked")var request=(Map<String,Object>)business.request(claimId,USER,1,Map.of("description","business edit"));places.update(place,1,Map.of("description","admin edit"),OTHER);
        @SuppressWarnings("unchecked")var result=(Map<String,Object>)business.reviewRequest((UUID)request.get("request_id"),OTHER,"APPROVED","reviewed");assertThat(result.get("status")).isEqualTo("CONFLICT");assertThat(places.place(place,false).get("description")).isEqualTo("admin edit");
    }
    @Test void openingOvernight24HoursHolidayAndRejectedLongShiftRollback(){
        UUID id=create("Opening hours fixture");places.update(id,1,Map.of("opening_hours",List.of(Map.of("weekday",1,"open","22:00","close","02:00","overnight",true),Map.of("weekday",2,"open","00:00","close","00:00","overnight",true))),USER);
        assertThat((List<?>)places.place(id,false).get("opening_hours")).hasSize(2);
        assertThatThrownBy(()->places.update(id,2,Map.of("opening_hours",List.of(Map.of("weekday",3,"open","10:00","close","12:00","overnight",true))),USER)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThat(places.place(id,false).get("version")).isEqualTo(2L);
        assertThatThrownBy(()->places.update(id,2,Map.of("opening_exceptions",List.of(Map.of("local_date","2026-10-10","is_closed",true),Map.of("local_date","2026-10-10","is_closed",false,"open_time","08:00","close_time","18:00"))),USER)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThat(db.queryForObject("SELECT count(*) FROM catalog.opening_exceptions WHERE place_id=?",Integer.class,id)).isZero();
    }
    @Test void hierarchyCycleEffectiveOverlapAndEventPublishScheduleAreRejected(){
        var taxonomy=context.getBean(TaxonomyRepository.class);UUID parent=UUID.randomUUID(),child=UUID.randomUUID();taxonomy.create("categories",Map.of("id",parent,"code",parent.toString(),"name","Parent"),USER);taxonomy.create("categories",Map.of("id",child,"parent_id",parent,"code",child.toString(),"name","Child"),USER);
        assertThatThrownBy(()->taxonomy.update("categories",parent,null,Map.of("parent_id",child),USER)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        String code=UUID.randomUUID().toString();taxonomy.create("geographic-units",Map.of("unit_type","PROVINCE","code",code,"name","Range A","valid_from","2020-01-01","valid_to","2025-12-31"),USER);
        assertThatThrownBy(()->taxonomy.create("geographic-units",Map.of("unit_type","PROVINCE","code",code,"name","Range B","valid_from","2025-01-01","valid_to","2026-12-31","version",2),USER)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        UUID place=create("Offering anchor");places.update(place,1,Map.of("status","PUBLISHED"),USER);var offerings=context.getBean(OfferingRepository.class);UUID event=(UUID)offerings.create(Map.of("place_id",place,"item_type","EVENT","name","Timed free fixture","price",0),USER).get("offering_id");
        assertThatThrownBy(()->offerings.update(event,1,Map.of("status","PUBLISHED"))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        offerings.update(event,1,Map.of("schedules",List.of(Map.of("starts_at","2026-10-11T01:00:00Z","ends_at","2026-10-11T02:00:00Z"))));offerings.update(event,2,Map.of("status","PUBLISHED"));assertThat(offerings.list(place,true)).hasSize(1);
    }
    @Test void offeringPublicationPreservesDraftEditsAndRejectsHiddenAnchors(){
        UUID place=create("Non-AI offering publication");
        var offerings=context.getBean(OfferingRepository.class);
        UUID offering=(UUID)offerings.create(Map.of("place_id",place,"type","ACTIVITY","name","Guided walk","price",10000),USER).get("offering_id");
        assertThat(offerings.list(place,true)).isEmpty();
        assertThatThrownBy(()->offerings.update(offering,1,Map.of("status","PUBLISHED")))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThat(offerings.get(offering,false).get("version")).isEqualTo(1L);
        places.update(place,1,Map.of("status","PUBLISHED"),USER);
        offerings.update(offering,1,Map.of("price",12000)); // Existing clients omit status.
        assertThat(offerings.list(place,true)).isEmpty();
        offerings.update(offering,2,Map.of("status","PUBLISHED"));
        assertThat(offerings.list(place,true)).extracting(row->row.get("offering_id")).containsExactly(offering);
        places.update(place,2,Map.of("status","HIDDEN"),USER);
        assertThat(offerings.list(place,true)).isEmpty();
        assertThatThrownBy(()->offerings.update(offering,3,Map.of("status","PUBLISHED")))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThat(offerings.get(offering,false).get("version")).isEqualTo(3L);
    }
    @Test void idempotencyReplayReturnsOriginalAndPayloadConflictDoesNotMutate(){
        var idempotency=context.getBean(IdempotencyRepository.class);var body=input("Idempotent fixture");String key=UUID.randomUUID().toString();
        @SuppressWarnings("unchecked")var first=(Map<String,Object>)idempotency.execute(USER.toString(),"create",key,body,()->places.create(body,USER));
        @SuppressWarnings("unchecked")var duplicate=(Map<String,Object>)idempotency.execute(USER.toString(),"create",key,body,()->places.create(body,USER));assertThat(duplicate.get("place_id").toString()).isEqualTo(first.get("place_id").toString());
        assertThatThrownBy(()->idempotency.execute(USER.toString(),"create",key,input("Different payload"),()->places.create(input("Different payload"),USER))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThat(db.queryForObject("SELECT count(*) FROM catalog.places WHERE name_vi='Idempotent fixture'",Integer.class)).isEqualTo(1);
    }
    com.fasterxml.jackson.databind.JsonNode command(UUID event,UUID command,UUID place,long expected,Map<String,Object> fields){return context.getBean(ObjectMapper.class).valueToTree(Map.of("event_id",event,"event_type","ingestion.place.upsert-requested.v1","schema_version",1,"producer","ingestion","payload",Map.of("command_id",command,"source_id",source,"source_version",1,"proposed_place_id",place,"expected_catalog_version",expected,"normalized",fields)));}
    @Test void importCommandDuplicateProtectedFieldsAndSourceRevocationFailClosed(){
        var events=context.getBean(vn.smarttravel.catalog.infrastructure.events.repository.EventRepository.class);UUID place=create("Protected admin name"),command=UUID.randomUUID();var event=command(UUID.randomUUID(),command,place,1,Map.of("name","Imported lower priority name"));assertThat(events.accept(event)).isTrue();assertThat(places.place(place,false).get("name")).isEqualTo("Protected admin name");assertThat(events.accept(event)).isFalse();events.accept(command(UUID.randomUUID(),command,place,1,Map.of("name","Imported lower priority name")));assertThat(db.queryForObject("SELECT count(*) FROM catalog.outbox_events WHERE event_type='catalog.place-import.rejected.v1' AND payload->'payload'->>'error_code'='PROTECTED_FIELD_CONFLICT' AND aggregate_id=?",Integer.class,command.toString())).isEqualTo(1);
        var revoke=context.getBean(ObjectMapper.class).valueToTree(Map.of("event_id",UUID.randomUUID(),"event_type","ingestion.source-policy.changed.v1","schema_version",1,"producer","ingestion","payload",Map.of("source_id",source,"source_version",2,"status","REVOKED","allow_storage",false)));events.accept(revoke);UUID denied=UUID.randomUUID();events.accept(command(UUID.randomUUID(),denied,place,1,Map.of("name","Denied")));assertThat(db.queryForObject("SELECT count(*) FROM catalog.outbox_events WHERE event_type='catalog.place-import.rejected.v1' AND aggregate_id=?",Integer.class,denied.toString())).isEqualTo(1);assertThat(places.place(place,false).get("version")).isEqualTo(1L);
    }
    @Test void dependencyFailureRollsBackCommandInboxAndResult(){var events=context.getBean(vn.smarttravel.catalog.infrastructure.events.repository.EventRepository.class);UUID place=create("Retry command fixture"),event=UUID.randomUUID();policyDown=true;try{assertThatThrownBy(()->events.accept(command(event,UUID.randomUUID(),place,1,Map.of("name","Retry")))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);assertThat(db.queryForObject("SELECT count(*) FROM catalog.inbox_events WHERE event_id=?",Integer.class,event)).isZero();assertThat(places.place(place,false).get("version")).isEqualTo(1L);}finally{policyDown=false;}}
    @Test void unknownPriceFreePriceDistanceAndAliasesAreDistinct(){UUID free=create("Free distance fixture"),unknown=create("Unknown price fixture");places.update(free,1,Map.of("status","PUBLISHED","price_min",0,"price_max",0),USER);places.update(unknown,1,Map.of("status","PUBLISHED"),USER);assertThat(places.place(unknown,true).get("price")).isNull();assertThat(places.search(Map.of("q","free distance","maxPrice","0","currency","VND","radiusM","1000","lat","10.77","lon","106.69"))).hasSize(1);assertThat(places.search(Map.of("q","unknown price","maxPrice","0"))).isEmpty();db.update("INSERT INTO catalog.place_aliases(alias_id,place_id,alias,normalized_alias) VALUES(?,?,?,?)",UUID.randomUUID(),free,"Former fixture",CatalogRepository.normalize("Former fixture"));assertThat(places.search(Map.of("q","former fixture"))).hasSize(1);assertThatThrownBy(()->places.search(Map.of("radiusM","1000000","lat","10.77","lon","106.69"))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);}
    @Test void cursorRejectsTamperingAndChangedFiltersAndPagesWithoutDuplicates(){
        for(int i=0;i<3;i++){UUID id=create("Cursor isolated fixture "+i);places.update(id,1,Map.of("status","PUBLISHED"),USER);}
        var cursors=new vn.smarttravel.catalog.places.service.SearchCursor("fixture-cursor-key-32-characters-long");
        var query=Map.of("q","cursor isolated fixture","limit","2");var first=places.search(query);assertThat(first).hasSize(3);
        UUID last=(UUID)first.get(1).get("place_id");String token=cursors.encode(last,query);assertThat(cursors.decode(token,query)).isEqualTo(last);
        assertThatThrownBy(()->cursors.decode(token+"tampered",query)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThatThrownBy(()->cursors.decode(token,Map.of("q","other","limit","2"))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        var next=new HashMap<>(query);next.put("afterId",last.toString());assertThat(places.search(next)).hasSize(1).allSatisfy(row->assertThat(row.get("place_id")).isNotIn(first.get(0).get("place_id"),last));
    }
    @Test void privateEvidenceRemainsPrivateAfterApprovalAndSpatialExplainUsesIndex(){
        var media=new vn.smarttravel.catalog.media.repository.MediaRepository(db);UUID id=UUID.randomUUID();media.create(id,"private/"+USER+"/fixture","fixture-sha","image/png",8,USER);media.review(id,OTHER,"APPROVED","checked");assertThatThrownBy(()->media.get(id,true)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        var template=new org.springframework.transaction.support.TransactionTemplate(context.getBean(DataSourceTransactionManager.class));
        String explain=template.execute(status->{db.execute("SET LOCAL enable_seqscan=off");return String.join("\n",db.queryForList("EXPLAIN SELECT place_id FROM catalog.places WHERE ST_DWithin(location,ST_SetSRID(ST_MakePoint(106.69,10.77),4326)::geography,1000)",String.class));});
        assertThat(explain).containsIgnoringCase("index");System.out.println("Catalog spatial EXPLAIN: "+explain);
    }
    @Test void deletionWaitsForBusinessMutationThenScrubsItBeforeAcknowledging()throws Exception{
        UUID user=UUID.randomUUID();var tx=new org.springframework.transaction.support.TransactionTemplate(context.getBean(DataSourceTransactionManager.class));
        var created=new CountDownLatch(1);var release=new CountDownLatch(1);var pool=Executors.newFixedThreadPool(2);
        var event=context.getBean(ObjectMapper.class).valueToTree(Map.of("event_id",UUID.randomUUID(),"event_type","identity.user.deletion-requested.v1","schema_version",1,"producer","identity","payload",Map.of("user_id",user,"deletion_request_id",UUID.randomUUID())));
        try{
            var creating=pool.submit(()->tx.execute(status->{var row=business.create(user,Map.of("display_name","Deletion race","contact_email","pii@synthetic.invalid"));created.countDown();try{if(!release.await(10,TimeUnit.SECONDS))throw new IllegalStateException("Fence timeout");}catch(InterruptedException error){Thread.currentThread().interrupt();throw new IllegalStateException(error);}return row;}));
            assertThat(created.await(10,TimeUnit.SECONDS)).isTrue();
            var deleting=pool.submit(()->context.getBean(vn.smarttravel.catalog.infrastructure.events.repository.EventRepository.class).accept(event));
            assertThatThrownBy(()->deleting.get(200,TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);release.countDown();UUID businessId=(UUID)creating.get(10,TimeUnit.SECONDS).get("business_id");assertThat(deleting.get(10,TimeUnit.SECONDS)).isTrue();
            assertThat(business.business(businessId).get("contact_email")).isNull();assertThat(db.queryForObject("SELECT count(*) FROM catalog.business_members WHERE user_id=?",Integer.class,user)).isZero();
            assertThatThrownBy(()->business.create(user,Map.of("display_name","After deletion"))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        }finally{release.countDown();pool.shutdownNow();}
    }
    @Test void suspendedAdminCannotReviewOrMutateActorlessAdministrativeCommands(){
        UUID admin=UUID.randomUUID();db.update("INSERT INTO catalog.user_status_projections(user_id,status,source_version) VALUES(?,'SUSPENDED',1)",admin);
        assertThatThrownBy(()->business.verificationReview(UUID.randomUUID(),admin,"APPROVE","checked")).isInstanceOf(org.springframework.web.server.ResponseStatusException.class).satisfies(error->assertThat(((org.springframework.web.server.ResponseStatusException)error).getStatusCode().value()).isEqualTo(403));
        assertThatThrownBy(()->business.reviewRequest(UUID.randomUUID(),admin,"APPROVED","checked")).isInstanceOf(org.springframework.web.server.ResponseStatusException.class).satisfies(error->assertThat(((org.springframework.web.server.ResponseStatusException)error).getStatusCode().value()).isEqualTo(403));
        var jwt=org.springframework.security.oauth2.jwt.Jwt.withTokenValue("fixture").header("alg","RS256").subject(admin.toString()).build();
        var security=org.springframework.security.core.context.SecurityContextHolder.createEmptyContext();security.setAuthentication(new org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken(jwt));org.springframework.security.core.context.SecurityContextHolder.setContext(security);
        try{
            assertThatThrownBy(()->business.verify(UUID.randomUUID(),1,"VERIFIED")).isInstanceOf(org.springframework.web.server.ResponseStatusException.class).satisfies(error->assertThat(((org.springframework.web.server.ResponseStatusException)error).getStatusCode().value()).isEqualTo(403));
            assertThatThrownBy(()->context.getBean(OfferingRepository.class).update(UUID.randomUUID(),1,Map.of("name","forged"))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class).satisfies(error->assertThat(((org.springframework.web.server.ResponseStatusException)error).getStatusCode().value()).isEqualTo(403));
        }finally{org.springframework.security.core.context.SecurityContextHolder.clearContext();}
    }
}
