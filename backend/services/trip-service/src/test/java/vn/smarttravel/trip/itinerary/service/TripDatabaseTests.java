package vn.smarttravel.trip.itinerary.service;

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
import org.springframework.web.server.ResponseStatusException;
import java.net.InetSocketAddress;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static vn.smarttravel.trip.shared.web.ApiValues.*;

@org.springframework.test.context.ActiveProfiles("test")
@SpringBootTest(properties="logging.level.org.springframework=INFO")
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named="DOMAIN_DB_TESTS",matches="true")
class TripDatabaseTests {
    static final ObjectMapper JSON=new ObjectMapper();
    static final UUID USER=UUID.fromString("00000000-0000-4000-8000-000000000001"),OTHER=UUID.randomUUID(),PLACE=UUID.fromString("10000000-0000-4000-8000-000000000001"),PLACE2=UUID.fromString("10000000-0000-4000-8000-000000000002"),DEST=UUID.fromString("20000000-0000-4000-8000-000000000001");
    static final HttpServer stub=start();
    static volatile boolean catalogDown,routingDown;
    static volatile long catalogVersion=1;
    static volatile Integer catalogPrice=10000;
    static volatile String catalogCurrency="VND";
    static volatile long routingDelayMillis;
    static final java.util.concurrent.atomic.AtomicInteger routingCalls=new java.util.concurrent.atomic.AtomicInteger();
    @Autowired TripService service;
    @Autowired TripEvents events;
    @Autowired JdbcTemplate db;
    @Autowired MockMvc mvc;
    @Autowired org.springframework.transaction.PlatformTransactionManager transactions;
    static HttpServer start(){try{var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);server.createContext("/",exchange->{try{String path=exchange.getRequestURI().getPath();Object response;int status=200;if(path.equals("/route")){routingCalls.incrementAndGet();if(routingDelayMillis>0)try{Thread.sleep(routingDelayMillis);}catch(InterruptedException error){Thread.currentThread().interrupt();}status=routingDown?429:200;response=map("distance_m",1500,"duration_seconds",300);}else if(path.contains("destinations")){status=catalogDown?503:200;response=map("destination_id",path.substring(path.lastIndexOf('/')+1),"name","Licensed synthetic destination","version",1);}else {status=catalogDown?503:200;var request=JSON.readTree(exchange.getRequestBody());var id=UUID.fromString(request.path("ids").get(0).asText());response=map("items",List.of(snapshot(id)),"missing_ids",List.of());}byte[] bytes=JSON.writeValueAsBytes(response);exchange.getResponseHeaders().set("Content-Type","application/json");exchange.sendResponseHeaders(status,bytes.length);exchange.getResponseBody().write(bytes);}finally{exchange.close();}});server.start();return server;}catch(Exception e){throw new ExceptionInInitializerError(e);}}
    static Map<String,Object> snapshot(UUID place){return map("place_id",place.toString(),"name","Synthetic licensed place","status","PUBLISHED","version",catalogVersion,"latitude",10.76,"longitude",place.equals(PLACE)?106.66:106.68,"category_ids",List.of(DEST.toString()),"tag_ids",List.of(),"amenity_ids",List.of(),"geographic_unit_id",DEST.toString(),"destination_ids",List.of(DEST.toString()),"price",catalogPrice,"currency",catalogCurrency,"opening_hours",List.of(),"media_keys",List.of(),"source_version",catalogVersion);}
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r){String url="http://127.0.0.1:"+stub.getAddress().getPort();r.add("trip.catalog.base-url",()->url);r.add("trip.routing.url",()->url+"/route");r.add("security.jwt.jwk-set-uri",()->url+"/jwks");r.add("security.jwt.issuer",()->"test");r.add("trip.transport.enabled",()->"false");}
    private void clearAuditFixture(){var config=new org.springframework.jdbc.datasource.DriverManagerDataSource(System.getenv("DB_URL"),System.getenv("DB_MIGRATION_USER"),System.getenv("DB_MIGRATION_PASSWORD"));new org.springframework.jdbc.core.JdbcTemplate(config).update("DELETE FROM trip.audit_logs");}
    @BeforeEach void reset(){clearAuditFixture();catalogDown=routingDown=false;catalogVersion=1;catalogPrice=10000;catalogCurrency="VND";routingDelayMillis=0;routingCalls.set(0);db.update("DELETE FROM trip.trips");for(String table:List.of("outbox_events","inbox_events","idempotency_records","route_estimates","user_tombstones","user_status","destination_status"))db.update("DELETE FROM trip."+table);}
    Map<String,Object> body(){return map("name","Fixture itinerary","start_date","2026-10-01","end_date","2026-10-05","timezone","Asia/Ho_Chi_Minh","currency","VND","budget",50000);}
    long version(UUID trip){return ((Number)service.get(trip,USER).get("version")).longValue();}
    String match(UUID trip){return "\""+version(trip)+"\"";}
    UUID create(){return id(service.create(USER,body()).get("trip_id"));}
    UUID day(UUID trip){return id(service.day(trip,USER,null,match(trip),map("date","2026-10-02")).get("day_id"));}
    Map<String,Object> item(UUID place){return map("place_id",place.toString(),"note","Fixture visit","duration_minutes",45,"locked",false,"recommendation_request_id",null);}
    UUID add(UUID trip,UUID day,UUID place){return id(service.addItem(trip,USER,day,match(trip),UUID.randomUUID().toString(),item(place)).get("item_id"));}
    @Test void historicalStreamRequiresScopedWorkloadAndUnknownInternalRoutesAreDenied()throws Exception{
        String path="/internal/v1/interactions/snapshot";
        var scope=new org.springframework.security.core.authority.SimpleGrantedAuthority("SCOPE_trip:internal");
        mvc.perform(MockMvcRequestBuilders.get(path).with(jwt().jwt(j->j.subject(USER.toString()).claim("sid",UUID.randomUUID().toString())).authorities(scope)))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isForbidden());
        mvc.perform(MockMvcRequestBuilders.get(path).with(jwt().jwt(j->j.subject("intelligence-worker").claim("client_id","intelligence-worker")).authorities(new org.springframework.security.core.authority.SimpleGrantedAuthority("SCOPE_trip:read"))))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isForbidden());
        var workload=jwt().jwt(j->j.subject("intelligence-worker").claim("client_id","intelligence-worker")).authorities(scope);
        mvc.perform(MockMvcRequestBuilders.get(path).with(workload))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk());
        mvc.perform(MockMvcRequestBuilders.get("/internal/v1/unknown").with(workload))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isForbidden());
    }
    @SuppressWarnings("unchecked") Map<String,Object> http(String method,String path,Object body,int expected,String match,String key)throws Exception{
        var request=MockMvcRequestBuilders.request(org.springframework.http.HttpMethod.valueOf(method),path).with(jwt().jwt(j->j.subject(USER.toString()).claim("scope","trip:read trip:write")));
        if(body!=null)request.contentType("application/json").content(JSON.writeValueAsBytes(body));if(match!=null)request.header("If-Match",match);if(key!=null)request.header("Idempotency-Key",key);
        var response=mvc.perform(request).andReturn().getResponse();assertThat(response.getStatus()).as(method+" "+path+" "+response.getContentAsString()).isEqualTo(expected);if(expected==204)return Map.of();var value=JSON.readValue(response.getContentAsString(),Map.class);
        var contract=JSON.readTree(Files.readString(Path.of("../../contracts/openapi/trip.yaml").toAbsolutePath().normalize()));
        for(var it=contract.path("paths").fields();it.hasNext();){var entry=it.next();if(path.matches(entry.getKey().replaceAll("\\{[^}]+}","[^/]+"))){var schema=entry.getValue().path(method.toLowerCase()).path("responses").path(String.valueOf(expected)).path("content").path("application/json").path("schema");if(!schema.isMissingNode())vn.smarttravel.trip.shared.web.ContractRequestAdvice.validate(value,JSON.convertValue(schema,Map.class));}}
        return value;
    }
    @Test void allFrozenEditorOperationsHaveRealProviderResponses()throws Exception{
        var tripBody=http("POST","/api/v1/me/trips",body(),201,null,null);UUID trip=id(tripBody.get("trip_id"));String p="/api/v1/trips/"+trip;
        http("GET","/api/v1/me/trips",null,200,null,null);http("GET",p,null,200,null,null);http("PATCH",p,map("name","Updated itinerary"),200,match(trip),null);http("PUT",p+"/state",map("state","PLANNED"),200,match(trip),null);
        UUID segment=id(http("POST",p+"/destinations",map("destination_id",DEST.toString(),"start_date","2026-10-01","end_date","2026-10-04"),201,match(trip),null).get("segment_id"));
        http("GET",p+"/destinations",null,200,null,null);http("GET",p+"/destinations/"+segment,null,200,null,null);http("PATCH",p+"/destinations/"+segment,map("end_date","2026-10-05"),200,match(trip),null);
        UUID day=id(http("POST",p+"/days",map("date","2026-10-02"),201,match(trip),null).get("day_id"));String d=p+"/days/"+day;
        http("GET",p+"/days",null,200,null,null);http("GET",d,null,200,null,null);http("PATCH",d,map("date","2026-10-03"),200,match(trip),null);
        UUID item=id(http("POST",d+"/items",item(PLACE),201,match(trip),"item-1").get("item_id")),item2=id(http("POST",d+"/items",item(PLACE2),201,match(trip),"item-2").get("item_id"));
        http("GET",d+"/items",null,200,null,null);http("GET",d+"/items/"+item,null,200,null,null);http("PATCH",d+"/items/"+item,map("note","Updated note"),200,match(trip),null);http("PUT",d+"/items/order",map("item_ids",List.of(item2.toString(),item.toString())),200,match(trip),null);
        var route=map("from_item_id",item.toString(),"to_item_id",item2.toString(),"mode","WALK");http("POST",p+"/route-estimates",route,200,match(trip),null);UUID transfer=id(http("POST",p+"/transfers",route,201,match(trip),null).get("transfer_id"));http("GET",p+"/transfers",null,200,null,null);http("GET",p+"/transfers/"+transfer,null,200,null,null);http("PATCH",p+"/transfers/"+transfer,map("mode","DRIVE"),200,match(trip),null);
        http("POST",p+"/snapshots/refresh",map("item_ids",List.of(item.toString())),202,match(trip),null);http("DELETE",p+"/transfers/"+transfer,null,204,match(trip),null);http("DELETE",d+"/items/"+item,null,204,match(trip),null);http("DELETE",d+"/items/"+item2,null,204,match(trip),null);http("DELETE",d,null,204,match(trip),null);http("DELETE",p+"/destinations/"+segment,null,204,match(trip),null);http("DELETE",p,null,204,match(trip),null);
        assertThat(db.queryForObject("SELECT count(*) FROM trip.outbox_events",Long.class)).isGreaterThan(20);
    }
    @Test void ownerPreconditionCrossTripAndDateBoundariesAreEnforced(){UUID trip=create(),day=day(trip),other=create(),otherDay=day(other);assertThatThrownBy(()->service.get(trip,OTHER)).isInstanceOf(ResponseStatusException.class).hasMessageContaining("404");assertThatThrownBy(()->service.addItem(trip,USER,otherDay,match(trip),"cross",item(PLACE))).hasMessageContaining("404");assertThatThrownBy(()->service.patch(trip,USER,null,map("name","x"))).hasMessageContaining("428");assertThatThrownBy(()->service.patch(trip,USER,"\"1\"",map("name","x"))).hasMessageContaining("409");assertThatThrownBy(()->service.patch(trip,USER,match(trip),map("end_date","2026-10-01"))).hasMessageContaining("DAYS_OUTSIDE_DATE_RANGE");}
    @Test void addIdempotencyAndUnavailableCatalogPreserveCommittedSnapshot(){UUID trip=create(),day=day(trip);String before=match(trip);var first=service.addItem(trip,USER,day,before,"stable",item(PLACE));var replay=service.addItem(trip,USER,day,before,"stable",item(PLACE));assertThat(replay.get("item_id").toString()).isEqualTo(first.get("item_id").toString());assertThat(db.queryForObject("SELECT count(*) FROM trip.itinerary_items",Long.class)).isEqualTo(1);assertThatThrownBy(()->service.addItem(trip,USER,day,before,"stable",item(PLACE2))).hasMessageContaining("409");catalogDown=true;assertThat(service.items(trip,USER,day,null).get("items")).asList().hasSize(1);assertThatThrownBy(()->service.addItem(trip,USER,day,match(trip),"down",item(PLACE2))).hasMessageContaining("503");assertThat(db.queryForObject("SELECT count(*) FROM trip.itinerary_items",Long.class)).isEqualTo(1);}
    @Test void concurrentReorderHasOneWinnerAndRetainsAllItems()throws Exception{UUID trip=create(),day=day(trip),a=add(trip,day,PLACE),b=add(trip,day,PLACE2);String version=match(trip);var start=new CountDownLatch(1);var executor=Executors.newFixedThreadPool(2);try{List<Future<Integer>>futures=new ArrayList<>();for(var ids:List.of(List.of(b,a),List.of(a,b)))futures.add(executor.submit(()->{start.await();try{service.order(trip,USER,day,version,ids);return 200;}catch(ResponseStatusException e){return e.getStatusCode().value();}}));start.countDown();assertThat(List.of(futures.get(0).get(),futures.get(1).get())).containsExactlyInAnyOrder(200,409);assertThat(db.queryForObject("SELECT count(*) FROM trip.itinerary_items",Long.class)).isEqualTo(2);}finally{executor.shutdownNow();}}
    @Test void routingFailureHasStraightLineLabelAndNoInventedDuration(){UUID trip=create(),day=day(trip),a=add(trip,day,PLACE),b=add(trip,day,PLACE2);routingDown=true;var result=service.transfer(trip,USER,null,match(trip),map("from_item_id",a,"to_item_id",b,"mode","DRIVE"),true);assertThat(result.get("fallback")).isEqualTo(true);assertThat(result.get("duration_seconds")).isNull();assertThat(((Number)result.get("distance_m")).longValue()).isPositive();}
    @Test void locksCompletedRefreshVisibilityOrderingAndDeletionAreReal(){UUID trip=create(),day=day(trip),item=add(trip,day,PLACE);service.patchItem(trip,USER,day,item,match(trip),map("locked",true));assertThatThrownBy(()->service.patchItem(trip,USER,day,item,match(trip),map("note","change"))).hasMessageContaining("ITEM_LOCKED");service.patchItem(trip,USER,day,item,match(trip),map("locked",false));service.state(trip,USER,match(trip),"COMPLETED");assertThatThrownBy(()->service.refresh(trip,USER,match(trip),List.of(item))).hasMessageContaining("COMPLETED_SNAPSHOT_IMMUTABLE");var visibility=map("event_id",UUID.randomUUID(),"event_type","catalog.place.visibility-changed.v1","schema_version",1,"payload",map("place_id",PLACE,"status","HIDDEN","version",2));events.consume(visibility);events.consume(visibility);var old=map("event_id",UUID.randomUUID(),"event_type","catalog.place.visibility-changed.v1","schema_version",1,"payload",map("place_id",PLACE,"status","PUBLISHED","version",1));events.consume(old);assertThat(db.queryForObject("SELECT unavailable_at IS NOT NULL FROM trip.place_snapshots",Boolean.class)).isTrue();UUID deletion=UUID.randomUUID();var event=map("event_id",UUID.randomUUID(),"event_type","identity.user.deletion-requested.v1","schema_version",1,"aggregate_version",1,"payload",map("user_id",USER,"deletion_request_id",deletion));events.consume(event);events.consume(event);assertThat(db.queryForObject("SELECT count(*) FROM trip.trips",Long.class)).isZero();assertThat(db.queryForObject("SELECT count(*) FROM trip.outbox_events WHERE event_type='domain.user-data-deleted.v1'",Long.class)).isEqualTo(1);assertThatThrownBy(()->service.create(USER,body())).hasMessageContaining("USER_DELETED");}
    @Test void collectionCursorDetectsMutationAndRejectsInvalidBounds(){UUID trip=create(),day=day(trip);add(trip,day,PLACE);add(trip,day,PLACE2);var first=service.paginate(service.items(trip,USER,day,null),1,null);String cursor=first.get("next_cursor").toString();assertThat(service.paginate(service.items(trip,USER,day,null),1,cursor).get("items")).asList().hasSize(1);service.patch(trip,USER,match(trip),map("name","Changed"));assertThatThrownBy(()->service.paginate(service.items(trip,USER,day,null),1,cursor)).hasMessageContaining("CURSOR_VERSION_CONFLICT");assertThatThrownBy(()->service.paginate(service.items(trip,USER,day,null),101,null)).hasMessageContaining("INVALID_LIMIT");}
    @Test void routingCacheReusesProviderAndForeignTransferDoesNotMutateTrip(){
        UUID trip=create(),day=day(trip),a=add(trip,day,PLACE),b=add(trip,day,PLACE2);
        var route=map("from_item_id",a,"to_item_id",b,"mode","WALK");
        var first=service.transfer(trip,USER,null,match(trip),route,true);
        routingDown=true;
        var cached=service.transfer(trip,USER,null,match(trip),route,true);
        assertThat(cached.get("fallback")).isEqualTo(false);
        assertThat(cached.get("duration_seconds")).isEqualTo(first.get("duration_seconds"));
        assertThat(routingCalls.get()).isEqualTo(1);
        UUID other=create(),otherDay=day(other),foreign=add(other,otherDay,PLACE2);
        long before=version(trip);
        assertThatThrownBy(()->service.transfer(trip,USER,null,match(trip),map("from_item_id",a,"to_item_id",foreign,"mode","DRIVE"),false)).hasMessageContaining("404");
        assertThat(version(trip)).isEqualTo(before);
        assertThat(db.queryForObject("SELECT count(*) FROM trip.transfer_items",Long.class)).isZero();
        assertThat(routingCalls.get()).isEqualTo(1);
    }
    @Test void recommendationAttributionIsPersistedAndEmittedOnce(){
        UUID trip=create(),day=day(trip),request=UUID.randomUUID();
        var input=item(PLACE);input.put("recommendation_request_id",request.toString());
        String before=match(trip);
        UUID added=id(service.addItem(trip,USER,day,before,"recommendation",input).get("item_id"));
        assertThat(service.addItem(trip,USER,day,before,"recommendation",input).get("item_id").toString()).isEqualTo(added.toString());
        var stored=db.queryForMap("SELECT source,recommendation_request_id FROM trip.itinerary_items WHERE item_id=?",added);
        assertThat(stored.get("source")).isEqualTo("BASIC_RECO");
        assertThat(stored.get("recommendation_request_id")).isEqualTo(request);
        var messages=db.queryForList("SELECT payload::text FROM trip.outbox_events WHERE event_type='trip.item.added.v1'",String.class);
        assertThat(messages).hasSize(1);
        assertThat(messages.getFirst()).contains(request.toString(),added.toString());
    }
    @Test void catalogCurrencyRejectionRollsBackAndRoutingTimeoutFallsBackWithinBound(){
        UUID trip=create(),day=day(trip);long before=version(trip);catalogCurrency="USD";
        assertThatThrownBy(()->add(trip,day,PLACE)).hasMessageContaining("PLACE_CURRENCY_INVALID");
        assertThat(version(trip)).isEqualTo(before);
        assertThat(db.queryForObject("SELECT count(*) FROM trip.itinerary_items",Long.class)).isZero();
        catalogCurrency="VND";UUID a=add(trip,day,PLACE),b=add(trip,day,PLACE2);
        routingDelayMillis=3500;long started=System.nanoTime();
        var result=service.transfer(trip,USER,null,match(trip),map("from_item_id",a,"to_item_id",b,"mode","DRIVE"),true);
        assertThat(java.time.Duration.ofNanos(System.nanoTime()-started)).isLessThan(java.time.Duration.ofSeconds(3));
        assertThat(result.get("fallback")).isEqualTo(true);
        assertThat(result.get("duration_seconds")).isNull();
        assertThat(db.queryForObject("SELECT count(*) FROM trip.route_estimates",Long.class)).isZero();
    }
    @Test void frozenMaximumNameLengthIsPersistedWithoutTruncation(){var input=body();input.put("name","x".repeat(1024));var result=service.create(USER,input);assertThat(result.get("name")).isEqualTo(input.get("name"));}
    @Test void sharedSnapshotCannotRefreshThroughAnotherVisitToALockedPlace(){
        UUID trip=create(),day=day(trip),locked=add(trip,day,PLACE),other=add(trip,day,PLACE);
        service.patchItem(trip,USER,day,locked,match(trip),map("locked",true));
        long before=version(trip);catalogVersion=2;
        assertThatThrownBy(()->service.refresh(trip,USER,match(trip),List.of(other))).hasMessageContaining("ITEM_LOCKED");
        assertThatThrownBy(()->service.addItem(trip,USER,day,match(trip),"locked-place",item(PLACE))).hasMessageContaining("ITEM_LOCKED");
        assertThat(version(trip)).isEqualTo(before);
        assertThat(service.items(trip,USER,day,locked).get("source_version")).isEqualTo(1L);
        assertThat(db.queryForObject("SELECT count(*) FROM trip.itinerary_items",Long.class)).isEqualTo(2);
    }
    @Test void addingRepeatedVisitCannotReplaceCompletedSnapshot(){
        UUID trip=create(),day=day(trip),item=add(trip,day,PLACE);
        service.state(trip,USER,match(trip),"COMPLETED");catalogVersion=2;
        assertThatThrownBy(()->service.addItem(trip,USER,day,match(trip),"completed-place",item(PLACE))).hasMessageContaining("COMPLETED_SNAPSHOT_IMMUTABLE");
        assertThat(service.items(trip,USER,day,item).get("source_version")).isEqualTo(1L);
        assertThat(db.queryForObject("SELECT count(*) FROM trip.itinerary_items",Long.class)).isEqualTo(1);
    }
    @Test void refreshedAndReplacedPlacesUpdateBudgetAndUnknownPriceWarnings(){
        UUID trip=create(),day=day(trip),item=add(trip,day,PLACE);
        assertThat(service.warnings(trip,USER)).doesNotContain("BUDGET_EXCEEDED","PRICE_UNKNOWN");
        catalogVersion=2;catalogPrice=60000;service.refresh(trip,USER,match(trip),List.of(item));
        assertThat(service.warnings(trip,USER)).contains("BUDGET_EXCEEDED");
        catalogPrice=null;service.patchItem(trip,USER,day,item,match(trip),map("place_id",PLACE2));
        assertThat(service.warnings(trip,USER)).contains("PRICE_UNKNOWN").doesNotContain("BUDGET_EXCEEDED");
    }
    @Test void deletionWaitsForUncommittedCreateAndPurgesItBeforeAcknowledging()throws Exception{
        var created=new CountDownLatch(1);var release=new CountDownLatch(1);var deleting=new CountDownLatch(1);
        var executor=Executors.newFixedThreadPool(2);
        try{
            var create=executor.submit(()->new org.springframework.transaction.support.TransactionTemplate(transactions).execute(status->{
                service.create(USER,body());created.countDown();
                try{if(!release.await(10,TimeUnit.SECONDS))throw new IllegalStateException("Test release timeout");}catch(InterruptedException error){throw new IllegalStateException(error);}
                return true;
            }));
            assertThat(created.await(10,TimeUnit.SECONDS)).isTrue();
            var delete=executor.submit(()->{deleting.countDown();events.consume(map("event_id",UUID.randomUUID(),"event_type","identity.user.deletion-requested.v1","schema_version",1,"aggregate_version",1,"payload",map("user_id",USER,"deletion_request_id",UUID.randomUUID())));});
            assertThat(deleting.await(5,TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(()->delete.get(200,TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
            assertThat(db.queryForObject("SELECT count(*) FROM trip.outbox_events WHERE event_type='domain.user-data-deleted.v1'",Long.class)).isZero();
            release.countDown();create.get(10,TimeUnit.SECONDS);delete.get(10,TimeUnit.SECONDS);
            assertThat(db.queryForObject("SELECT count(*) FROM trip.trips",Long.class)).isZero();
            assertThat(db.queryForObject("SELECT count(*) FROM trip.audit_logs WHERE actor_id=?",Long.class,USER)).isZero();
            assertThatThrownBy(()->service.create(USER,body())).hasMessageContaining("USER_DELETED");
        }finally{release.countDown();executor.shutdownNow();}
    }
    @Test void placeUpsertOnlyUpdatesAvailabilityAndPreservesLockedCompletedContent(){
        UUID trip=create(),day=day(trip),item=add(trip,day,PLACE);service.patchItem(trip,USER,day,item,match(trip),map("locked",true));service.state(trip,USER,match(trip),"COMPLETED");
        var payload=snapshot(PLACE);payload.put("status","HIDDEN");payload.put("version",2);payload.put("name","New external content");
        events.consume(map("event_id",UUID.randomUUID(),"event_type","catalog.place.upserted.v1","schema_version",1,"payload",payload));
        var saved=service.items(trip,USER,day,item);assertThat(((Map<?,?>)saved.get("snapshot")).get("name")).isEqualTo("Synthetic licensed place");assertThat(saved.get("source_version")).isEqualTo(1L);assertThat(service.warnings(trip,USER)).contains("PLACE_UNAVAILABLE");
        payload.put("status","PUBLISHED");payload.put("version",1);events.consume(map("event_id",UUID.randomUUID(),"event_type","catalog.place.upserted.v1","schema_version",1,"payload",payload));assertThat(service.warnings(trip,USER)).contains("PLACE_UNAVAILABLE");
    }
    @Test void destinationProjectionChangesWarningsAndRejectsStaleActivation(){
        UUID trip=create();service.segment(trip,USER,null,match(trip),map("destination_id",DEST,"start_date","2026-10-01","end_date","2026-10-05"));
        java.util.function.BiConsumer<String,Long> status=(value,version)->events.consume(map("event_id",UUID.randomUUID(),"event_type","catalog.destination.changed.v1","schema_version",1,"payload",map("destination_id",DEST,"status",value,"version",version)));
        status.accept("INACTIVE",2L);assertThat(service.warnings(trip,USER)).contains("DESTINATION_UNAVAILABLE");long version=version(trip);
        status.accept("ACTIVE",1L);assertThat(version(trip)).isEqualTo(version);assertThat(service.warnings(trip,USER)).contains("DESTINATION_UNAVAILABLE");
        status.accept("ACTIVE",3L);assertThat(service.warnings(trip,USER)).doesNotContain("DESTINATION_UNAVAILABLE");
    }
    @Test void destinationInactivationSerializesBeforeSegmentValidationAndInsert()throws Exception{
        UUID trip=create();String before=match(trip);var inactive=new CountDownLatch(1);var release=new CountDownLatch(1);var adding=new CountDownLatch(1);var executor=Executors.newFixedThreadPool(2);
        try{
            var event=executor.submit(()->new org.springframework.transaction.support.TransactionTemplate(transactions).execute(status->{
                events.consume(map("event_id",UUID.randomUUID(),"event_type","catalog.destination.changed.v1","schema_version",1,"payload",map("destination_id",DEST,"status","INACTIVE","version",2)));
                inactive.countDown();try{if(!release.await(10,TimeUnit.SECONDS))throw new IllegalStateException("Test release timeout");}catch(InterruptedException error){throw new IllegalStateException(error);}return true;
            }));
            assertThat(inactive.await(10,TimeUnit.SECONDS)).isTrue();
            var add=executor.submit(()->{adding.countDown();return service.segment(trip,USER,null,before,map("destination_id",DEST,"start_date","2026-10-01","end_date","2026-10-05"));});
            assertThat(adding.await(5,TimeUnit.SECONDS)).isTrue();assertThatThrownBy(()->add.get(200,TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
            release.countDown();event.get(10,TimeUnit.SECONDS);assertThatThrownBy(()->add.get(10,TimeUnit.SECONDS)).hasCauseInstanceOf(ResponseStatusException.class).hasStackTraceContaining("DESTINATION_UNAVAILABLE");
            assertThat(db.queryForObject("SELECT count(*) FROM trip.trip_destinations",Long.class)).isZero();
        }finally{release.countDown();executor.shutdownNow();}
    }
    @AfterAll static void stop(){stub.stop(0);}
}
