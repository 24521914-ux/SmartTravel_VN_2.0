package vn.smarttravel.community.infrastructure.persistence.repository;

import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.UUID;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Call inside the mutation transaction. The shared write serializes deletion with new UGC. */
public final class UserMutationFence {
    private UserMutationFence() {}
    private static Query key(String user){return Query.query(Criteria.where("_id").is(UUID.nameUUIDFromBytes(("community-user-fence:"+user).getBytes(StandardCharsets.UTF_8)).toString()));}
    public static void acquire(MongoTemplate mongo,String user){
        lock(mongo,user);
        var status=mongo.findOne(Query.query(Criteria.where("aggregate_id").is(user).and("action").is("USER_STATUS")).with(org.springframework.data.domain.Sort.by(org.springframework.data.domain.Sort.Direction.DESC,"source_version")),Document.class,"audit_logs");
        if(status!=null&&!"ACTIVE".equals(status.getString("status")))throw new ResponseStatusException(HttpStatus.FORBIDDEN,"User cannot mutate Community data");
    }
    public static void lock(MongoTemplate mongo,String user){
        UUID.fromString(user);
        mongo.upsert(key(user),new Update().setOnInsert("user_id",user).set("updated_at",new Date()).inc("version",1L),"user_mutation_fences");
    }
}
