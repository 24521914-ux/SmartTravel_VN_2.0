package vn.smarttravel.catalog.places.repository;

import java.text.Normalizer;
import java.util.*;
import java.time.Instant;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

/** Canonical mutations always lock the parent, retain a snapshot, audit and emit atomically. */
@Repository
public class CatalogRepository {
    private final JdbcTemplate db;
    private final ObjectMapper json;
    public CatalogRepository(JdbcTemplate db, ObjectMapper json) { this.db=db; this.json=json; }
    public static String normalize(String text) {
        return Normalizer.normalize(text, Normalizer.Form.NFD).replaceAll("\\p{M}", "")
                .replace('đ','d').replace('Đ','D').toLowerCase(Locale.ROOT);
    }
    private String encode(Object value) { try { return json.writeValueAsString(value); } catch(Exception e) { throw new IllegalArgumentException("Invalid JSON", e); } }
    private UUID uuid(Object value) { return UUID.fromString(value.toString()); }
    public Map<String,Object> place(UUID id, boolean publicOnly) {
        var rows=db.queryForList("SELECT p.*, ST_Y(location::geometry) lat, ST_X(location::geometry) lon, r.review_count,r.rating_avg FROM catalog.places p LEFT JOIN catalog.place_rating_summary r USING(place_id) WHERE p.place_id=?"+(publicOnly?" AND p.status='PUBLISHED'":""),id);
        if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Place unavailable");
        var result=rows.getFirst(); result.remove("location"); result.remove("search_document");
        result.put("categories",db.queryForList("SELECT category_id FROM catalog.place_categories WHERE place_id=?",id));
        result.put("amenities",db.queryForList("SELECT amenity_id FROM catalog.place_amenities WHERE place_id=?",id));
        result.put("hours",db.queryForList("SELECT * FROM catalog.opening_hours WHERE place_id=? ORDER BY day_of_week,open_time",id));
        result.put("hours_known",!((List<?>)result.get("hours")).isEmpty());
        result.put("opening_exceptions",db.queryForList("SELECT * FROM catalog.opening_exceptions WHERE place_id=? ORDER BY local_date,open_time",id));
        result.put("media",db.queryForList("SELECT m.media_id,m.object_key,pm.alt_text,pm.sort_order FROM catalog.place_media pm JOIN catalog.media_assets m USING(media_id) WHERE pm.place_id=? AND m.moderation_status='APPROVED' ORDER BY sort_order",id));
        result.put("name",result.get("name_vi"));result.put("latitude",result.get("lat"));result.put("longitude",result.get("lon"));
        result.put("category_ids",db.queryForList("SELECT category_id FROM catalog.place_categories WHERE place_id=? ORDER BY category_id",UUID.class,id));
        result.put("tag_ids",db.queryForList("SELECT tag_id FROM catalog.place_tags WHERE place_id=? ORDER BY tag_id",UUID.class,id));
        result.put("amenity_ids",db.queryForList("SELECT amenity_id FROM catalog.place_amenities WHERE place_id=? ORDER BY amenity_id",UUID.class,id));
        result.put("opening_hours",result.get("hours"));result.remove("created_by");result.remove("field_precedence");
        result.put("destination_ids",db.queryForList("WITH RECURSIVE ancestors AS (SELECT geographic_unit_id,parent_id FROM catalog.geographic_units WHERE geographic_unit_id=? UNION SELECT u.geographic_unit_id,u.parent_id FROM catalog.geographic_units u JOIN ancestors a ON a.parent_id=u.geographic_unit_id) SELECT DISTINCT destination_id FROM catalog.destination_geo WHERE geographic_unit_id IN (SELECT geographic_unit_id FROM ancestors) ORDER BY destination_id",UUID.class,result.get("geographic_unit_id")));
        result.put("source_version",result.get("version"));result.put("price",result.get("price_min"));result.put("media_keys",db.queryForList("SELECT m.object_key FROM catalog.place_media p JOIN catalog.media_assets m USING(media_id) WHERE p.place_id=? AND m.moderation_status='APPROVED' AND m.object_key NOT LIKE 'private/%' ORDER BY sort_order",String.class,id));
        result.put("opening_hours",db.queryForList("SELECT day_of_week weekday,to_char(open_time,'HH24:MI') open,to_char(close_time,'HH24:MI') close,end_day_offset=1 overnight FROM catalog.opening_hours WHERE place_id=? ORDER BY day_of_week,open_time",id));

        return result;
    }
    public List<Map<String,Object>> search(Map<String,String> filters) {
        int limit=Integer.parseInt(filters.getOrDefault("limit","20"));
        if(limit<1||limit>100) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid limit");
        var sql=new StringBuilder("SELECT p.place_id,p.name_vi,p.address,p.status,p.version,p.price_min,p.price_max,p.currency,r.rating_avg,r.review_count,ST_Y(location::geometry) lat,ST_X(location::geometry) lon FROM catalog.places p LEFT JOIN catalog.place_rating_summary r USING(place_id) WHERE p.status='PUBLISHED'");
        var args=new ArrayList<Object>();
        if(filters.containsKey("q")&&(filters.get("q").isBlank()||filters.get("q").length()>1024))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid search text");if(filters.containsKey("type")){String type=filters.get("type");if(type.isBlank()||type.length()>1024)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid place type");sql.append(" AND (EXISTS(SELECT 1 FROM catalog.place_categories pc JOIN catalog.categories c USING(category_id) WHERE pc.place_id=p.place_id AND c.code=?) OR EXISTS(SELECT 1 FROM catalog.offerings o WHERE o.place_id=p.place_id AND o.item_type=? AND o.status='PUBLISHED'))");args.add(type);args.add(type.toUpperCase(Locale.ROOT));}if(filters.containsKey("q")) {sql.append(" AND (p.search_document @@ plainto_tsquery('simple',?) OR EXISTS(SELECT 1 FROM catalog.place_aliases a WHERE a.place_id=p.place_id AND a.normalized_alias LIKE ?))"); args.add(normalize(filters.get("q")));args.add("%"+normalize(filters.get("q"))+"%");}
        if(filters.containsKey("categoryId")){sql.append(" AND EXISTS(SELECT 1 FROM catalog.place_categories c WHERE c.place_id=p.place_id AND c.category_id=?)");args.add(uuid(filters.get("categoryId")));}
        if(filters.containsKey("geographicUnitId")){sql.append(" AND p.geographic_unit_id IN (WITH RECURSIVE g AS (SELECT geographic_unit_id FROM catalog.geographic_units WHERE geographic_unit_id=? UNION ALL SELECT u.geographic_unit_id FROM catalog.geographic_units u JOIN g ON u.parent_id=g.geographic_unit_id) SELECT geographic_unit_id FROM g)");args.add(uuid(filters.get("geographicUnitId")));}
        if(filters.containsKey("destinationId")){sql.append(" AND p.geographic_unit_id IN (WITH RECURSIVE g AS (SELECT geographic_unit_id FROM catalog.destination_geo WHERE destination_id=? UNION ALL SELECT u.geographic_unit_id FROM catalog.geographic_units u JOIN g ON u.parent_id=g.geographic_unit_id) SELECT geographic_unit_id FROM g)");args.add(uuid(filters.get("destinationId")));}
        for(String key:List.of("minPrice","maxPrice","minRating")) if(filters.containsKey(key)){sql.append(switch(key){case "minPrice"->" AND p.price_min>=?";case "maxPrice"->" AND p.price_max<=?";default->" AND r.rating_avg>=?";});var amount=new java.math.BigDecimal(filters.get(key));if(amount.signum()<0||key.equals("minRating")&&amount.compareTo(java.math.BigDecimal.valueOf(5))>0)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid search bound");args.add(amount);}
        if(filters.containsKey("minPrice")||filters.containsKey("maxPrice")){sql.append(" AND p.currency=?");args.add(filters.getOrDefault("currency","VND"));}
        if(filters.containsKey("radiusM")) {double radius=Double.parseDouble(filters.get("radiusM"));double lat=Double.parseDouble(filters.get("lat"));double lon=Double.parseDouble(filters.get("lon"));if(!Double.isFinite(radius)||!Double.isFinite(lat)||!Double.isFinite(lon)||radius<=0||radius>100000||Math.abs(lat)>90||Math.abs(lon)>180) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid geo bounds");sql.append(" AND ST_DWithin(p.location,ST_SetSRID(ST_MakePoint(?,?),4326)::geography,?)");args.add(lon);args.add(lat);args.add(radius);}
        if(filters.containsKey("afterId")){sql.append(" AND p.place_id>?");args.add(uuid(filters.get("afterId")));}
        sql.append(" ORDER BY p.place_id LIMIT ?");args.add(limit+1);
        var result=db.queryForList(sql.toString(),args.toArray());for(var row:result){row.put("name",row.get("name_vi"));row.put("latitude",row.get("lat"));row.put("longitude",row.get("lon"));row.put("price",row.get("price_min"));row.putAll(place((UUID)row.get("place_id"),true));row.put("category_ids",db.queryForList("SELECT category_id FROM catalog.place_categories WHERE place_id=? ORDER BY category_id",UUID.class,row.get("place_id")));row.put("tag_ids",db.queryForList("SELECT tag_id FROM catalog.place_tags WHERE place_id=? ORDER BY tag_id",UUID.class,row.get("place_id")));}return result;
    }
    @Transactional
    public Map<String,Object> create(Map<String,Object> input,UUID actor) {vn.smarttravel.catalog.infrastructure.persistence.repository.UserMutationFence.acquire(db,actor);
        input=aliases(input);
        UUID id=input.containsKey("place_id")?uuid(input.get("place_id")):UUID.randomUUID();
        input.putIfAbsent("address",Objects.toString(input.get("name_vi"),""));validate(input);
        db.update("INSERT INTO catalog.places(place_id,geographic_unit_id,name_vi,address,description,location,price_min,price_max,currency,created_by,search_document) VALUES(?,?,?,?,?,ST_SetSRID(ST_MakePoint(?,?),4326)::geography,?,?,?,?,catalog.place_search_document(?,?))",id,uuid(input.get("geographic_unit_id")),input.get("name_vi"),input.get("address"),input.get("description"),input.get("lon"),input.get("lat"),input.get("price_min"),input.get("price_max"),input.getOrDefault("currency","VND"),actor,input.get("name_vi"),input.get("address"));
        if(actor!=null){var precedence=new LinkedHashMap<String,Integer>();for(String field:input.keySet())precedence.put(field,4);db.update("UPDATE catalog.places SET field_precedence=?::jsonb WHERE place_id=?",encode(precedence),id);}related(id,input);snapshot(id,actor,"CREATE"); return place(id,false);
    }
    private void validate(Map<String,Object> input) {
        for(String field:List.of("name_vi","address","geographic_unit_id","lat","lon")) if(input.get(field)==null||input.get(field).toString().isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Missing "+field);
        if(!Double.isFinite(Double.parseDouble(input.get("lat").toString()))||!Double.isFinite(Double.parseDouble(input.get("lon").toString()))||Math.abs(Double.parseDouble(input.get("lat").toString()))>90||Math.abs(Double.parseDouble(input.get("lon").toString()))>180) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid coordinates");
    }
    @Transactional
    public Map<String,Object> update(UUID id,long version,Map<String,Object> input,UUID actor) {vn.smarttravel.catalog.infrastructure.persistence.repository.UserMutationFence.acquire(db,actor);
        return updateAtPriority(id,version,input,actor,4);
    }
    @Transactional
    public Map<String,Object> updateAtPriority(UUID id,long version,Map<String,Object> input,UUID actor,int priority) {vn.smarttravel.catalog.infrastructure.persistence.repository.UserMutationFence.acquire(db,actor);
        input=aliases(input);
        var rows=db.queryForList("SELECT version FROM catalog.places WHERE place_id=? FOR UPDATE",id);
        if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Place unavailable");
        if(((Number)rows.getFirst().get("version")).longValue()!=version) throw new ResponseStatusException(HttpStatus.CONFLICT,"Version conflict");
        var allowed=Set.of("name_vi","name_en","description","address","price_min","price_max","currency","status","category_ids","tag_ids","amenity_ids","opening_hours","opening_exceptions","lat","lon","geographic_unit_id","media_keys","destination_ids");
        if(input.isEmpty()||!allowed.containsAll(input.keySet())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Unsupported place fields");
        String precedence=db.queryForObject("SELECT field_precedence::text FROM catalog.places WHERE place_id=?",String.class,id);Map<String,Integer> ranks;try{@SuppressWarnings("unchecked") Map<String,Integer> stored=json.readValue(precedence,Map.class);ranks=stored;}catch(Exception error){throw new IllegalStateException(error);}
        var currentProtected=place(id,false);
        for(var field:input.entrySet())if(ranks.getOrDefault(field.getKey(),0)>priority&&!Objects.equals(json.valueToTree(field.getValue()),json.valueToTree(currentProtected.get(field.getKey()))))throw new ResponseStatusException(HttpStatus.CONFLICT,"PROTECTED_FIELD_CONFLICT");
        input.entrySet().removeIf(field->ranks.getOrDefault(field.getKey(),0)>priority);if(input.isEmpty())return currentProtected;for(String field:input.keySet())ranks.put(field,priority);
        var assignments=new ArrayList<String>();var args=new ArrayList<Object>();
        for(var field:input.entrySet()){if(field.getKey().endsWith("_ids")||field.getKey().startsWith("opening_")||field.getKey().equals("lat")||field.getKey().equals("lon")||field.getKey().equals("media_keys"))continue;assignments.add(field.getKey()+"=?");args.add(field.getKey().equals("geographic_unit_id")?uuid(field.getValue()):field.getValue());}
        if(input.containsKey("lat")||input.containsKey("lon")){var current=place(id,false);double lat=((Number)input.getOrDefault("lat",current.get("lat"))).doubleValue(),lon=((Number)input.getOrDefault("lon",current.get("lon"))).doubleValue();if(!Double.isFinite(lat)||!Double.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid coordinates");assignments.add("location=ST_SetSRID(ST_MakePoint(?,?),4326)::geography");args.add(lon);args.add(lat);}assignments.add("version=version+1");assignments.add("updated_at=now()");assignments.add("archived_at=CASE WHEN "+(input.containsKey("status")?"?":"status")+"='ARCHIVED' THEN coalesce(archived_at,now()) ELSE NULL END");if(input.containsKey("status"))args.add(input.get("status"));args.add(id);
        db.update("UPDATE catalog.places SET "+String.join(",",assignments)+" WHERE place_id=?",args.toArray());
        if(input.containsKey("name_vi")||input.containsKey("address")) db.update("UPDATE catalog.places SET search_document=catalog.place_search_document(name_vi,address) WHERE place_id=?",id);
        db.update("UPDATE catalog.places SET field_precedence=?::jsonb WHERE place_id=?",encode(ranks),id);
        related(id,input);snapshot(id,actor,"UPDATE");if(input.containsKey("status")) emit("catalog.place.visibility-changed.v1",id,version+1,Map.of("place_id",id,"status",input.get("status"),"version",version+1));return place(id,false);
    }
    public Map<String,Object> aliases(Map<String,Object> input){var result=new LinkedHashMap<>(input);if(result.containsKey("price"))result.put("price_min",result.remove("price"));for(var pair:Map.of("name","name_vi","latitude","lat","longitude","lon").entrySet())if(result.containsKey(pair.getKey())){result.put(pair.getValue(),result.remove(pair.getKey()));}for(String field:List.of("price_min","price_max"))if(result.get(field) instanceof String value)result.put(field,new java.math.BigDecimal(value));return result;}
    private void related(UUID id,Map<String,Object> input){
        if(input.containsKey("geographic_unit_id")&&db.queryForObject("SELECT count(*) FROM catalog.geographic_units WHERE geographic_unit_id=? AND status='ACTIVE' AND valid_from<=current_date AND (valid_to IS NULL OR valid_to>=current_date)",Integer.class,uuid(input.get("geographic_unit_id")))!=1)throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,"Active effective geographic unit required");
        if(input.containsKey("destination_ids")){var desired=new HashSet<>((List<?>)input.get("destination_ids"));var actual=((List<?>)place(id,false).get("destination_ids")).stream().map(Object::toString).collect(java.util.stream.Collectors.toSet());if(!actual.containsAll(desired.stream().map(Object::toString).toList()))throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,"Destination geographic scope mismatch");}
        if(input.containsKey("media_keys")){db.update("DELETE FROM catalog.place_media WHERE place_id=?",id);int rank=0;for(Object key:(List<?>)input.get("media_keys")){var assets=db.queryForList("SELECT media_id FROM catalog.media_assets WHERE object_key=? AND moderation_status='APPROVED' AND object_key NOT LIKE 'private/%'",key);if(assets.isEmpty())throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,"Approved public media required");db.update("INSERT INTO catalog.place_media(place_id,media_id,sort_order) VALUES(?,?,?)",id,assets.getFirst().get("media_id"),rank++);}}

        for(var link:Map.of("category_ids","category","tag_ids","tag","amenity_ids","amenity").entrySet())if(input.containsKey(link.getKey())){String table=switch(link.getValue()){case "category"->"place_categories";case "amenity"->"place_amenities";default->"place_tags";};String foreign=link.getValue()+"_id";db.update("DELETE FROM catalog."+table+" WHERE place_id=?",id);for(Object value:(List<?>)input.get(link.getKey())){String target=link.getValue().equals("category")?"categories":link.getValue().equals("amenity")?"amenities":"tags";if(db.queryForObject("SELECT count(*) FROM catalog."+target+" WHERE "+foreign+"=? AND active",Integer.class,uuid(value))!=1)throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,"Active taxonomy required");db.update("INSERT INTO catalog."+table+"(place_id,"+foreign+") VALUES(?,?)",id,uuid(value));}}
        if(input.containsKey("opening_hours")){db.update("DELETE FROM catalog.opening_hours WHERE place_id=?",id);for(Object value:(List<?>)input.get("opening_hours")){@SuppressWarnings("unchecked")Map<String,Object> hour=(Map<String,Object>)value;String open=Objects.toString(hour.getOrDefault("open_time",hour.get("open"))),close=Objects.toString(hour.getOrDefault("close_time",hour.get("close")));int offset=hour.containsKey("end_day_offset")?((Number)hour.get("end_day_offset")).intValue():Boolean.TRUE.equals(hour.get("overnight"))?1:0;duration(open,close,offset);db.update("INSERT INTO catalog.opening_hours(opening_hour_id,place_id,day_of_week,open_time,close_time,end_day_offset,valid_from,valid_to) VALUES(?,?,?,?::time,?::time,?,?::date,?::date)",UUID.randomUUID(),id,hour.getOrDefault("day_of_week",hour.get("weekday")),open,close,offset,hour.getOrDefault("valid_from","1970-01-01"),hour.get("valid_to"));}}
        if(input.containsKey("opening_exceptions")){db.update("DELETE FROM catalog.opening_exceptions WHERE place_id=?",id);var closed=new HashSet<String>();var opened=new HashSet<String>();for(Object value:(List<?>)input.get("opening_exceptions")){@SuppressWarnings("unchecked")Map<String,Object> exception=(Map<String,Object>)value;String date=exception.get("local_date").toString();boolean isClosed=Boolean.TRUE.equals(exception.get("is_closed"));if(isClosed)closed.add(date);else opened.add(date);if(closed.contains(date)&&opened.contains(date))throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,"Closed holiday cannot contain open shifts");int offset=((Number)exception.getOrDefault("end_day_offset",0)).intValue();if(!isClosed)duration(exception.get("open_time").toString(),exception.get("close_time").toString(),offset);db.update("INSERT INTO catalog.opening_exceptions(exception_id,place_id,local_date,is_closed,open_time,close_time,end_day_offset,reason) VALUES(?,?,?::date,?,?::time,?::time,?,?)",UUID.randomUUID(),id,date,isClosed,exception.get("open_time"),exception.get("close_time"),offset,exception.get("reason"));}}
    }
    private void duration(String open,String close,int offset){long seconds=java.time.LocalTime.parse(close).toSecondOfDay()-java.time.LocalTime.parse(open).toSecondOfDay()+offset*86400L;if(offset<0||offset>1||seconds<=0||seconds>86400)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Opening shift must be 0..24 hours");}
    private void snapshot(UUID id,UUID actor,String reason) {
        var full=place(id,false); long version=((Number)full.get("version")).longValue();
        db.update("INSERT INTO catalog.place_versions(place_version_id,place_id,version_no,snapshot,reason,created_by) VALUES(?,?,?,?::jsonb,?,?)",UUID.randomUUID(),id,version,encode(full),reason,actor);
        db.update("INSERT INTO catalog.audit_logs(audit_id,actor_id,actor_type,entity_type,entity_id,action,new_value) VALUES(?,?,'USER','place',?,?,?::jsonb)",UUID.randomUUID(),actor,id.toString(),reason,encode(full));
        emit("catalog.place.upserted.v1",id,version,full);
    }
    public void emit(String type,UUID id,long version,Object payload) {
        String aggregate=type.startsWith("catalog.category.")?"category":type.startsWith("catalog.destination.")?"destination":type.startsWith("catalog.business-claim.")?"claim":type.startsWith("catalog.contribution.")?"contribution":type.startsWith("catalog.place-import.")?"import":type.startsWith("domain.")?"deletion":"place";
        if(payload instanceof Map<?,?> original){var selected=new LinkedHashMap<String,Object>();List<String> fields=switch(type){case "catalog.place.upserted.v1"->List.of("place_id","name","status","version","latitude","longitude","category_ids","tag_ids","amenity_ids","geographic_unit_id","destination_ids","price","currency","opening_hours","media_keys","source_version");case "catalog.category.changed.v1"->List.of("category_id","name","active","version");case "catalog.destination.changed.v1"->List.of("destination_id","name","status","geographic_unit_ids","version");default->List.of();};if(!fields.isEmpty()){for(String field:fields)selected.put(field,original.get(field));if(type.equals("catalog.category.changed.v1")){selected.put("name",original.getOrDefault("name",null)==null?original.get("name_vi"):original.get("name"));selected.put("version",version);}if(type.equals("catalog.destination.changed.v1")){selected.put("name",original.get("name_vi"));selected.put("status","PUBLISHED".equals(original.get("status"))?"ACTIVE":"INACTIVE");selected.put("geographic_unit_ids",db.queryForList("SELECT geographic_unit_id FROM catalog.destination_geo WHERE destination_id=? ORDER BY geographic_unit_id",UUID.class,id));}payload=selected;}}
        UUID event=UUID.randomUUID();var envelope=new LinkedHashMap<String,Object>();envelope.put("event_id",event);envelope.put("event_type",type);envelope.put("schema_version",1);envelope.put("aggregate_type",aggregate);envelope.put("aggregate_id",id);envelope.put("aggregate_version",version);envelope.put("occurred_at",Instant.now().toString());envelope.put("producer","catalog");envelope.put("correlation_id",UUID.randomUUID());envelope.put("causation_id",null);envelope.put("traceparent","00-"+UUID.randomUUID().toString().replace("-","")+"-"+UUID.randomUUID().toString().replace("-","").substring(0,16)+"-01");envelope.put("payload",payload);
        db.update("INSERT INTO catalog.outbox_events(event_id,aggregate_type,aggregate_id,aggregate_version,event_type,payload) VALUES(?,?,?,?,?,?::jsonb)",event,aggregate,id.toString(),version,type,encode(envelope));
    }
    @Transactional
    public boolean rating(UUID event,Map<String,Object> payload) {vn.smarttravel.catalog.infrastructure.persistence.repository.UserMutationFence.acquireAuthenticated(db);
        if(db.update("INSERT INTO catalog.inbox_events(consumer_name,event_id) VALUES('rating',?) ON CONFLICT DO NOTHING",event)==0)return false;
        db.update("INSERT INTO catalog.place_rating_summary(place_id,review_count,rating_sum,source_version,as_of) VALUES(?,?,?,?,?::timestamptz) ON CONFLICT(place_id) DO UPDATE SET review_count=excluded.review_count,rating_sum=excluded.rating_sum,source_version=excluded.source_version,as_of=excluded.as_of WHERE excluded.source_version>catalog.place_rating_summary.source_version",uuid(payload.get("place_id")),payload.get("count"),payload.get("sum"),payload.get("version"),payload.get("as_of"));return true;
    }
    public List<Map<String,Object>> taxonomy(String kind) {
        if(!Set.of("categories","tags","amenities","destinations","geographic_units").contains(kind))throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return db.queryForList("SELECT * FROM catalog."+kind+(kind.equals("categories")?" WHERE active":kind.equals("destinations")?" WHERE status='PUBLISHED'":""));
    }
    public List<Map<String,Object>> adminList(){return db.queryForList("SELECT place_id FROM catalog.places ORDER BY place_id").stream().map(row->place((UUID)row.get("place_id"),false)).toList();}
    /** Internal ML lineage is read from this service's audited import versions, never another database. */
    public List<Map<String,Object>> featureSnapshot(){
        return adminList().stream().map(row->{
            var feature=new LinkedHashMap<>(vn.smarttravel.catalog.shared.web.Representations.place(row));
            var lineage=db.queryForList("SELECT source_id FROM catalog.place_versions WHERE place_id=? AND source_id IS NOT NULL ORDER BY version_no DESC LIMIT 1",row.get("place_id"));
            if(!lineage.isEmpty())feature.put("source_id",lineage.getFirst().get("source_id"));
            return (Map<String,Object>)feature;
        }).toList();
    }
    public List<Map<String,Object>> candidates(Map<String,Object> body){return db.queryForList("SELECT place_id FROM catalog.places WHERE status='PUBLISHED' AND (search_document @@ plainto_tsquery('simple',?) OR ST_DWithin(location,ST_SetSRID(ST_MakePoint(?,?),4326)::geography,1000)) ORDER BY place_id LIMIT 100",normalize(body.get("name").toString()),body.get("longitude"),body.get("latitude")).stream().map(row->place((UUID)row.get("place_id"),true)).toList();}
}
