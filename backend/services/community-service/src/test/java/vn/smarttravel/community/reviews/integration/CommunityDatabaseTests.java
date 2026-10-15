package vn.smarttravel.community.reviews.integration;

import java.util.*;
import java.net.InetSocketAddress;
import com.sun.net.httpserver.HttpServer;
import com.mongodb.client.MongoClients;
import com.mongodb.client.MongoClient;
import org.bson.Document;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.context.annotation.*;
import org.springframework.data.mongodb.MongoTransactionManager;
import org.springframework.data.mongodb.core.*;
import org.springframework.data.mongodb.core.query.*;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import vn.smarttravel.community.reviews.client.CatalogClient;
import vn.smarttravel.community.reviews.repository.CommunityRepository;
import vn.smarttravel.community.reviews.service.CommunityService;
import vn.smarttravel.community.collections.repository.CollectionRepository;
import vn.smarttravel.community.contributions.repository.ContributionRepository;
import static org.assertj.core.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="COMMUNITY_DB_TESTS",matches="true")
class CommunityDatabaseTests {
    static final String USER="10000000-0000-0000-0000-000000000001",OTHER="10000000-0000-0000-0000-000000000002",PLACE="20000000-0000-0000-0000-000000000001";
    static java.nio.file.Path mediaRoot;static HttpServer stub;static AnnotationConfigApplicationContext context;static MongoTemplate mongo;static CommunityService reviews;static CollectionRepository collections;
    static volatile boolean unavailable=false;
    @Configuration @EnableTransactionManagement static class Config {
        @Bean MongoClient client(){return MongoClients.create(System.getenv("MONGODB_URI"));}
        @Bean SimpleMongoClientDatabaseFactory factory(MongoClient client){return new SimpleMongoClientDatabaseFactory(client,"community_db");}
        @Bean MongoTemplate mongo(SimpleMongoClientDatabaseFactory factory){return new MongoTemplate(factory);}
        @Bean MongoTransactionManager transactionManager(SimpleMongoClientDatabaseFactory factory){return new MongoTransactionManager(factory);}
        @Bean CatalogClient catalog(){return new CatalogClient("http://127.0.0.1:"+stub.getAddress().getPort(),"fixture");}
        @Bean com.fasterxml.jackson.databind.ObjectMapper json(){return new com.fasterxml.jackson.databind.ObjectMapper();}
        @Bean vn.smarttravel.community.infrastructure.events.repository.EventRepository events(MongoTemplate mongo,CommunityRepository reviews,ContributionRepository contributions,com.fasterxml.jackson.databind.ObjectMapper json){return new vn.smarttravel.community.infrastructure.events.repository.EventRepository(mongo,reviews,contributions,json);}
        @Bean vn.smarttravel.community.infrastructure.events.service.EventService eventService(vn.smarttravel.community.infrastructure.events.repository.EventRepository repository){return new vn.smarttravel.community.infrastructure.events.service.EventService(repository);}
        @Bean vn.smarttravel.community.reviews.repository.ReviewMediaRepository mediaRepository(MongoTemplate mongo){return new vn.smarttravel.community.reviews.repository.ReviewMediaRepository(mongo);}
        @Bean vn.smarttravel.community.reviews.service.UgcMediaService media(vn.smarttravel.community.reviews.repository.ReviewMediaRepository repo)throws Exception{mediaRoot=java.nio.file.Files.createTempDirectory("community-media-test-");return new vn.smarttravel.community.reviews.service.UgcMediaService(repo,mediaRoot.toString(),"http://127.0.0.1:"+stub.getAddress().getPort());}
        @Bean CommunityRepository repository(MongoTemplate mongo,CatalogClient catalog){return new CommunityRepository(mongo,catalog);}
        @Bean CommunityService reviews(CommunityRepository repo){return new CommunityService(repo);}
        @Bean CollectionRepository collections(MongoTemplate mongo,CatalogClient catalog){return new CollectionRepository(mongo,catalog);}
        @Bean ContributionRepository contributions(MongoTemplate mongo,CommunityRepository events,CatalogClient catalog){return new ContributionRepository(mongo,events,catalog);}
    }
    @BeforeAll static void setup()throws Exception{
        stub=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);stub.createContext("/internal/v1/places/validate",exchange->{var request=new com.fasterxml.jackson.databind.ObjectMapper().readTree(exchange.getRequestBody());String id=request.path("ids").get(0).asText();byte[] content=new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsBytes(Map.of("items",List.of(Map.of("place_id",id,"public",true,"version",1)),"missing_ids",List.of()));exchange.getResponseHeaders().add("Content-Type","application/json");exchange.sendResponseHeaders(unavailable?503:200,content.length);try(var out=exchange.getResponseBody()){out.write(content);}});stub.createContext("/scan",exchange->{byte[] content="{\"clean\":true}".getBytes(java.nio.charset.StandardCharsets.UTF_8);exchange.getResponseHeaders().add("Content-Type","application/json");exchange.sendResponseHeaders(unavailable?503:200,content.length);exchange.getResponseBody().write(content);exchange.close();});stub.start();
        stub.createContext("/internal/v1/places/batch",exchange->{byte[] content=new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsBytes(Map.of("items",List.of(Map.of("place_id",PLACE,"status","PUBLISHED","version",1))));exchange.getResponseHeaders().set("Content-Type","application/json");exchange.sendResponseHeaders(unavailable?503:200,content.length);exchange.getResponseBody().write(content);exchange.close();});
        context=new AnnotationConfigApplicationContext(Config.class);mongo=context.getBean(MongoTemplate.class);reviews=context.getBean(CommunityService.class);collections=context.getBean(CollectionRepository.class);
    }
    @AfterAll static void close()throws Exception{if(context!=null)context.close();if(stub!=null)stub.stop(0);if(mediaRoot!=null)try(var files=java.nio.file.Files.walk(mediaRoot)){for(var file:files.sorted(java.util.Comparator.reverseOrder()).toList()){if(!file.normalize().startsWith(mediaRoot.normalize()))throw new IllegalStateException("Unexpected test path");java.nio.file.Files.delete(file);}}}
    @BeforeEach void clear(){for(String name:List.of("reviews","rating_summaries","favorites","collections","collection_items","collection_visibility_events","outbox_events","moderation_actions","contributions","inbox_events","audit_logs","review_media","contribution_media","place_visibility_projections","user_mutation_fences"))mongo.remove(new Query(),name);unavailable=false;}
    @Test void approvedEditHideRestoreDeleteReconcilesSummaryAndCrossUserFails(){
        var row=(Document)reviews.createReview(USER,PLACE,5,"Great place");String id=row.getString("_id");assertThat(reviews.reviews(PLACE)).asList().isEmpty();
        reviews.moderate(OTHER,id,1,"APPROVE","validated");assertSummary(1,5);
        assertThatThrownBy(()->reviews.editReview(OTHER,id,2,1,"forged",false)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);assertSummary(1,5);
        reviews.editReview(USER,id,2,4,"updated review",false);assertSummary(0,0);
        reviews.moderate(OTHER,id,3,"APPROVE","approved");assertSummary(1,4);
        reviews.moderate(OTHER,id,4,"HIDE","reported");assertSummary(0,0);
        reviews.moderate(OTHER,id,5,"RESTORE","checked");assertSummary(1,4);
        reviews.editReview(USER,id,6,null,null,true);assertSummary(0,0);
        assertThat(mongo.count(new Query(),"outbox_events")).isEqualTo(14);
    }
    private void assertSummary(int count,long sum){var summary=mongo.findOne(Query.query(Criteria.where("_id").is(PLACE)),Document.class,"rating_summaries");assertThat(summary.getInteger("count")).isEqualTo(count);assertThat(((Number)summary.get("sum")).longValue()).isEqualTo(sum);}
    @Test void favoriteIdempotenceAndDependencyFailureClosesWrites(){reviews.favorite(USER,PLACE,true);reviews.favorite(USER,PLACE,true);assertThat(mongo.count(new Query(),"favorites")).isEqualTo(1);assertThat(mongo.count(new Query(),"outbox_events")).isEqualTo(1);reviews.favorite(USER,PLACE,false);reviews.favorite(USER,PLACE,false);assertThat(mongo.count(new Query(),"outbox_events")).isEqualTo(2);unavailable=true;assertThatThrownBy(()->reviews.createReview(USER,PLACE,4,"pending")).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);assertThat(mongo.count(new Query(),"reviews")).isZero();}
    @Test void privateCollectionsAndReorderValidateExactSetAndParentVersion(){
        var collection=collections.create(USER,Map.of("name","Private list"));String id=collection.getString("_id");assertThatThrownBy(()->collections.get(id,OTHER,false)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        var item=collections.add(id,USER,1,Map.of("place_id",PLACE));String itemId=item.getString("_id");
        assertThatThrownBy(()->collections.reorder(id,USER,2,List.of(itemId,itemId))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThat(collections.reorder(id,USER,2,List.of(itemId))).hasSize(1);
        assertThatThrownBy(()->collections.reorder(id,USER,2,List.of(itemId))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        collections.update(id,USER,3,Map.of("visibility","PUBLIC"));assertThat(collections.get(id,null,false).get("visibility")).isEqualTo("PUBLIC");
    }
    @Test void batchEnrichmentIsAuthorizedAndDependencyFailureClosesReads(){
        String id=collections.create(USER,Map.of("name","Enriched private list")).getString("_id");collections.add(id,USER,1,Map.of("place_id",PLACE));
        assertThat(collections.items(id,USER).getFirst().get("catalog_place")).isInstanceOf(Map.class);
        unavailable=true;
        assertThatThrownBy(()->collections.items(id,OTHER)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class).satisfies(error->assertThat(((org.springframework.web.server.ResponseStatusException)error).getStatusCode().value()).isEqualTo(404));
        assertThatThrownBy(()->collections.items(id,USER)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class).satisfies(error->assertThat(((org.springframework.web.server.ResponseStatusException)error).getStatusCode().value()).isEqualTo(503));
    }
    @Test void deletionFencePreventsNewCollectionAndReviewAfterDeletionAcknowledges()throws Exception{
        collections.create(USER,Map.of("name","Before deletion"));
        var tx=new org.springframework.transaction.support.TransactionTemplate(context.getBean(MongoTransactionManager.class));
        var acquired=new java.util.concurrent.CountDownLatch(1);var release=new java.util.concurrent.CountDownLatch(1);var pool=java.util.concurrent.Executors.newSingleThreadExecutor();
        var events=context.getBean(vn.smarttravel.community.infrastructure.events.service.EventService.class);var json=context.getBean(com.fasterxml.jackson.databind.ObjectMapper.class);
        var event=json.valueToTree(Map.of("event_id",UUID.randomUUID().toString(),"event_type","identity.user.deletion-requested.v1","schema_version",1,"producer","identity","payload",Map.of("user_id",USER,"deletion_request_id",UUID.randomUUID().toString())));
        try{
            var deleting=pool.submit(()->tx.execute(status->{events.accept(event);acquired.countDown();try{if(!release.await(10,java.util.concurrent.TimeUnit.SECONDS))throw new IllegalStateException("Fence test timeout");}catch(InterruptedException error){Thread.currentThread().interrupt();throw new IllegalStateException(error);}return true;}));
            assertThat(acquired.await(10,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(()->collections.create(USER,Map.of("name","Racing PII"))).isInstanceOf(RuntimeException.class);
            release.countDown();assertThat(deleting.get(10,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(()->collections.create(USER,Map.of("name","After deletion"))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
            assertThatThrownBy(()->reviews.createReview(USER,PLACE,4,"After deletion review")).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
            assertThat(mongo.count(new Query(),"collections")).isZero();assertThat(mongo.count(new Query(),"reviews")).isZero();
        }finally{release.countDown();pool.shutdownNow();}
    }
    @Test void contributionMissingAckStaysApplyingAndRejectedAckIsIdempotent(){
        var repo=context.getBean(ContributionRepository.class);var contribution=repo.create(USER,Map.of("type","EDIT","target_id",PLACE,"expected_version",1,"fields",Map.of("name","Proposed name")));String id=contribution.getString("_id");
        var applying=repo.moderate(id,OTHER,1,"APPROVE","reviewed");assertThat(applying.get("status")).isEqualTo("APPLYING");assertThat(repo.get(id,USER).get("status")).isEqualTo("APPLYING");
        assertThatThrownBy(()->repo.withdraw(id,USER,2)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        String command=applying.getString("command_id"),event=UUID.randomUUID().toString();var rejection=Map.<String,Object>of("command_id",command,"contribution_id",id,"error_code","VERSION_CONFLICT","reason","stale version");
        assertThat(repo.result(event,command,id,false,rejection)).isTrue();assertThat(repo.result(event,command,id,false,rejection)).isFalse();assertThat(repo.get(id,USER).get("status")).isEqualTo("APPLY_FAILED");
        assertThat(mongo.count(new Query(),"inbox_events")).isEqualTo(1);assertThatThrownBy(()->repo.edit(id,OTHER,3,Map.of("fields",Map.of("name","forged")))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThatThrownBy(()->repo.create(USER,Map.of("type","ADD","fields",Map.of("status","PUBLISHED")))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    }
    @Test void versionedVisibilityDeletionAndStatusCannotResurrectDeletedUser(){
        var events=context.getBean(vn.smarttravel.community.infrastructure.events.service.EventService.class);var json=context.getBean(com.fasterxml.jackson.databind.ObjectMapper.class);
        var row=(Document)reviews.createReview(USER,PLACE,5,"Synthetic rating");reviews.moderate(OTHER,row.getString("_id"),1,"APPROVE","checked");reviews.favorite(USER,PLACE,true);collections.create(USER,Map.of("name","Private PII"));
        var visible=json.valueToTree(Map.of("event_id",UUID.randomUUID().toString(),"event_type","catalog.place.visibility-changed.v1","schema_version",1,"producer","catalog","payload",Map.of("place_id",PLACE,"status","HIDDEN","version",2)));
        assertThat(events.accept(visible)).isTrue();assertThat(events.accept(visible)).isFalse();events.accept(json.valueToTree(Map.of("event_id",UUID.randomUUID().toString(),"event_type","catalog.place.visibility-changed.v1","schema_version",1,"producer","catalog","payload",Map.of("place_id",PLACE,"status","PUBLISHED","version",1))));assertThat(mongo.findOne(Query.query(Criteria.where("_id").is(PLACE)),Document.class,"place_visibility_projections").get("status")).isEqualTo("HIDDEN");
        var deletion=json.valueToTree(Map.of("event_id",UUID.randomUUID().toString(),"event_type","identity.user.deletion-requested.v1","schema_version",1,"producer","identity","payload",Map.of("user_id",USER,"deletion_request_id",UUID.randomUUID().toString())));events.accept(deletion);events.accept(deletion);assertThat(events.allowed(USER)).isFalse();assertThat(mongo.count(new Query(),"reviews")).isZero();assertThat(mongo.count(new Query(),"collections")).isZero();assertSummary(0,0);
        events.accept(json.valueToTree(Map.of("event_id",UUID.randomUUID().toString(),"event_type","identity.user.status-changed.v1","schema_version",1,"producer","identity","payload",Map.of("user_id",USER,"status","ACTIVE","version",99))));assertThat(events.allowed(USER)).isFalse();assertThat(mongo.count(Query.query(Criteria.where("envelope.event_type").is("domain.user-data-deleted.v1")),"outbox_events")).isEqualTo(1);
    }
    @Test void concurrentApprovedReviewsReconcileWithoutLostCount()throws Exception{
        var a=(Document)reviews.createReview(USER,PLACE,5,"First synthetic");var b=(Document)reviews.createReview(OTHER,PLACE,3,"Second synthetic");var pool=java.util.concurrent.Executors.newFixedThreadPool(2);var start=new java.util.concurrent.CountDownLatch(1);
        try{var one=pool.submit(()->{start.await();reviews.moderate(OTHER,a.getString("_id"),1,"APPROVE","checked");return true;});var two=pool.submit(()->{start.await();reviews.moderate(USER,b.getString("_id"),1,"APPROVE","checked");return true;});start.countDown();assertThat(one.get()).isTrue();assertThat(two.get()).isTrue();assertSummary(2,8);}finally{pool.shutdownNow();}
    }
    @Test void concurrentCollectionReorderHasOneWinner()throws Exception{
        var row=collections.create(USER,Map.of("name","Concurrent list"));String id=row.getString("_id"),item=collections.add(id,USER,1,Map.of("place_id",PLACE,"note","note")).getString("_id");var pool=java.util.concurrent.Executors.newFixedThreadPool(2);var start=new java.util.concurrent.CountDownLatch(1);
        try{java.util.List<java.util.concurrent.Future<Boolean>> tasks=new ArrayList<>();for(int n=0;n<2;n++)tasks.add(pool.submit(()->{start.await();try{collections.reorder(id,USER,2,List.of(item));return true;}catch(RuntimeException conflict){return false;}}));start.countDown();assertThat((tasks.get(0).get()?1:0)+(tasks.get(1).get()?1:0)).isEqualTo(1);assertThat(collections.items(id,USER)).hasSize(1);}finally{pool.shutdownNow();}
    }
    @Test void localMediaRejectsMimeCrossOwnerAndQuarantineBeforeApproval(){
        var media=context.getBean(vn.smarttravel.community.reviews.service.UgcMediaService.class);var repo=context.getBean(CommunityRepository.class);var row=(Document)reviews.createReview(USER,PLACE,4,"Media fixture");String id=row.getString("_id");
        assertThatThrownBy(()->media.stage(id,USER,new byte[]{1,2,3,4},"image/png")).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        String key=media.stage(id,USER,new byte[]{(byte)137,80,78,71,13,10,26,10},"image/png");assertThatThrownBy(()->media.approved(USER,key)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThatThrownBy(()->repo.editWithMedia(USER,id,1,4,"Attach fixture",List.of("quarantine/"+OTHER+"/forged"))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);assertThat(mongo.findOne(Query.query(Criteria.where("_id").is(id)),Document.class,"reviews").get("version")).isEqualTo(1L);
        repo.editWithMedia(USER,id,1,4,"Attach fixture",List.of(key));assertThatThrownBy(()->reviews.moderate(OTHER,id,2,"APPROVE","checked")).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);unavailable=true;assertThatThrownBy(()->media.scan(USER,key)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);unavailable=false;media.scan(USER,key);reviews.moderate(OTHER,id,2,"APPROVE","clean");assertThat(media.approved(USER,key)).hasSize(8);assertThatThrownBy(()->media.approved(OTHER,key)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    }
}
