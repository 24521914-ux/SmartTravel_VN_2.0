package vn.smarttravel.community.reviews.repository;

import java.util.*;
import vn.smarttravel.community.reviews.client.CatalogClient;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@Repository
public class CommunityRepository {
    private final MongoTemplate mongo;private final CatalogClient catalog;
    public CommunityRepository(MongoTemplate mongo,CatalogClient catalog){this.mongo=mongo;this.catalog=catalog;}
    private Query id(String id){UUID.fromString(id);return Query.query(Criteria.where("_id").is(id));}
    private Document load(String collection,String id){var row=mongo.findOne(id(id),Document.class,collection);if(row==null)throw new ResponseStatusException(HttpStatus.NOT_FOUND);return row;}
    private void owner(Document row,String user){if(!user.equals(row.getString("user_id")))throw new ResponseStatusException(HttpStatus.FORBIDDEN);}
    private void version(Document row,long expected){if(((Number)row.get("version")).longValue()!=expected)throw new ResponseStatusException(HttpStatus.CONFLICT,"Version conflict");}
    private void validateReview(int rating,String content){if(rating<1||rating>5||content==null||content.isBlank()||content.length()>1024)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid review");}
    private String newId(){return UUID.randomUUID().toString();}
    public void emit(String type,String aggregate,long version,Map<String,Object> payload){
        payload=new LinkedHashMap<>(payload);if(type.equals("community.favorite.changed.v1"))payload.remove("event_id");if(type.equals("community.review.changed.v1")&&"NONE".equals(payload.get("previous_status")))payload.put("previous_status",null);
        if(type.equals("community.contribution.apply-requested.v1")){payload.put("type","ADD_PLACE".equals(payload.get("type"))?"ADD":"EDIT");payload.put("fields",payload.remove("validated_fields"));if(payload.get("expected_version")==null)payload.put("expected_version",0L);}
        String event=newId();Date now=new Date();var envelope=new Document("event_id",event).append("event_type",type).append("schema_version",1).append("aggregate_type",type.equals("domain.user-data-deleted.v1")?"deletion":type.contains("rating-summary")?"rating":type.contains("favorite")?"favorite":type.contains("contribution")?"contribution":"review").append("aggregate_id",aggregate).append("aggregate_version",version).append("occurred_at",now.toInstant().toString()).append("producer","community").append("correlation_id",newId()).append("causation_id",null).append("traceparent","00-"+newId().replace("-","")+"-"+newId().replace("-","").substring(0,16)+"-01").append("payload",new Document(payload));
        mongo.insert(new Document("_id",event).append("envelope",envelope).append("attempts",0).append("available_at",now).append("published_at",null),"outbox_events");
    }
    public void reconcile(String place){
        var approved=mongo.find(Query.query(Criteria.where("place_id").is(place).and("status").is("APPROVED")),Document.class,"reviews");
        long sum=approved.stream().mapToLong(r->r.getInteger("rating")).sum();
        var previous=mongo.findOne(id(place),Document.class,"rating_summaries");long version=previous==null?1:((Number)previous.get("version")).longValue()+1;
        var snapshot=new Document("_id",place).append("count",approved.size()).append("sum",sum).append("version",version).append("as_of",new Date());mongo.save(snapshot,"rating_summaries");
        emit("community.rating-summary.changed.v1",place,version,Map.of("place_id",place,"count",approved.size(),"sum",sum,"version",version,"as_of",snapshot.getDate("as_of").toInstant().toString()));
    }
    private void changed(Document row,String kind,String previous){long v=((Number)row.get("version")).longValue();reconcile(row.getString("place_id"));emit("community.review.changed.v1",row.getString("_id"),v,Map.of("review_id",row.getString("_id"),"user_id",row.getString("user_id"),"place_id",row.getString("place_id"),"status",row.getString("status"),"previous_status",previous,"version",v,"change_kind",kind));}
    @Transactional public Document createReview(String user,String place,int rating,String content){vn.smarttravel.community.infrastructure.persistence.repository.UserMutationFence.acquire(mongo,user);
        UUID.fromString(user);UUID.fromString(place);validateReview(rating,content);catalog.validate(place);Date now=new Date();
        var row=new Document("_id",newId()).append("user_id",user).append("place_id",place).append("rating",rating).append("content",content).append("status","PENDING").append("version",1L).append("created_at",now).append("updated_at",now);mongo.insert(row,"reviews");changed(row,"CREATED","NONE");return row;
    }
    @Transactional public Document editReview(String user,String review,long expected,Integer rating,String content,boolean delete){vn.smarttravel.community.infrastructure.persistence.repository.UserMutationFence.acquire(mongo,user);
        var row=load("reviews",review);owner(row,user);version(row,expected);String previous=row.getString("status");
        if(!delete){validateReview(rating,content);catalog.validate(row.getString("place_id"));row.put("rating",rating);row.put("content",content);}row.put("status",delete?"DELETED":"PENDING");row.put("version",expected+1);row.put("updated_at",new Date());
        replace("reviews",row,expected);changed(row,delete?"DELETED":"UPDATED",previous);return row;
    }
    private void replace(String collection,Document row,long expected){var query=Query.query(Criteria.where("_id").is(row.getString("_id")).and("version").is(expected));if(mongo.findAndReplace(query,row,collection)==null)throw new ResponseStatusException(HttpStatus.CONFLICT,"Version conflict");}
    @Transactional public Document moderate(String reviewer,String review,long expected,String action,String reason){
        if(reason==null||reason.isBlank())throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Reason required");var row=load("reviews",review);vn.smarttravel.community.infrastructure.persistence.repository.UserMutationFence.acquire(mongo,row.getString("user_id"));version(row,expected);String previous=row.getString("status");
        String status=switch(action){case "APPROVE","RESTORE"->"APPROVED";case "REJECT"->"REJECTED";case "HIDE"->"HIDDEN";default->throw new ResponseStatusException(HttpStatus.BAD_REQUEST);};
        if(status.equals("APPROVED")){catalog.validate(row.getString("place_id"));for(Object key:(List<?>)row.getOrDefault("media_keys",List.of()))if(!mongo.exists(Query.query(Criteria.where("object_key").is(key).and("review_id").is(review).and("owner_id").is(row.getString("user_id")).and("status").is("APPROVED")),"review_media"))throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,"Unapproved review media");}row.put("status",status);row.put("version",expected+1);row.put("updated_at",new Date());replace("reviews",row,expected);
        mongo.insert(new Document("_id",newId()).append("aggregate_id",review).append("actor_id",reviewer).append("reason",reason).append("action",action).append("occurred_at",new Date()),"moderation_actions");changed(row,"MODERATED",previous);return row;
    }
    public List<Document> reviews(String place){return mongo.find(Query.query(Criteria.where("place_id").is(place).and("status").is("APPROVED")).with(org.springframework.data.domain.Sort.by("_id")),Document.class,"reviews");}
    @Transactional public void favorite(String user,String place,boolean enabled){vn.smarttravel.community.infrastructure.persistence.repository.UserMutationFence.acquire(mongo,user);
        var query=Query.query(Criteria.where("user_id").is(user).and("place_id").is(place));boolean changed;
        if(enabled){catalog.validate(place);var result=mongo.upsert(query,new Update().setOnInsert("_id",newId()).setOnInsert("user_id",user).setOnInsert("place_id",place).setOnInsert("created_at",new Date()),"favorites");changed=result.getUpsertedId()!=null;}
        else changed=mongo.remove(query,"favorites").getDeletedCount()>0;
        if(changed){String event=newId();emit("community.favorite.changed.v1",event,1,Map.of("user_id",user,"place_id",place,"action",enabled?"ADDED":"REMOVED","event_id",event,"occurred_at",new Date().toInstant().toString()));}
    }
    public List<Document> favorites(String user){return mongo.find(Query.query(Criteria.where("user_id").is(user)).with(org.springframework.data.domain.Sort.by("_id")),Document.class,"favorites");}
    private void attach(Document review,List<String> keys){if(keys==null||keys.size()>100||new HashSet<>(keys).size()!=keys.size())throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid media references");for(String key:keys){var media=mongo.findOne(Query.query(Criteria.where("object_key").is(key).and("owner_id").is(review.getString("user_id")).and("review_id").is(review.getString("_id")).and("status").ne("REJECTED")),Document.class,"review_media");if(media==null)throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,"Media ownership/reference mismatch");}mongo.updateFirst(id(review.getString("_id")),new Update().set("media_keys",keys),"reviews");review.put("media_keys",keys);}
    @Transactional public Document createWithMedia(String user,String place,int rating,String content,List<String> keys){var row=createReview(user,place,rating,content);attach(row,keys);return row;}
    @Transactional public Document editWithMedia(String user,String review,long version,int rating,String content,List<String> keys){var row=editReview(user,review,version,rating,content,false);attach(row,keys);return row;}
}
