package vn.smarttravel.community.reviews.repository;
import java.util.*;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.*;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
@Repository
public class ModerationRepository {
    private final MongoTemplate mongo;
    public ModerationRepository(MongoTemplate mongo){this.mongo=mongo;}
    @Transactional public Document report(String review,String user,String reason){vn.smarttravel.community.infrastructure.persistence.repository.UserMutationFence.acquire(mongo,user);if(reason==null||reason.isBlank()||reason.length()>1024)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Reason required");var row=mongo.findOne(Query.query(Criteria.where("_id").is(review).and("status").is("APPROVED")),Document.class,"reviews");if(row==null)throw new ResponseStatusException(HttpStatus.NOT_FOUND);var query=Query.query(Criteria.where("review_id").is(review).and("reporter_id").is(user));var previous=mongo.findOne(query,Document.class,"review_reports");if(previous!=null)return previous;var report=new Document("_id",UUID.randomUUID().toString()).append("review_id",review).append("reporter_id",user).append("reason",reason).append("status","OPEN").append("version",1L).append("created_at",new Date());mongo.insert(report,"review_reports");return report;}
    public List<Document> queue(String collection){
        var rows=mongo.find(Query.query(Criteria.where("status").is(collection.equals("reviews")?"PENDING":"OPEN")).with(org.springframework.data.domain.Sort.by("_id")),Document.class,collection);
        if(collection.equals("review_reports"))for(var row:rows){
            var query=Query.query(Criteria.where("_id").is(row.getString("review_id")));query.fields().include("content").include("place_id");
            var review=mongo.findOne(query,Document.class,"reviews");
            if(review!=null){row.put("review_content",review.getString("content"));row.put("place_id",review.getString("place_id"));}
        }
        return rows;
    }
    @Transactional public Document moderate(String report,String actor,long version,String action,String reason){if(reason==null||reason.isBlank()||!Set.of("APPROVE","REJECT","HIDE","RESTORE").contains(action))throw new ResponseStatusException(HttpStatus.BAD_REQUEST);var query=Query.query(Criteria.where("_id").is(report).and("version").is(version).and("status").is("OPEN"));var row=mongo.findOne(query,Document.class,"review_reports");if(row==null)throw new ResponseStatusException(HttpStatus.CONFLICT);mongo.updateFirst(query,new Update().set("status",action.equals("REJECT")?"DISMISSED":"RESOLVED").inc("version",1L),"review_reports");mongo.insert(new Document("_id",UUID.randomUUID().toString()).append("aggregate_id",report).append("actor_id",actor).append("reason",reason).append("action",action).append("occurred_at",new Date()),"moderation_actions");row.put("version",version+1);return row;}
    public List<Document> ratings(List<String> ids){for(String id:ids)UUID.fromString(id);if(ids.size()>100)throw new ResponseStatusException(HttpStatus.BAD_REQUEST);return mongo.find(Query.query(Criteria.where("_id").in(ids)),Document.class,"rating_summaries");}
    public List<Document> snapshot(){return mongo.find(new Query().with(org.springframework.data.domain.Sort.by("_id")),Document.class,"rating_summaries");}
}
