package vn.smarttravel.ingestion.source.repository;
import static vn.smarttravel.ingestion.shared.web.ApiValues.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.time.*;
import java.util.*;

@Component
public class PipelineStore {
    private final JdbcTemplate db;
    private final ObjectMapper json;
    public PipelineStore(JdbcTemplate db,ObjectMapper json) { this.db=db; this.json=json; }
    public String encode(Object value) { try{return json.writeValueAsString(value);}catch(Exception e){throw new IllegalArgumentException("Invalid JSON");} }
    @SuppressWarnings("unchecked") public Map<String,Object> decode(Object value) { try{return json.readValue(value.toString(),Map.class);}catch(Exception e){throw new IllegalStateException("Stored JSON invalid");} }
    public void lockActor(UUID actor){db.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"ingestion-user:"+actor);}
    public void guardActor(UUID actor){lockActor(actor);require(db.queryForObject("SELECT count(*) FROM ingestion.user_tombstones WHERE user_id=?",Long.class,actor)==0,403,"USER_DELETED");require(db.queryForObject("SELECT count(*) FROM ingestion.user_status WHERE user_id=? AND status<>'ACTIVE'",Long.class,actor)==0,403,"USER_INACTIVE");}
    public Map<String,Object> one(String sql,Object...args) {var rows=db.queryForList(sql,args); require(!rows.isEmpty(),404,"NOT_FOUND"); return rows.getFirst();}
    public void event(UUID aggregate,long version,String type,Object payload) {
        UUID event=UUID.randomUUID(),correlation=UUID.randomUUID();
        var envelope=map("event_id",event,"event_type",type,"schema_version",1,"aggregate_type",type.startsWith("domain.")?"deletion":type.startsWith("ingestion.source")?"source":"import","aggregate_id",aggregate,"aggregate_version",version,"occurred_at",Instant.now().toString(),"producer","ingestion","correlation_id",correlation,"causation_id",correlation,"traceparent","00-"+correlation.toString().replace("-","")+"-"+event.toString().replace("-","").substring(0,16)+"-01","payload",payload);
        db.update("INSERT INTO ingestion.outbox_events(event_id,aggregate_type,aggregate_id,aggregate_version,event_type,payload) VALUES (?, ?, ?, ?, ?, ?::jsonb)",event,envelope.get("aggregate_type"),aggregate.toString(),version,type,encode(envelope));
    }
    public Map<String,Object> page(List<?> items,long version) { return map("items",items,"next_cursor",null,"as_of",Instant.now().toString(),"watermark",Math.max(1,version)); }
    public List<Map<String,Object>> queryForList(String sql,Object...args){return db.queryForList(sql,args);}
    public <T>List<T> queryForList(String sql,Class<T>type,Object...args){return db.queryForList(sql,type,args);}
    public <T>T queryForObject(String sql,Class<T>type,Object...args){return db.queryForObject(sql,type,args);}
    public int update(String sql,Object...args){return db.update(sql,args);}
    public void execute(String sql){db.execute(sql);}
    public Map<String,Object> paginate(Map<String,Object>page,int limit,String cursor){require(limit>=1&&limit<=100,400,"INVALID_LIMIT");int offset=0;long version=number(page.get("watermark"));if(cursor!=null){require(cursor.matches("[1-9][0-9]*:[0-9]+"),400,"INVALID_CURSOR");String[]parts=cursor.split(":");require(number(parts[0])==version,409,"CURSOR_VERSION_CONFLICT");long parsed=number(parts[1]);require(parsed<=Integer.MAX_VALUE,400,"INVALID_CURSOR");offset=(int)parsed;}var rows=(List<?>)page.get("items");require(offset<=rows.size(),400,"INVALID_CURSOR");page.put("items",rows.subList(offset,Math.min(rows.size(),offset+limit)));page.put("next_cursor",offset+limit<rows.size()?version+":"+(offset+limit):null);return page;}
}
