package vn.smarttravel.catalog.infrastructure.persistence.repository;
import java.util.*;
import java.util.function.Supplier;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
@Repository
public class IdempotencyRepository {
    private final JdbcTemplate db;private final ObjectMapper json;
    public IdempotencyRepository(JdbcTemplate db,ObjectMapper json){this.db=db;this.json=json.copy().enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS);}
    @Transactional public Object execute(String actor,String operation,String key,Map<String,Object> input,Supplier<Object> mutation){
        if(key==null||key.isBlank()||key.length()>160)throw new ResponseStatusException(HttpStatus.valueOf(428),"Idempotency-Key required");
        String request;String hash;try{request=json.writeValueAsString(input);hash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(request.getBytes(StandardCharsets.UTF_8)));}catch(Exception error){throw new IllegalArgumentException(error);}
        db.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?,0))::text",String.class,operation+":"+actor+":"+key);
        var rows=db.queryForList("SELECT request_hash,response_body FROM catalog.idempotency_records WHERE scope=? AND actor_key=? AND idempotency_key=? AND expires_at>now()",operation,actor,key);
        if(!rows.isEmpty()){var row=rows.getFirst();if(!hash.equals(row.get("request_hash")))throw new ResponseStatusException(HttpStatus.CONFLICT,"Idempotency key reused with different payload");try{return json.readValue(row.get("response_body").toString(),Map.class);}catch(Exception error){throw new IllegalStateException(error);}}
        db.update("DELETE FROM catalog.idempotency_records WHERE scope=? AND actor_key=? AND idempotency_key=? AND expires_at<=now()",operation,actor,key);
        Object result=mutation.get();String body;try{body=json.writeValueAsString(result);}catch(Exception error){throw new IllegalStateException(error);}
        db.update("INSERT INTO catalog.idempotency_records(scope,actor_key,idempotency_key,request_hash,response_status,response_body,expires_at) VALUES(?,?,?,?,201,?::jsonb,now()+interval '24 hours')",operation,actor,key,hash,body);return result;
    }
}
