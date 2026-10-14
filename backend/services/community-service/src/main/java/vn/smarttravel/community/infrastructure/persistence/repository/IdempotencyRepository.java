package vn.smarttravel.community.infrastructure.persistence.repository;
import java.util.*;
import java.util.function.Supplier;
import java.nio.charset.StandardCharsets;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.*;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
@Repository
public class IdempotencyRepository {
    private final MongoTemplate mongo;private final ObjectMapper json;
    public IdempotencyRepository(MongoTemplate mongo,ObjectMapper json){this.mongo=mongo;this.json=json.copy().enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS);}
    @Transactional public Object execute(String actor,String operation,String key,Map<String,Object> input,Supplier<Object> mutation){
        if(key==null||key.isBlank()||key.length()>160)throw new ResponseStatusException(HttpStatus.valueOf(428),"Idempotency-Key required");String hash;
        try{hash=HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(json.writeValueAsBytes(input)));}catch(Exception error){throw new IllegalArgumentException(error);}
        var query=Query.query(Criteria.where("principal").is(actor).and("operation").is(operation).and("key").is(key));var row=mongo.findOne(query,Document.class,"idempotency_keys");
        if(row!=null&&row.getDate("expires_at").after(new Date())){if(!hash.equals(row.getString("request_hash")))throw new ResponseStatusException(HttpStatus.CONFLICT,"Idempotency payload conflict");return row.get("response");}
        if(row!=null)mongo.remove(query,"idempotency_keys");
        Object result=mutation.get();Document response;if(result instanceof Document document)response=new Document(document);else try{response=Document.parse(json.writeValueAsString(result));}catch(Exception error){throw new IllegalStateException(error);}
        mongo.insert(new Document("_id",UUID.randomUUID().toString()).append("principal",actor).append("operation",operation).append("key",key).append("request_hash",hash).append("response",response).append("expires_at",new Date(System.currentTimeMillis()+86400000)),"idempotency_keys");return result;
    }
}
