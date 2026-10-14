package vn.smarttravel.trip.itinerary.service;
import vn.smarttravel.trip.itinerary.repository.TripStore;
import vn.smarttravel.trip.itinerary.client.*;
import vn.smarttravel.trip.itinerary.service.*;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;
import static vn.smarttravel.trip.itinerary.repository.SqlStatements.*;
import static vn.smarttravel.trip.shared.web.ApiValues.*;

@Service
@Transactional
public class TripService {
    private final TripStore s;
    private final CatalogAdapter catalog;
    private final RoutingAdapter routing;
    public Map<String,Object> paginate(Map<String,Object>page,int limit,String cursor){return s.paginate(page,limit,cursor);}
    public TripService(TripStore s,CatalogAdapter catalog,RoutingAdapter routing) {this.s=s;this.catalog=catalog;this.routing=routing;}
    public List<String> warnings(UUID trip,UUID user){s.owner(trip,user,false);return s.warnings(trip);}
    public Map<String,Object> list(UUID user,int limit,String cursor) {
        s.guardUser(user);require(limit>0&&limit<=100,400,"INVALID_LIMIT");UUID after=cursor==null?new UUID(0,0):id(cursor);
        var rows=s.queryForList(SELECT_TRIPS_14,user,after,limit+1);
        var result=s.page(rows.stream().limit(limit).map(s::tripResponse).toList(),1);
        if(rows.size()>limit)result.put("next_cursor",rows.get(limit-1).get("trip_id").toString());return result;
    }
    public Map<String,Object> create(UUID user,Map<String,Object>b) {
        s.guardUser(user);
        require(s.queryForObject(SELECT_USER_TOMBSTONES_15,Long.class,user)==0,403,"USER_DELETED");
        require(s.queryForObject(SELECT_USER_STATUS_16,Long.class,user)==0,403,"USER_INACTIVE");
        validateTrip(b); UUID trip=UUID.randomUUID();
        s.update(INSERT_TRIPS_17,trip,user,text(b,"name",1024),date(b.get("start_date")),date(b.get("end_date")),b.getOrDefault("budget",0));
        s.event(trip,1,"trip.changed.v1",map("trip_id",trip,"user_id",user,"change_kind","CREATED","version",1));return get(trip,user);
    }
    private void validateTrip(Map<String,Object>b) {require("Asia/Ho_Chi_Minh".equals(b.get("timezone"))&&"VND".equals(b.get("currency")),400,"INVALID_TIMEZONE_CURRENCY");require(!date(b.get("end_date")).isBefore(date(b.get("start_date"))),422,"INVALID_DATE_RANGE");if(b.containsKey("budget"))require(Double.parseDouble(b.get("budget").toString())>=0,400,"INVALID_BUDGET");}
    public Map<String,Object> get(UUID trip,UUID user) {return s.tripResponse(s.owner(trip,user,false));}
    public Map<String,Object> patch(UUID trip,UUID user,String version,Map<String,Object>b) {
        var t=s.owner(trip,user,true);s.expected(t,version);var full=s.tripResponse(t);full.putAll(b);validateTrip(full);
        LocalDate start=date(full.get("start_date")),end=date(full.get("end_date"));
        require(s.queryForObject(SELECT_TRIP_DAYS_18,Long.class,trip,start,end)==0,422,"DAYS_OUTSIDE_DATE_RANGE");
        require(s.queryForObject(SELECT_TRIP_DESTINATIONS_19,Long.class,trip,start,end)==0,422,"SEGMENTS_OUTSIDE_DATE_RANGE");
        s.update(UPDATE_TRIPS_20,text(full,"name",1024),start,end,full.get("budget"),trip);s.changed(trip,user,"UPDATED");return get(trip,user);
    }
    public void delete(UUID trip,UUID user,String version) {var t=s.owner(trip,user,true);s.expected(t,version);s.update(UPDATE_TRIPS_21,trip);s.changed(trip,user,"DELETED");}
    public Map<String,Object> state(UUID trip,UUID user,String version,String state) {var t=s.owner(trip,user,true);s.expected(t,version);require(Set.of("DRAFT","PLANNED","COMPLETED","CANCELLED").contains(state),400,"INVALID_STATE");s.update(UPDATE_TRIPS_22,state,trip);s.changed(trip,user,"STATE_CHANGED");return get(trip,user);}
    private void inRange(Map<String,Object>t,LocalDate start,LocalDate end) {require(!end.isBefore(start)&&!start.isBefore(date(t.get("start_date")))&&!end.isAfter(date(t.get("end_date"))),422,"OUTSIDE_TRIP_DATES");}
    private Map<String,Object> segmentResponse(Map<String,Object>r,long v) {return map("segment_id",r.get("trip_destination_id"),"destination_id",r.get("destination_id"),"start_date",r.get("start_date").toString(),"end_date",r.get("end_date").toString(),"version",v);}
    public Map<String,Object> segments(UUID trip,UUID user,UUID segment) {var t=s.owner(trip,user,false);long v=number(t.get("version"));if(segment!=null)return segmentResponse(s.one(SELECT_TRIP_DESTINATIONS_23,trip,segment),v);return s.page(s.queryForList(SELECT_TRIP_DESTINATIONS_24,trip).stream().map(r->segmentResponse(r,v)).toList(),v);}
    public Map<String,Object> segment(UUID trip,UUID user,UUID segment,String version,Map<String,Object>b) {
        // Shared with destination events, before user/trip locks to avoid the
        // event's destination-to-trip order racing a validated segment insert.
        s.lockDestinations();
        var t=s.owner(trip,user,true);s.expected(t,version);Map<String,Object> old=segment==null?Map.of():s.one(SELECT_TRIP_DESTINATIONS_23,trip,segment);
        UUID dest=id(b.getOrDefault("destination_id",old.get("destination_id")));LocalDate start=date(b.getOrDefault("start_date",old.get("start_date"))),end=date(b.getOrDefault("end_date",old.get("end_date")));inRange(t,start,end);
        require(s.queryForObject(FINAL_REVIEW_SQL_4,Long.class,dest)==0,422,"DESTINATION_UNAVAILABLE");
        var d=catalog.destination(dest);UUID target=segment==null?UUID.randomUUID():segment;
        if(segment==null)s.update(INSERT_TRIP_DESTINATIONS_25,target,trip,dest,d.get("name"),number(d.get("version")),start,end,trip);
        else {require(s.queryForObject(SELECT_TRIP_DAYS_26,Long.class,trip,target,start,end)==0,422,"SEGMENT_HAS_OUTSIDE_DAYS");s.update(UPDATE_TRIP_DESTINATIONS_27,dest,d.get("name"),number(d.get("version")),start,end,trip,target);}
        s.changed(trip,user,"DESTINATION_CHANGED");return segments(trip,user,target);
    }
    public void deleteSegment(UUID trip,UUID user,UUID segment,String version) {var t=s.owner(trip,user,true);s.expected(t,version);s.one(SELECT_TRIP_DESTINATIONS_23,trip,segment);require(s.queryForObject(SELECT_TRIP_DAYS_28,Long.class,trip,segment)==0,422,"SEGMENT_IN_USE");s.update(DELETE_TRIP_DESTINATIONS_29,trip,segment);s.changed(trip,user,"DESTINATION_REMOVED");}
    private Map<String,Object> dayResponse(Map<String,Object>r,long v) {return map("day_id",r.get("day_id"),"date",r.get("local_date").toString(),"version",v);}
    public Map<String,Object> days(UUID trip,UUID user,UUID day) {var t=s.owner(trip,user,false);long v=number(t.get("version"));if(day!=null)return dayResponse(s.one(SELECT_TRIP_DAYS_30,trip,day),v);return s.page(s.queryForList(SELECT_TRIP_DAYS_31,trip).stream().map(r->dayResponse(r,v)).toList(),v);}
    public Map<String,Object> day(UUID trip,UUID user,UUID day,String version,Map<String,Object>b) {var t=s.owner(trip,user,true);s.expected(t,version);LocalDate dt=date(b.get("date"));inRange(t,dt,dt);UUID target=day==null?UUID.randomUUID():day;
        if(day==null)s.update(INSERT_TRIP_DAYS_32,target,trip,dt,trip);
        else {s.one(SELECT_TRIP_DAYS_30,trip,day);s.update(UPDATE_TRIP_DAYS_33,dt,trip,day);}
        s.changed(trip,user,"DAY_CHANGED");return days(trip,user,target);
    }
    public void deleteDay(UUID trip,UUID user,UUID day,String version) {var t=s.owner(trip,user,true);s.expected(t,version);s.one(SELECT_TRIP_DAYS_30,trip,day);s.update(DELETE_TRANSFER_ITEMS_34,trip,day);s.update(DELETE_TRIP_DAYS_35,trip,day);s.changed(trip,user,"DAY_REMOVED");}
    private void snapshot(UUID trip,UUID place,Map<String,Object>p) {
        // A place snapshot is shared by all visits in one trip. Never let a
        // different visit implicitly refresh the saved content of a locked one.
        require(s.queryForObject(FINAL_REVIEW_SQL_5,Long.class,trip,place)==0,422,"ITEM_LOCKED");
        require(s.queryForObject(FINAL_REVIEW_SQL_6,Long.class,trip,place)==0,422,"COMPLETED_SNAPSHOT_IMMUTABLE");
        s.update(INSERT_PLACE_SNAPSHOTS_36,trip,place,p.get("name"),p.getOrDefault("address",""),p.get("latitude"),p.get("longitude"),s.encode(p.getOrDefault("opening_hours",List.of())),number(p.get("source_version")),p.get("price"),s.encode(p));
        s.update(FINAL_REVIEW_SQL_7,trip,place);
    }
    private Map<String,Object> itemResponse(Map<String,Object>r,long v) {var snap=s.decode(r.get("catalog_snapshot"));if(r.get("unavailable_at")!=null)snap.put("status","ARCHIVED");return map("item_id",r.get("item_id"),"place_id",r.get("place_id"),"note",r.get("note"),"duration_minutes",r.get("duration_min"),"locked",r.get("locked"),"rank",r.get("sort_order"),"source_version",r.get("source_version"),"snapshot",snap,"version",v);}
    private List<Map<String,Object>> itemRows(UUID trip,UUID day) {return s.queryForList(SELECT_ITINERARY_ITEMS_37,trip,day);}
    public Map<String,Object> items(UUID trip,UUID user,UUID day,UUID item) {var t=s.owner(trip,user,false);s.one(SELECT_TRIP_DAYS_30,trip,day);long v=number(t.get("version"));var rows=itemRows(trip,day);if(item!=null)return itemResponse(rows.stream().filter(r->item.equals(r.get("item_id"))).findFirst().orElseThrow(()->new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND,"NOT_FOUND")),v);return s.page(rows.stream().map(r->itemResponse(r,v)).toList(),v);}
    public Map<String,Object> addItem(UUID trip,UUID user,UUID day,String version,String key,Map<String,Object>b) {
        var t=s.owner(trip,user,true);require(key!=null&&!key.isBlank()&&key.length()<=160,428,"IDEMPOTENCY_KEY_REQUIRED");
        String hash=hash(s.encode(b));String scope="add-item:"+trip+":"+day;
        var records=s.queryForList(SELECT_IDEMPOTENCY_RECORDS_38,scope,user.toString(),key);
        if(!records.isEmpty()){require(hash.equals(records.getFirst().get("request_hash")),409,"IDEMPOTENCY_CONFLICT");return s.decode(records.getFirst().get("response_body"));}
        s.expected(t,version);s.one(SELECT_TRIP_DAYS_30,trip,day);
        UUID place=id(b.get("place_id"));var p=catalog.place(place);require(number(b.get("duration_minutes"))>=0,400,"INVALID_DURATION");require(b.get("locked") instanceof Boolean,400,"INVALID_LOCKED");snapshot(trip,place,p);
        UUID item=UUID.randomUUID();UUID recommendation=b.get("recommendation_request_id")==null?null:id(b.get("recommendation_request_id"));
        s.update(INSERT_ITINERARY_ITEMS_39,item,trip,day,place,number(b.get("duration_minutes")),text(b,"note",1024),b.get("locked"),p.get("price"),recommendation==null?"MANUAL":"BASIC_RECO",recommendation,trip,day);
        long v=s.changed(trip,user,"ITEM_ADDED");s.event(trip,v,"trip.item.added.v1",map("item_id",item,"trip_id",trip,"user_id",user,"place_id",place,"recommendation_request_id",recommendation));
        var response=items(trip,user,day,item);s.update(DELETE_IDEMPOTENCY_RECORDS_40,scope,user.toString(),key);s.update(INSERT_IDEMPOTENCY_RECORDS_41,scope,user.toString(),key,hash,s.encode(response));return response;
    }
    public static String hash(String text) {try{return HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(text.getBytes(java.nio.charset.StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
    public Map<String,Object> patchItem(UUID trip,UUID user,UUID day,UUID item,String version,Map<String,Object>b) {var t=s.owner(trip,user,true);s.expected(t,version);var old=s.one(SELECT_ITINERARY_ITEMS_42,trip,day,item);
        require(!Boolean.TRUE.equals(old.get("locked"))||(b.size()==1&&Boolean.FALSE.equals(b.get("locked"))),422,"ITEM_LOCKED");
        UUID place=id(b.getOrDefault("place_id",old.get("place_id")));if(!place.equals(old.get("place_id")))snapshot(trip,place,catalog.place(place));
        long duration=number(b.getOrDefault("duration_minutes",old.get("duration_min")));require(duration>=0,400,"INVALID_DURATION");
        require(!b.containsKey("rank"),422,"USE_ATOMIC_ORDER_ENDPOINT");
        s.update(UPDATE_ITINERARY_ITEMS_43,place,b.containsKey("note")?text(b,"note",1024):old.get("note"),duration,b.getOrDefault("locked",old.get("locked")),trip,day,item);
        s.update(FINAL_REVIEW_SQL_8,trip,item);
        s.changed(trip,user,"ITEM_CHANGED");return items(trip,user,day,item);
    }
    public void deleteItem(UUID trip,UUID user,UUID day,UUID item,String version) {var t=s.owner(trip,user,true);s.expected(t,version);var old=s.one(SELECT_ITINERARY_ITEMS_42,trip,day,item);require(!Boolean.TRUE.equals(old.get("locked")),422,"ITEM_LOCKED");s.update(DELETE_ITINERARY_ITEMS_44,trip,day,item);s.changed(trip,user,"ITEM_REMOVED");}
    public Map<String,Object> order(UUID trip,UUID user,UUID day,String version,List<UUID>ids) {var t=s.owner(trip,user,true);s.expected(t,version);s.one(SELECT_TRIP_DAYS_30,trip,day);var rows=itemRows(trip,day);require(ids.size()<=100&&ids.size()==rows.size()&&new HashSet<>(ids).size()==ids.size()&&new HashSet<>(ids).equals(new HashSet<>(rows.stream().map(r->(UUID)r.get("item_id")).toList())),422,"ORDER_MUST_CONTAIN_ALL_ITEMS");for(var row:rows)if(Boolean.TRUE.equals(row.get("locked")))require(ids.indexOf(row.get("item_id"))==number(row.get("sort_order")),422,"ITEM_LOCKED");s.execute(SET_CONSTRAINTS_45);for(int i=0;i<ids.size();i++)s.update(UPDATE_ITINERARY_ITEMS_46,i,trip,day,ids.get(i));long v=s.changed(trip,user,"ITEMS_REORDERED");return map("request_id",UUID.randomUUID(),"status","COMPLETED","version",v);}
    public Map<String,Object> refresh(UUID trip,UUID user,String version,List<UUID> ids) {var t=s.owner(trip,user,true);s.expected(t,version);require(!"COMPLETED".equals(t.get("status")),422,"COMPLETED_SNAPSHOT_IMMUTABLE");require(ids.size()<=100,400,"TOO_MANY_ITEMS");for(UUID item:ids){var r=s.one(SELECT_ITINERARY_ITEMS_47,trip,item);require(!Boolean.TRUE.equals(r.get("locked")),422,"ITEM_LOCKED");UUID place=(UUID)r.get("place_id");snapshot(trip,place,catalog.place(place));}long v=s.changed(trip,user,"SNAPSHOTS_REFRESHED");return map("request_id",UUID.randomUUID(),"status","COMPLETED","version",v);}
    public Map<String,Object> transfers(UUID trip,UUID user,UUID transfer) {var t=s.owner(trip,user,false);long v=number(t.get("version"));if(transfer!=null)return transferResponse(s.one(SELECT_TRANSFER_ITEMS_48,trip,transfer),v);return s.page(s.queryForList(SELECT_TRANSFER_ITEMS_49,trip).stream().map(r->transferResponse(r,v)).toList(),v);}
    private Map<String,Object> transferResponse(Map<String,Object>r,long v) {return map("transfer_id",r.get("transfer_id"),"from_item_id",r.get("from_item_id"),"to_item_id",r.get("to_item_id"),"mode",r.get("transport_mode"),"distance_m",r.get("distance_m"),"duration_seconds",r.get("duration_seconds"),"fallback",r.get("fallback"),"version",v);}
    public Map<String,Object> transfer(UUID trip,UUID user,UUID transfer,String version,Map<String,Object>b,boolean estimate) {var t=s.owner(trip,user,true);s.expected(t,version);var old=transfer==null?Map.<String,Object>of():s.one(SELECT_TRANSFER_ITEMS_48,trip,transfer);UUID from=id(b.getOrDefault("from_item_id",old.get("from_item_id"))),to=id(b.getOrDefault("to_item_id",old.get("to_item_id")));require(!from.equals(to),422,"SAME_ROUTE_ENDPOINT");String mode=b.getOrDefault("mode",old.get("transport_mode")).toString();require(Set.of("WALK","DRIVE","BICYCLE").contains(mode),400,"INVALID_MODE");var a=s.one(SELECT_ITINERARY_ITEMS_50,trip,from);var z=s.one(SELECT_ITINERARY_ITEMS_50,trip,to);var route=routing.estimate(a,z,mode);UUID target=transfer==null?UUID.randomUUID():transfer;
        if(!estimate){s.update(INSERT_TRANSFER_ITEMS_51,target,trip,from,to,mode,route.get("distance_m"),route.get("duration_seconds"),route.get("fallback"),s.encode(route));s.changed(trip,user,"TRANSFER_CHANGED");return transfers(trip,user,target);}
        return map("transfer_id",target,"from_item_id",from,"to_item_id",to,"mode",mode,"distance_m",route.get("distance_m"),"duration_seconds",route.get("duration_seconds"),"fallback",route.get("fallback"),"version",t.get("version"));
    }
    public void deleteTransfer(UUID trip,UUID user,UUID transfer,String version) {var t=s.owner(trip,user,true);s.expected(t,version);s.one(SELECT_TRANSFER_ITEMS_48,trip,transfer);s.update(DELETE_TRANSFER_ITEMS_52,trip,transfer);s.changed(trip,user,"TRANSFER_REMOVED");}
}
