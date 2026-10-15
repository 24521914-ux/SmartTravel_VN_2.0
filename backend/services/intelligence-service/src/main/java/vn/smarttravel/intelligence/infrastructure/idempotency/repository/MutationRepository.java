package vn.smarttravel.intelligence.infrastructure.idempotency.repository;

import static vn.smarttravel.intelligence.shared.util.IntelligenceSupport.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class MutationRepository {
    private final JdbcTemplate db;
    public MutationRepository(JdbcTemplate db){this.db=db;}
    public void lock(String scope){db.queryForObject("select pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,scope);}
    public Optional<Map<String,Object>> replay(String scope,UUID actor,String key,String checksum){
        var rows=db.queryForList("select request_hash,response_body from intelligence.idempotency_records where scope=? and actor_key=? and idempotency_key=? and expires_at>now()",scope,actor.toString(),key);if(rows.isEmpty())return Optional.empty();var row=rows.getFirst();if(!checksum.equals(row.get("request_hash")))throw conflict("IDEMPOTENCY_CONFLICT");
        @SuppressWarnings("unchecked") Map<String,Object> response=JSON.convertValue(read(row.get("response_body")),Map.class);return Optional.of(response);
    }
    public void store(String scope,UUID actor,String key,String checksum,int status,Map<String,Object> response){db.update("insert into intelligence.idempotency_records(scope,actor_key,idempotency_key,request_hash,response_status,response_body,expires_at) values(?,?,?,?,?,?::jsonb,now()+interval '24 hours') on conflict(scope,actor_key,idempotency_key) do update set request_hash=excluded.request_hash,response_status=excluded.response_status,response_body=excluded.response_body,created_at=now(),expires_at=excluded.expires_at",scope,actor.toString(),key,checksum,status,json(response));}
}
