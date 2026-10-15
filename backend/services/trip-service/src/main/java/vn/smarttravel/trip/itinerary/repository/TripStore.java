package vn.smarttravel.trip.itinerary.repository;
import static vn.smarttravel.trip.shared.web.ApiValues.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.time.*;
import java.util.*;

@Component
public class TripStore {
    private final JdbcTemplate db;
    private final ObjectMapper json;
    public TripStore(JdbcTemplate db,ObjectMapper json) { this.db=db; this.json=json; }
    public String encode(Object value) { try{return json.writeValueAsString(value);}catch(Exception e){throw new IllegalArgumentException("Invalid JSON");} }
    @SuppressWarnings("unchecked") public Map<String,Object> decode(Object value) { try{return json.readValue(value.toString(),Map.class);}catch(Exception e){throw new IllegalStateException("Stored JSON invalid");} }
    public Map<String,Object> one(String sql,Object...args) {var rows=db.queryForList(sql,args); require(!rows.isEmpty(),404,"NOT_FOUND"); return rows.getFirst();}
    public Map<String,Object> owner(UUID trip,UUID user,boolean lock) {
        guardUser(user);
        return one("SELECT * FROM trip.trips WHERE trip_id=? AND user_id=? AND deleted_at IS NULL"+(lock?" FOR UPDATE":""),trip,user);
    }
    public void expected(Map<String,Object> trip,String expected) { require(number(trip.get("version"))==version(expected),409,"VERSION_CONFLICT"); }
    public long changed(UUID trip,UUID user,String kind) {
        long v=db.queryForObject("UPDATE trip.trips SET version=version+1,updated_at=now() WHERE trip_id=? RETURNING version",Long.class,trip);
        event(trip,v,"trip.changed.v1",map("trip_id",trip,"user_id",user,"change_kind",Set.of("CREATED","DELETED","STATE_CHANGED").contains(kind)?kind:"UPDATED","version",v));
        db.update("INSERT INTO trip.audit_logs(audit_id,actor_id,actor_type,entity_type,entity_id,action) VALUES (?,?,'USER','trip',?,?)",UUID.randomUUID(),user,trip.toString(),kind);
        return v;
    }
    public void event(UUID aggregate,long version,String type,Object payload) {
        UUID event=UUID.randomUUID(),correlation=UUID.randomUUID();
        var envelope=map("event_id",event,"event_type",type,"schema_version",1,"aggregate_type",type.startsWith("domain.")?"deletion":"trip","aggregate_id",aggregate,"aggregate_version",version,"occurred_at",Instant.now().toString(),"producer","trip","correlation_id",correlation,"causation_id",correlation,"traceparent","00-"+correlation.toString().replace("-","")+"-"+event.toString().replace("-","").substring(0,16)+"-01","payload",payload);
        db.update("INSERT INTO trip.outbox_events(event_id,aggregate_type,aggregate_id,aggregate_version,event_type,payload) VALUES (?, ?, ?, ?, ?, ?::jsonb)",event,envelope.get("aggregate_type"),aggregate.toString(),version,type,encode(envelope));
    }
    public Object interactionsSnapshot(){
        var rows=db.queryForList("SELECT payload::text FROM trip.outbox_events WHERE event_type='trip.item.added.v1' AND occurred_at>=now()-interval '90 days' ORDER BY event_id");
        return vn.smarttravel.trip.shared.web.SnapshotPages.page(rows.stream().map(row->decode(row.get("payload"))).toList());
    }
    public Map<String,Object> tripResponse(Map<String,Object> t) {return map("trip_id",t.get("trip_id"),"owner_id",t.get("user_id"),"name",t.get("title"),"start_date",t.get("start_date").toString(),"end_date",t.get("end_date").toString(),"timezone",t.get("timezone"),"currency",t.get("currency").toString().strip(),"budget",t.get("budget")==null?0:t.get("budget"),"state",t.get("status"),"version",t.get("version"));}
    public Map<String,Object> page(List<?> items,long version) { return map("items",items,"next_cursor",null,"as_of",Instant.now().toString(),"watermark",Math.max(1,version)); }
    public List<Map<String,Object>> queryForList(String sql,Object...args){return db.queryForList(sql,args);}
    public <T>List<T> queryForList(String sql,Class<T>type,Object...args){return db.queryForList(sql,type,args);}
    public <T>T queryForObject(String sql,Class<T>type,Object...args){return db.queryForObject(sql,type,args);}
    public int update(String sql,Object...args){return db.update(sql,args);}
    public void execute(String sql){db.execute(sql);}
    public void lockDestinations(){db.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"trip-destination-mutations");}
    public void lockUser(UUID user){db.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"trip-user:"+user);}
    public void guardUser(UUID user){
        lockUser(user);
        require(db.queryForObject("SELECT count(*) FROM trip.user_tombstones WHERE user_id=?",Long.class,user)==0,403,"USER_DELETED");
        require(db.queryForObject("SELECT count(*) FROM trip.user_status WHERE user_id=? AND status <> 'ACTIVE'",Long.class,user)==0,403,"USER_INACTIVE");
    }
    public List<String> warnings(UUID trip){var row=one("SELECT COALESCE(sum(i.estimated_cost),0) AS cost,count(i.item_id) FILTER(WHERE i.estimated_cost IS NULL) AS unknown,count(i.item_id) FILTER(WHERE p.unavailable_at IS NOT NULL) AS unavailable,t.budget FROM trip.trips t LEFT JOIN trip.itinerary_items i USING(trip_id) LEFT JOIN trip.place_snapshots p ON p.trip_id=i.trip_id AND p.place_id=i.place_id WHERE t.trip_id=? GROUP BY t.budget",trip);var result=new ArrayList<String>();if(row.get("budget")!=null&&new java.math.BigDecimal(row.get("cost").toString()).compareTo(new java.math.BigDecimal(row.get("budget").toString()))>0)result.add("BUDGET_EXCEEDED");if(number(row.get("unknown"))>0)result.add("PRICE_UNKNOWN");if(number(row.get("unavailable"))>0)result.add("PLACE_UNAVAILABLE");if(db.queryForObject("SELECT count(*) FROM trip.trip_destinations d JOIN trip.destination_status s USING(destination_id) WHERE d.trip_id=? AND s.status='INACTIVE'",Long.class,trip)>0)result.add("DESTINATION_UNAVAILABLE");return result;}
    public Map<String,Object> paginate(Map<String,Object>page,int limit,String cursor){require(limit>=1&&limit<=100,400,"INVALID_LIMIT");int offset=0;long version=number(page.get("watermark"));if(cursor!=null){require(cursor.matches("[1-9][0-9]*:[0-9]+"),400,"INVALID_CURSOR");String[]parts=cursor.split(":");require(number(parts[0])==version,409,"CURSOR_VERSION_CONFLICT");long parsed=number(parts[1]);require(parsed<=Integer.MAX_VALUE,400,"INVALID_CURSOR");offset=(int)parsed;}var rows=(List<?>)page.get("items");require(offset<=rows.size(),400,"INVALID_CURSOR");page.put("items",rows.subList(offset,Math.min(rows.size(),offset+limit)));page.put("next_cursor",offset+limit<rows.size()?version+":"+(offset+limit):null);return page;}
}
