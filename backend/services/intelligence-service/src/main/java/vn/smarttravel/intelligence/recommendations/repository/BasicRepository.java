package vn.smarttravel.intelligence.recommendations.repository;

import static vn.smarttravel.intelligence.shared.util.IntelligenceSupport.*;
import vn.smarttravel.intelligence.projections.service.ProjectionService;

import vn.smarttravel.intelligence.recommendations.client.DependencyClient;

import com.fasterxml.jackson.databind.JsonNode;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@org.springframework.stereotype.Repository
public class BasicRepository {
    private final JdbcTemplate db;
    private final ProjectionService projections;
    private final DependencyClient dependencies;
    private final String cursorKey=UUID.randomUUID().toString();
    public record Candidate(UUID id,long version,JsonNode features,Instant asOf,double score,Map<String,Double> components,List<String> missing) {}
    public BasicRepository(JdbcTemplate db,ProjectionService projections,DependencyClient dependencies){this.db=db;this.projections=projections;this.dependencies=dependencies;}
        public Map<String,Object> interactions(UUID user,JsonNode request) {
        fields(request,Set.of("items","analytics_consent","consent_version"));
        require(request.path("analytics_consent").asBoolean(),"CONSENT_REQUIRED");
        projections.guardActor(user);var profile=projections.profile(user);
        if(profile.isEmpty()||profile.get().path("consent_version").asLong()!=request.path("consent_version").asLong())throw new ResponseStatusException(HttpStatus.FORBIDDEN,"CURRENT_CONSENT_REQUIRED");
        JsonNode items=request.path("items");require(items.isArray()&&items.size()>0&&items.size()<=100,"INVALID_BATCH_SIZE");
        int count=db.queryForObject("insert into intelligence.interaction_rate_limits(actor_key,window_start,count) values(?,now(),?) on conflict(actor_key) do update set count=case when intelligence.interaction_rate_limits.window_start<now()-interval '1 minute' then excluded.count else intelligence.interaction_rate_limits.count+excluded.count end,window_start=case when intelligence.interaction_rate_limits.window_start<now()-interval '1 minute' then now() else intelligence.interaction_rate_limits.window_start end returning count",Integer.class,user.toString(),items.size());
        if(count>300)throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"RATE_LIMITED");
        List<UUID> accepted=new ArrayList<>();List<Map<String,Object>> errors=new ArrayList<>();
        for(JsonNode item:items) {
            UUID id=uuid(item,"event_id");
            try {
                fields(item,Set.of("event_id","session_id","type","place_id","query","occurred_at"));
                String kind=item.path("type").asText();require(Set.of("SEARCH","PLACE_VIEW").contains(kind),"CLIENT_EVENT_FORBIDDEN");
                UUID session=uuid(item,"session_id");UUID place=item.path("place_id").isNull()||item.path("place_id").isMissingNode()?null:uuid(item,"place_id");require(kind.equals("SEARCH")||place!=null,"PLACE_REQUIRED");
                Instant occurred=time(item,"occurred_at");require(!occurred.isAfter(Instant.now().plusSeconds(60))&&!occurred.isBefore(Instant.now().minus(Duration.ofDays(30))),"INVALID_EVENT_TIME");
                require(item.path("query").isNull()||item.path("query").asText().length()<=512,"QUERY_TOO_LONG");
                // Query is accepted by contract but deliberately never persisted (free text may contain PII).
                int inserted=db.update("insert into intelligence.interactions(event_id,user_id,place_id,event_type,session_id,consent_version,occurred_at) values(?,?,?,?,?,?,?) on conflict(event_id) do nothing",id,user,place,kind,session,request.path("consent_version").asLong(),Timestamp.from(occurred));
                if(inserted==0) {
                    UUID owner=db.queryForObject("select user_id from intelligence.interactions where event_id=?",UUID.class,id);
                    if(!user.equals(owner))throw conflict("EVENT_ID_CONFLICT");
                }
                accepted.add(id);
            }catch(ResponseStatusException ex){errors.add(Map.of("event_id",id,"code",Objects.requireNonNullElse(ex.getReason(),"INVALID_RECORD")));}
        }
        return Map.of("accepted_ids",accepted,"errors",errors);
    }
        public Map<String,Object> history(UUID user,int limit,String cursor) {
        require(limit>=1&&limit<=100,"INVALID_LIMIT");long before=Long.MAX_VALUE;
        if(cursor!=null) {
            try {
                String raw=new String(Base64.getUrlDecoder().decode(cursor),java.nio.charset.StandardCharsets.UTF_8);String[] parts=raw.split(":");
                require(parts.length==4&&parts[0].equals(user.toString())&&parts[1].equals(Integer.toString(limit)),"CURSOR_QUERY_MISMATCH");
                String expected=hash(cursorKey+":"+parts[0]+":"+parts[1]+":"+parts[2]);require(java.security.MessageDigest.isEqual(expected.getBytes(),parts[3].getBytes()),"INVALID_CURSOR_SIGNATURE");before=Long.parseLong(parts[2]);
            }catch(IllegalArgumentException ex){throw bad("INVALID_CURSOR");}
        }
        var rows=db.queryForList("select interaction_id,event_id,session_id,event_type,place_id,occurred_at from intelligence.interactions where user_id=? and event_type in ('SEARCH','PLACE_VIEW') and interaction_id<? order by interaction_id desc limit ?",user,before,limit+1);
        var items=new ArrayList<Map<String,Object>>();
        for(var row:rows.subList(0,Math.min(limit,rows.size()))) {
            var item=new LinkedHashMap<String,Object>();item.put("event_id",row.get("event_id"));item.put("session_id",row.get("session_id"));item.put("type",row.get("event_type"));item.put("place_id",row.get("place_id"));item.put("query",null);item.put("occurred_at",((Timestamp)row.get("occurred_at")).toInstant().toString());items.add(item);
        }
        String next=null;if(rows.size()>limit){String raw=user+":"+limit+":"+rows.get(limit-1).get("interaction_id");next=Base64.getUrlEncoder().withoutPadding().encodeToString((raw+":"+hash(cursorKey+":"+raw)).getBytes(java.nio.charset.StandardCharsets.UTF_8));}
        var response=new LinkedHashMap<String,Object>();response.put("items",items);response.put("next_cursor",next);response.put("as_of",Instant.now().toString());response.put("watermark",1);return response;
    }
        public Map<String,Object> deleteHistory(UUID user) {
        projections.guardActor(user);projections.purgeHistory(user);UUID request=UUID.randomUUID();projections.audit(user,"history",user.toString(),"PURGE",Map.of("request_id",request));return Map.of("request_id",request,"status","COMPLETED","version",1);
    }
    public void beginRecommendation(){db.execute("SET LOCAL lock_timeout='500ms'");db.execute("SET LOCAL statement_timeout='2500ms'");}
    public List<Candidate> candidates(UUID user,JsonNode criteria) {
        fields(criteria,Set.of("topN","currency","category_ids","budget","latitude","longitude","radius_m"));
        require(criteria.path("topN").canConvertToInt()&&criteria.path("topN").asInt()>=1&&criteria.path("topN").asInt()<=50,"INVALID_TOP_N");
        require(criteria.path("currency").asText().equals("VND"),"UNSUPPORTED_CURRENCY");
        require(!criteria.has("budget")||(criteria.path("budget").isNumber()&&criteria.path("budget").asDouble()>=0&&Double.isFinite(criteria.path("budget").asDouble())),"INVALID_BUDGET");
        require(criteria.has("latitude")==criteria.has("longitude"),"GEO_PAIR_REQUIRED");
        if(criteria.has("latitude"))require(Math.abs(criteria.path("latitude").asDouble())<=90&&Math.abs(criteria.path("longitude").asDouble())<=180,"INVALID_LOCATION");
        if(criteria.has("radius_m"))require(criteria.has("latitude")&&criteria.path("radius_m").asDouble()>=1&&criteria.path("radius_m").asDouble()<=100000,"INVALID_RADIUS");
        Set<String> categories=new HashSet<>();if(criteria.has("category_ids")){require(criteria.path("category_ids").isArray()&&criteria.path("category_ids").size()<=100,"INVALID_CATEGORIES");for(var id:criteria.path("category_ids")){try{categories.add(UUID.fromString(id.asText()).toString());}catch(Exception e){throw bad("INVALID_CATEGORY");}}}
        Set<String> inactive=new HashSet<>(db.query("select aggregate_id from intelligence.projection_versions where stream='category' and payload->>'active'='false'",(r,i)->r.getObject(1).toString()));
        JsonNode profile=projections.profile(user).orElse(JSON.createObjectNode());var result=new ArrayList<Candidate>();
        db.query("select place_id,catalog_version,features,as_of from intelligence.place_features where status='PUBLISHED' order by place_id limit 1000",rs->{
            UUID id=rs.getObject(1,UUID.class);JsonNode f=read(rs.getString(3));Set<String> placeCategories=new HashSet<>();f.path("category_ids").forEach(n->placeCategories.add(n.asText()));
            if(!Collections.disjoint(placeCategories,inactive))return;
            if(!categories.isEmpty()&&Collections.disjoint(categories,placeCategories))return;
            if(criteria.has("budget")&&(!f.hasNonNull("price")||!f.path("currency").asText().equals(criteria.path("currency").asText())||decimal(f.path("price"))>criteria.path("budget").asDouble()))return;
            Double distance=null;
            if(criteria.has("latitude")) {
                if(!f.hasNonNull("latitude")||!f.hasNonNull("longitude")) {if(criteria.has("radius_m"))return;}
                else distance=distance(criteria.path("latitude").asDouble(),criteria.path("longitude").asDouble(),f.path("latitude").asDouble(),f.path("longitude").asDouble());
                if(distance!=null&&criteria.has("radius_m")&&distance>criteria.path("radius_m").asDouble())return;
            }
            Map<String,Double> components=new LinkedHashMap<>();Map<String,Double> weights=new LinkedHashMap<>();List<String> missing=new ArrayList<>();
            if(!categories.isEmpty()){components.put("category",1.0);weights.put("category",.30);}else missing.add("category");
            Set<String> preferences=new HashSet<>();profile.path("category_ids").forEach(n->preferences.add(n.asText()));
            if(!preferences.isEmpty()){components.put("preference",Collections.disjoint(preferences,placeCategories)?0.0:1.0);weights.put("preference",.25);}else missing.add("preference");
            if(f.path("rating_count").asLong()>0){components.put("rating",(f.path("rating_sum").asDouble()+35)/(5*(f.path("rating_count").asLong()+10)));weights.put("rating",.20);}else missing.add("rating");
            if(distance!=null){components.put("distance",Math.max(0,1-distance/criteria.path("radius_m").asDouble(100000)));weights.put("distance",.15);}else missing.add("distance");
            if(criteria.has("budget")&&f.hasNonNull("price")){double budget=criteria.path("budget").asDouble();components.put("budget",budget==0?1:Math.max(0,1-decimal(f.path("price"))/budget));weights.put("budget",.10);}else missing.add("budget");
            double total=weights.values().stream().mapToDouble(Double::doubleValue).sum();double score=total==0?Math.min(1,Math.max(0,f.path("popularity").asDouble()/100)):components.entrySet().stream().mapToDouble(e->e.getValue()*weights.get(e.getKey())).sum()/total;
            if(Double.isFinite(score))result.add(new Candidate(id,rs.getLong(2),f,rs.getTimestamp(4).toInstant(),score,components,missing));
        });
        result.sort(Comparator.comparingDouble(Candidate::score).reversed().thenComparing(c->c.id().toString()));return result;
    }
    private static double decimal(JsonNode n){try{return new java.math.BigDecimal(n.asText()).doubleValue();}catch(Exception e){return Double.POSITIVE_INFINITY;}}
    public static double distance(double lat,double lon,double lat2,double lon2){double a=Math.pow(Math.sin(Math.toRadians(lat2-lat)/2),2)+Math.cos(Math.toRadians(lat))*Math.cos(Math.toRadians(lat2))*Math.pow(Math.sin(Math.toRadians(lon2-lon)/2),2);return 6371000*2*Math.asin(Math.sqrt(Math.min(1,a)));}
        public Map<String,Object> recommend(UUID user,JsonNode criteria) {
        var candidates=candidates(user,criteria);return persist(user,criteria,candidates,"BASIC","basic-v1",null,null);
    }
    public Map<String,Object> persist(UUID user,JsonNode criteria,List<Candidate> candidates,String mode,String version,UUID model,String reason) {
        UUID request=UUID.randomUUID();Instant dataAsOf=candidates.stream().map(Candidate::asOf).max(Instant::compareTo).orElse(Instant.now());
        var selected=new ArrayList<Candidate>();
        for(int start=0;start<candidates.size()&&selected.size()<criteria.path("topN").asInt();start+=100) {
            vn.smarttravel.intelligence.shared.http.RecommendationDeadline.remaining();
            var page=candidates.subList(start,Math.min(start+100,candidates.size()));var visible=dependencies.visible(page.stream().map(Candidate::id).toList());
            for(var c:page)if(visible.getOrDefault(c.id(),-1L)==c.version()&&selected.size()<criteria.path("topN").asInt())selected.add(c);
        }
        db.update("insert into intelligence.recommendation_requests(request_id,user_id,session_id,mode,algorithm_version,model_version_id,criteria,top_n,fallback_reason) values(?,?,?,?,?,?,?::jsonb,?,?)",request,projections.profile(user).isPresent()?user:null,UUID.randomUUID(),mode,version,model,json(criteria),criteria.path("topN").asInt(),reason);
        var items=new ArrayList<Map<String,Object>>();int rank=0;
        for(var c:selected){String explanation=json(Map.of("components",c.components(),"missing",c.missing(),"fallback_reason",Objects.requireNonNullElse(reason,"NONE")));db.update("insert into intelligence.recommendation_results(request_id,place_id,rank,score,explanation,catalog_version) values(?,?,?,?,?::jsonb,?)",request,c.id(),++rank,c.score(),explanation,c.version());items.add(Map.of("place_id",c.id(),"score",c.score(),"explanation",explanation));}
        return Map.of("request_id",request,"version",version,"data_as_of",dataAsOf.toString(),"fallback",mode.equals("FALLBACK"),"items",items);
    }
        public int retention(){db.update("delete from intelligence.interaction_rate_limits where window_start<now()-interval '1 day'");db.update("delete from intelligence.idempotency_records where expires_at<now()");return db.update("delete from intelligence.interactions where occurred_at<now()-interval '90 days'");}
}
