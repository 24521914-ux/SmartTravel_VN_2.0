package vn.smarttravel.community.infrastructure.transport.repository;

import java.time.Instant;
import java.util.*;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.*;
import org.springframework.stereotype.Repository;

@Repository
public class OutboxRepository {
    private final MongoTemplate db;
    public OutboxRepository(MongoTemplate db){this.db=db;}
    public List<Map<String,Object>> pending(){
        var query=Query.query(Criteria.where("published_at").is(null).and("attempts").lt(8)
                .and("available_at").lte(new Date())).limit(10).with(org.springframework.data.domain.Sort.by("available_at","_id"));
        var result=new ArrayList<Map<String,Object>>();
        for(var row:db.find(query,Document.class,"outbox_events")){
            String id=row.getString("_id");
            // First write locks the document in the Mongo transaction before a network publish.
            // A competing transaction aborts on write conflict; a crash permits duplicate replay.
            db.updateFirst(Query.query(Criteria.where("_id").is(id)),new Update().inc("dispatch_version",1),"outbox_events");
            var envelope=row.get("envelope",Document.class);
            result.add(Map.of("event_id",UUID.fromString(id),"event_type",envelope.getString("event_type"),"payload",envelope.toJson()));
        }
        return result;
    }
    public void published(UUID event){db.updateFirst(id(event),new Update().set("published_at",new Date()).inc("attempts",1),"outbox_events");}
    public void retry(UUID event){
        var row=db.findOne(id(event),Document.class,"outbox_events");
        if(row==null)throw new IllegalStateException("Outbox event disappeared");
        int attempts=row.getInteger("attempts",0)+1;
        var update=new Update().set("attempts",attempts).set("available_at",Date.from(Instant.now().plusSeconds(1L<<Math.min(attempts-1,8))));
        if(attempts>=8)update.set("failed_at",new Date());
        db.updateFirst(id(event),update,"outbox_events");
    }
    public boolean replay(UUID event){
        long count=db.updateFirst(Query.query(Criteria.where("_id").is(event.toString()).and("published_at").is(null).and("attempts").gte(8)),
                new Update().set("attempts",0).set("available_at",new Date()).unset("failed_at"),"outbox_events").getModifiedCount();
        if(count==1)audit(event.toString(),"OUTBOX_REPLAY_REQUESTED");
        return count==1;
    }
    public void auditReplay(String id){
        UUID parsed;
        try{parsed=UUID.fromString(id);}catch(IllegalArgumentException error){throw new IllegalArgumentException("Replay requires a valid event ID");}
        audit(parsed.toString(),"DLQ_REPLAY_REQUESTED");
    }
    private void audit(String id,String action){db.insert(new Document("_id",UUID.randomUUID().toString()).append("actor","SYSTEM")
            .append("aggregate_id",id).append("action",action).append("correlation_id",UUID.randomUUID().toString()).append("occurred_at",new Date()),"audit_logs");}
    private Query id(UUID id){return Query.query(Criteria.where("_id").is(id.toString()));}
}
