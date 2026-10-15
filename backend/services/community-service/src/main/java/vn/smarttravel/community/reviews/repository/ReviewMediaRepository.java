package vn.smarttravel.community.reviews.repository;
import java.util.*;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.*;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
@Repository
public class ReviewMediaRepository {
    private final MongoTemplate mongo;
    public ReviewMediaRepository(MongoTemplate mongo){this.mongo=mongo;}
    @Transactional public void stage(String review,String owner,String key,String checksum,String mime,long size){vn.smarttravel.community.infrastructure.persistence.repository.UserMutationFence.acquire(mongo,owner);var parent=mongo.findOne(Query.query(Criteria.where("_id").is(review).and("user_id").is(owner)),Document.class,"reviews");if(parent==null)throw new ResponseStatusException(HttpStatus.NOT_FOUND);mongo.insert(new Document("_id",UUID.randomUUID().toString()).append("review_id",review).append("owner_id",owner).append("object_key",key).append("checksum",checksum).append("mime",mime).append("size",size).append("status","PENDING"),"review_media");}
    @Transactional public void decision(String owner,String key,boolean approved){vn.smarttravel.community.infrastructure.persistence.repository.UserMutationFence.acquire(mongo,owner);if(mongo.updateFirst(Query.query(Criteria.where("owner_id").is(owner).and("object_key").is(key)),new Update().set("status",approved?"APPROVED":"REJECTED"),"review_media").getMatchedCount()!=1)throw new ResponseStatusException(HttpStatus.NOT_FOUND);}
    public Document get(String owner,String key){var row=mongo.findOne(Query.query(Criteria.where("owner_id").is(owner).and("object_key").is(key)),Document.class,"review_media");if(row==null)throw new ResponseStatusException(HttpStatus.NOT_FOUND);return row;}
}
