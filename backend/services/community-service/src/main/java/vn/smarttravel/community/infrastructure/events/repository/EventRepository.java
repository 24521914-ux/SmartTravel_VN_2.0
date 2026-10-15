package vn.smarttravel.community.infrastructure.events.repository;

import java.util.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.*;
import org.springframework.stereotype.Repository;
import vn.smarttravel.community.reviews.repository.CommunityRepository;
import vn.smarttravel.community.contributions.repository.ContributionRepository;

@Repository
public class EventRepository {
    private final MongoTemplate mongo;
    private final CommunityRepository reviews;
    private final ContributionRepository contributions;
    private final ObjectMapper json;
    public EventRepository(MongoTemplate mongo,CommunityRepository reviews,ContributionRepository contributions,ObjectMapper json){this.mongo=mongo;this.reviews=reviews;this.contributions=contributions;this.json=json;}
    private Query userQuery(String user){return Query.query(Criteria.where("aggregate_id").is(user).and("action").is("USER_STATUS")).with(org.springframework.data.domain.Sort.by(org.springframework.data.domain.Sort.Direction.DESC,"source_version"));}
    private Query id(String id){return Query.query(Criteria.where("_id").is(id));}
    public boolean allowed(String user){var row=mongo.findOne(userQuery(user),Document.class,"audit_logs");return row==null||"ACTIVE".equals(row.getString("status"));}
    public boolean accept(JsonNode event){
        String eventId=UUID.fromString(event.path("event_id").asText()).toString(),type=event.path("event_type").asText(),producer=event.path("producer").asText();
        if(event.path("schema_version").asInt()!=1||!event.path("payload").isObject())throw new IllegalArgumentException("Invalid event envelope");
        if(!(type.startsWith("catalog.")&&producer.equals("catalog")||type.startsWith("identity.")&&producer.equals("identity")))throw new IllegalArgumentException("Unexpected producer");
        if(mongo.exists(id("domain:"+eventId),"inbox_events"))return false;
        @SuppressWarnings("unchecked") Map<String,Object> payload=json.convertValue(event.path("payload"),Map.class);
        switch(type){
            case "catalog.contribution.applied.v1","catalog.contribution.rejected.v1" -> contributions.result(eventId,payload.get("command_id").toString(),payload.get("contribution_id").toString(),type.endsWith("applied.v1"),payload);
            case "catalog.place.visibility-changed.v1","catalog.place.upserted.v1" -> visibility(payload);
            case "identity.user.status-changed.v1" -> status(payload);
            case "identity.user.deletion-requested.v1" -> delete(payload);
            default -> throw new IllegalArgumentException("Unsupported Community event");
        }
        mongo.insert(new Document("_id","domain:"+eventId).append("consumer_name","domain").append("event_id",eventId).append("processed_at",new Date()).append("producer",producer),"inbox_events");
        return true;
    }
    private void visibility(Map<String,Object> payload){String place=UUID.fromString(payload.get("place_id").toString()).toString();long version=((Number)payload.get("version")).longValue();var old=mongo.findOne(id(place),Document.class,"place_visibility_projections");if(old!=null&&((Number)old.get("source_version")).longValue()>=version)return;mongo.save(new Document("_id",place).append("status",payload.get("status")).append("source_version",version).append("as_of",new Date()),"place_visibility_projections");}
    private void status(Map<String,Object> payload){String user=UUID.fromString(payload.get("user_id").toString()).toString();long version=((Number)payload.get("version")).longValue();vn.smarttravel.community.infrastructure.persistence.repository.UserMutationFence.lock(mongo,user);var key=userQuery(user);var old=mongo.findOne(key,Document.class,"audit_logs");if(old!=null&&((Number)old.get("source_version")).longValue()>=version)return;mongo.insert(new Document("_id",UUID.randomUUID().toString()).append("actor","identity").append("aggregate_id",user).append("action","USER_STATUS").append("correlation_id",UUID.randomUUID().toString()).append("occurred_at",new Date()).append("status",payload.get("status")).append("source_version",version),"audit_logs");}
    private void delete(Map<String,Object> payload){String user=UUID.fromString(payload.get("user_id").toString()).toString(),request=UUID.fromString(payload.get("deletion_request_id").toString()).toString();
        vn.smarttravel.community.infrastructure.persistence.repository.UserMutationFence.lock(mongo,user);
        status(Map.of("user_id",user,"status","DELETED","version",Long.MAX_VALUE));
        var owned=Query.query(Criteria.where("user_id").is(user));var affected=mongo.find(owned,Document.class,"reviews");
        for(var row:affected){mongo.remove(id(row.getString("_id")),"reviews");reviews.reconcile(row.getString("place_id"));}
        mongo.remove(Query.query(Criteria.where("principal").is(user)),"idempotency_keys");mongo.remove(Query.query(Criteria.where("envelope.payload.user_id").is(user)),"outbox_events");mongo.remove(owned,"favorites");mongo.remove(owned,"contributions");
        for(var collection:mongo.find(Query.query(Criteria.where("owner_id").is(user)),Document.class,"collections")){mongo.remove(Query.query(Criteria.where("collection_id").is(collection.getString("_id"))),"collection_items");mongo.remove(id(collection.getString("_id")),"collections");}
        mongo.remove(Query.query(Criteria.where("owner_id").is(user)),"review_media");mongo.remove(Query.query(Criteria.where("owner_id").is(user)),"contribution_media");mongo.remove(Query.query(Criteria.where("reporter_id").is(user)),"review_reports");
        reviews.emit("domain.user-data-deleted.v1",request,1,Map.of("deletion_request_id",request,"service","community","status","COMPLETED","artifact_handling","User reviews, favorites, collections, contributions and owned media removed; ratings reconciled"));
    }
}
