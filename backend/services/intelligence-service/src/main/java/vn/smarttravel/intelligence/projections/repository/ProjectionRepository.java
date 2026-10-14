package vn.smarttravel.intelligence.projections.repository;

import static vn.smarttravel.intelligence.shared.util.IntelligenceSupport.*;

import vn.smarttravel.intelligence.recommendations.service.BasicService;
import vn.smarttravel.intelligence.recommendations.client.DependencyClient;

import com.fasterxml.jackson.databind.JsonNode;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** All deliveries use the same atomic inbox/domain/outbox boundary. */
@org.springframework.stereotype.Repository
public class ProjectionRepository {
    private final JdbcTemplate db;
    private static final Set<String> PLACE_FIELDS=Set.of("name","category_ids","destination_id","destination_ids","geographic_unit_id","tag_ids","amenity_ids","tags","amenities","latitude","longitude","price","currency","source_id","popularity","rating_count","rating_sum","schema_version");
    public ProjectionRepository(JdbcTemplate db) {this.db=db;}
    public void userLock(UUID user) { db.queryForObject("select pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"user:"+user); }
    public void guardActor(UUID user){
        if(user==null)throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.UNAUTHORIZED,"USER_REQUIRED");
        userLock(user);
        if(tombstoned(user)||Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from intelligence.projection_versions where stream='user-status' and aggregate_id=? and payload->>'status' not in ('ACTIVE','ENABLED'))",Boolean.class,user)))
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.FORBIDDEN,"USER_INACTIVE");
    }
    public boolean tombstoned(UUID user) {return user!=null && Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from intelligence.user_tombstones where user_id=?)",Boolean.class,user));}
    public Optional<JsonNode> profile(UUID user) {
        if(user==null || tombstoned(user)) return Optional.empty();
        return db.query("select preferences,consent_version from intelligence.user_feature_profiles where user_id=? and personalization_enabled=true and not exists(select 1 from intelligence.projection_versions v where v.stream='user-status' and v.aggregate_id=user_id and v.payload->>'status' not in ('ACTIVE','ENABLED'))",(rs,i)->{
            var n=(com.fasterxml.jackson.databind.node.ObjectNode)read(rs.getString(1));n.put("consent_version",rs.getLong(2));return (JsonNode)n;
        },user).stream().findFirst();
    }
        public boolean consume(JsonNode event) {
        require(event.path("schema_version").asInt()==1,"UNSUPPORTED_SCHEMA");
        UUID id=uuid(event,"event_id");String type=event.path("event_type").asText();JsonNode p=event.path("payload");
        Set<String> supported=Set.of("identity.preferences.changed.v1","identity.user.status-changed.v1","identity.user.deletion-requested.v1","catalog.place.upserted.v1","catalog.place.visibility-changed.v1","catalog.destination.changed.v1","catalog.category.changed.v1","community.rating-summary.changed.v1","community.review.changed.v1","community.favorite.changed.v1","trip.item.added.v1","ingestion.source-policy.changed.v1");
        require(supported.contains(type),"UNSUPPORTED_EVENT");
        long version=event.path("aggregate_version").asLong();require(version>0,"INVALID_VERSION");
        Instant occurred=time(event,"occurred_at");
        require(event.path("producer").asText().equals(type.substring(0,type.indexOf('.'))),"INVALID_PRODUCER");
        if(db.update("insert into intelligence.inbox_events(consumer_name,event_id) values('intelligence',?) on conflict do nothing",id)==0)return false;
        switch(type) {
            case "identity.preferences.changed.v1" -> preferences(p,version,occurred);
            case "identity.user.deletion-requested.v1" -> deletion(p,id);
            case "identity.user.status-changed.v1" -> {
                UUID user=uuid(p,"user_id");userLock(user);
                if(stream("user-status",user,version,p) && !Set.of("ACTIVE","ENABLED").contains(p.path("status").asText())) purge(user,false);
            }
            case "catalog.place.upserted.v1" -> place(p,version,occurred);
            case "catalog.place.visibility-changed.v1" -> visibility(p,version);
            case "community.rating-summary.changed.v1" -> rating(p,version,occurred);
            case "ingestion.source-policy.changed.v1" -> policy(p,version);
            case "catalog.category.changed.v1" -> stream("category",uuid(p,"category_id"),version,p);
            case "catalog.destination.changed.v1" -> stream("destination",uuid(p,"destination_id"),version,p);
            default -> serverInteraction(type,p,id,occurred);
        }
        return true;
    }
    private boolean stream(String stream,UUID id,long version,JsonNode payload) {
        return db.update("insert into intelligence.projection_versions(stream,aggregate_id,version,payload) values(?,?,?,?::jsonb) on conflict(stream,aggregate_id) do update set version=excluded.version,payload=excluded.payload where intelligence.projection_versions.version<excluded.version",stream,id,version,json(payload))>0;
    }
    private void preferences(JsonNode p,long version,Instant at) {
        UUID user=uuid(p,"user_id");userLock(user);if(tombstoned(user))return;
        long consent=p.path("consent_version").asLong();require(consent>0,"INVALID_CONSENT");
        boolean enabled=p.path("personalization_enabled").asBoolean();
        var preferences=allow(p.has("preferences")?p.path("preferences"):p.has("preference_snapshot")?p.path("preference_snapshot"):p,Set.of("category_ids","travel_style_ids","food_preference_ids","budget_level","budget_min","budget_max","tags","budget","currency","latitude","longitude","radius_m"));
        int changed=db.update("insert into intelligence.user_feature_profiles(user_id,preferences,personalization_enabled,consent_version,source_version,as_of) values(?,?::jsonb,?,?,?,?) on conflict(user_id) do update set preferences=excluded.preferences,personalization_enabled=excluded.personalization_enabled,consent_version=excluded.consent_version,source_version=excluded.source_version,feature_version=intelligence.user_feature_profiles.feature_version+1,as_of=excluded.as_of where intelligence.user_feature_profiles.source_version<excluded.source_version and intelligence.user_feature_profiles.consent_version<=excluded.consent_version",user,json(preferences),enabled,consent,version,Timestamp.from(at));
        if(changed>0&&!enabled)purge(user,false);
    }
    private void place(JsonNode p,long version,Instant at) {
        place(p,version,at,false);
    }
    private void place(JsonNode p,long version,Instant at,boolean rebuild) {
        UUID id=uuid(p,"place_id");
        db.queryForObject("select pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"place:"+id);
        if(!stream("catalog",id,version,p)){
            if(!rebuild||!Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from intelligence.projection_versions where stream='catalog' and aggregate_id=? and version=? and payload->>'status'=?)",Boolean.class,id,version,p.path("status").asText())))return;
        }
        var f=allow(p.has("features")?p.path("features"):p,PLACE_FIELDS);f.remove(List.of("rating_count","rating_sum"));f.put("schema_version",1);
        String status=p.path("status").asText();require(Set.of("DRAFT","PUBLISHED","HIDDEN","ARCHIVED").contains(status),"INVALID_STATUS");
        db.update("insert into intelligence.place_features(place_id,catalog_version,status,features,content_hash,as_of) values(?,?,?,?::jsonb,?,?) on conflict(place_id) do update set catalog_version=excluded.catalog_version,status=excluded.status,features=excluded.features || jsonb_strip_nulls(jsonb_build_object('rating_count',intelligence.place_features.features->'rating_count','rating_sum',intelligence.place_features.features->'rating_sum')),content_hash=excluded.content_hash,as_of=excluded.as_of where intelligence.place_features.catalog_version<=excluded.catalog_version",id,version,status,json(f),hash(json(f)),Timestamp.from(at));
        refreshHash(id);
    }
    public int rebuild(UUID actor,JsonNode snapshot){return rebuild(actor,"catalog",snapshot);}
    public int rebuild(UUID actor,String source,JsonNode snapshot){
        require(snapshot.path("items").isArray()&&snapshot.path("items").size()<=100,"INVALID_SNAPSHOT");Instant asOf=time(snapshot,"as_of");
        for(var p:snapshot.path("items")){
            if(source.equals("interaction")){require(p.path("event_type").asText().equals("trip.item.added.v1"),"INVALID_INTERACTION_SNAPSHOT");consume(p);continue;}
            long version=p.path(source.equals("policy")?"source_version":"version").asLong();require(version>0,"INVALID_VERSION");
            switch(source){case "catalog" -> place(p,version,asOf,true);case "rating" -> rating(p,version,asOf);case "preferences" -> preferences(p,version,p.hasNonNull("as_of")?time(p,"as_of"):asOf);case "policy" -> policy(p,version);default -> throw new IllegalArgumentException("Unknown projection source");}
        }
        audit(actor,"projection",source,"REBUILD",Map.of("count",snapshot.path("items").size(),"watermark",snapshot.path("watermark")));return snapshot.path("items").size();
    }
    private void visibility(JsonNode p,long version) {
        UUID id=uuid(p,"place_id");if(!stream("catalog",id,version,p))return;
        String status=p.path("status").asText();require(Set.of("DRAFT","PUBLISHED","HIDDEN","ARCHIVED").contains(status),"INVALID_STATUS");
        db.update("update intelligence.place_features set status=?,catalog_version=? where place_id=? and catalog_version<?",status,version,id,version);
    }
    private void rating(JsonNode p,long version,Instant at) {
        UUID id=uuid(p,"place_id");long count=p.path("count").asLong();double sum=p.path("sum").asDouble();
        db.queryForObject("select pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"place:"+id);
        require(count>=0&&Double.isFinite(sum)&&sum>=0&&sum<=5*count,"INVALID_RATING");
        if(!stream("rating",id,version,p))return;
        db.update("insert into intelligence.place_features(place_id,catalog_version,rating_version,status,features,content_hash,as_of) values(?,1,?,'DRAFT',jsonb_build_object('schema_version',1,'rating_count',?::bigint,'rating_sum',?::double precision),?,?) on conflict(place_id) do update set rating_version=excluded.rating_version,features=intelligence.place_features.features || excluded.features,as_of=greatest(intelligence.place_features.as_of,excluded.as_of) where intelligence.place_features.rating_version<excluded.rating_version",id,version,count,sum,hash(json(p)),Timestamp.from(at));
        refreshHash(id);
    }
    private void refreshHash(UUID id){String features=db.queryForObject("select features from intelligence.place_features where place_id=?",String.class,id);JsonNode f=read(features);double rating=f.path("rating_count").asLong()>0?f.path("rating_sum").asDouble()/(5*f.path("rating_count").asLong()):.7;String vector=json(List.of(1.0,rating,Math.max(0,Math.min(1,f.path("popularity").asDouble()/100))));db.update("update intelligence.place_features set content_hash=?,embedding=?::vector where place_id=?",hash(features),vector,id);}
    private void policy(JsonNode p,long version) {
        UUID source=uuid(p,"source_id");db.queryForObject("select pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"source:"+source);
        String license=p.path("license_version").asText();require(!license.isBlank()&&license.length()<=1024,"INVALID_LICENSE");
        int changed=db.update("insert into intelligence.source_policies(source_id,source_version,license_version,allow_training,status) values(?,?,?,?,?) on conflict(source_id) do update set source_version=excluded.source_version,license_version=excluded.license_version,allow_training=excluded.allow_training,status=excluded.status,updated_at=now() where intelligence.source_policies.source_version<excluded.source_version",source,version,license,p.path("allow_training").asBoolean(),p.path("status").asText("ACTIVE"));
        if(changed>0) {
            db.update("update intelligence.dataset_versions d set status='REVOKED' from intelligence.dataset_sources s where d.dataset_version_id=s.dataset_version_id and s.source_id=? and (not ? or s.license_version<>? or s.source_version<>?)",source,p.path("allow_training").asBoolean(),license,version);
            revokeModels();
        }
    }
    private void serverInteraction(String type,JsonNode p,UUID event,Instant occurred) {
        if(type.equals("community.review.changed.v1")&&!p.path("change_kind").asText().equals("CREATED"))return;
        UUID user=uuid(p,"user_id");userLock(user);var profile=profile(user);if(profile.isEmpty())return;
        // Consent changes purge history. Old queued/snapshot events must not recreate it after opt-in.
        if(!Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from intelligence.user_feature_profiles where user_id=? and personalization_enabled=true and as_of<=? and (history_purged_before is null or history_purged_before<?))",Boolean.class,user,Timestamp.from(occurred),Timestamp.from(occurred))))return;
        String kind=switch(type){case "community.favorite.changed.v1" -> p.path("action").asText().equals("ADDED")?"FAVORITE_ADDED":"FAVORITE_REMOVED";case "community.review.changed.v1" -> "REVIEW_CREATED";default -> "TRIP_ITEM_ADDED";};
        var attribution=new LinkedHashMap<String,Object>();
        if(type.equals("trip.item.added.v1")) {
            for(String field:List.of("item_id","trip_id","recommendation_request_id"))
                if(p.hasNonNull(field))attribution.put(field,uuid(p,field));
        }
        db.update("insert into intelligence.interactions(event_id,user_id,place_id,event_type,session_id,consent_version,context,occurred_at) values(?,?,?,?,?,?,?::jsonb,?) on conflict(event_id) do nothing",event,user,uuid(p,"place_id"),kind,UUID.nameUUIDFromBytes(event.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8)),profile.get().path("consent_version").asLong(),json(attribution),Timestamp.from(occurred));
    }
    private void deletion(JsonNode p,UUID causation) {
        UUID user=uuid(p,"user_id");userLock(user);purge(user,true);
        publish("domain.user-data-deleted.v1","deletion",p.path("deletion_request_id").asText(),1,Map.of("deletion_request_id",p.path("deletion_request_id").asText(),"service","intelligence","status","COMPLETED","artifact_handling","revoked; asynchronous physical purge"),causation);
    }
    public void purge(UUID user,boolean tombstone) {
        purgeHistory(user);
        db.update("update intelligence.user_feature_profiles set personalization_enabled=false,preferences='{}' where user_id=?",user);
        if(tombstone){db.update("insert into intelligence.user_tombstones(user_id) values(?) on conflict do nothing",user);db.update("delete from intelligence.user_feature_profiles where user_id=?",user);db.queryForObject("select intelligence.purge_actor_identifiers(?)",Object.class,user);}
    }
    public void purgeHistory(UUID user) {
        db.update("update intelligence.user_feature_profiles set history_purged_before=clock_timestamp() where user_id=?",user);
        db.update("delete from intelligence.interactions where user_id=?",user);
        db.update("update intelligence.recommendation_requests set user_id=null where user_id=?",user);
        db.update("update intelligence.dataset_versions d set status='REVOKED' from intelligence.dataset_users u where d.dataset_version_id=u.dataset_version_id and u.user_id=?",user);
        revokeModels();
    }
    public void revokeModels() {
        db.update("update intelligence.model_versions m set status='REVOKED' from intelligence.training_jobs j,intelligence.dataset_versions d where m.training_job_id=j.training_job_id and j.dataset_version_id=d.dataset_version_id and d.status<>'READY'");
        db.update("update intelligence.model_deployments x set deactivated_at=now() from intelligence.model_versions m where x.model_version_id=m.model_version_id and m.status='REVOKED' and x.deactivated_at is null");
    }
    public void publish(String type,String aggregate,String id,long version,Object payload,UUID causation) {
        UUID event=UUID.randomUUID();var envelope=new LinkedHashMap<String,Object>();
        envelope.put("event_id",event);envelope.put("event_type",type);envelope.put("schema_version",1);envelope.put("aggregate_type",aggregate);envelope.put("aggregate_id",id);envelope.put("aggregate_version",version);envelope.put("occurred_at",Instant.now().toString());envelope.put("producer","intelligence");envelope.put("correlation_id",UUID.randomUUID());envelope.put("causation_id",causation);envelope.put("traceparent","00-"+UUID.randomUUID().toString().replace("-","")+"-"+UUID.randomUUID().toString().replace("-","").substring(0,16)+"-01");envelope.put("payload",payload);
        db.update("insert into intelligence.outbox_events(event_id,aggregate_type,aggregate_id,aggregate_version,event_type,payload) values(?,?,?,?,?,?::jsonb)",event,aggregate,id,version,type,json(envelope));
    }
    public void audit(UUID actor,String entity,String id,String action,Object value) {
        db.update("insert into intelligence.audit_logs(audit_id,actor_id,actor_type,entity_type,entity_id,action,new_value) values(?,?,'USER',?,?,?,?::jsonb)",UUID.randomUUID(),actor,entity,id,action,json(value));
    }
}
