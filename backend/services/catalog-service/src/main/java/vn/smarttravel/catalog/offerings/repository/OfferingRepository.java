package vn.smarttravel.catalog.offerings.repository;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import vn.smarttravel.catalog.places.repository.CatalogRepository;
@Repository
public class OfferingRepository {
    private final JdbcTemplate db;private final CatalogRepository events;
    public OfferingRepository(JdbcTemplate db,CatalogRepository events){this.db=db;this.events=events;}
    private UUID optional(Object value){return value==null?null:UUID.fromString(value.toString());}
    public List<Map<String,Object>> list(UUID place,boolean publicOnly){return db.queryForList("SELECT o.* FROM catalog.offerings o WHERE (?::uuid IS NULL OR o.place_id=?::uuid) AND (?=false OR (o.status='PUBLISHED' AND (o.place_id IS NULL OR EXISTS(SELECT 1 FROM catalog.places p WHERE p.place_id=o.place_id AND p.status='PUBLISHED')) AND (o.destination_id IS NULL OR EXISTS(SELECT 1 FROM catalog.destinations d WHERE d.destination_id=o.destination_id AND d.status='PUBLISHED')))) ORDER BY offering_id",place,place,publicOnly);}
    public Map<String,Object> get(UUID id,boolean publicOnly){var rows=db.queryForList("SELECT * FROM catalog.offerings WHERE offering_id=? AND (?=false OR status='PUBLISHED')",id,publicOnly);if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND);var row=rows.getFirst();row.put("schedules",db.queryForList("SELECT starts_at,ends_at,timezone FROM catalog.offering_schedules WHERE offering_id=? ORDER BY starts_at",id));return row;}
    private void anchors(UUID place,UUID destination){if(place==null&&destination==null)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Offering anchor required");if(place!=null)events.place(place,false);if(destination!=null&&place!=null){Integer matches=db.queryForObject("WITH RECURSIVE g AS (SELECT geographic_unit_id FROM catalog.destination_geo WHERE destination_id=? UNION SELECT u.geographic_unit_id FROM catalog.geographic_units u JOIN g ON u.parent_id=g.geographic_unit_id) SELECT count(*) FROM catalog.places WHERE place_id=? AND geographic_unit_id IN (SELECT geographic_unit_id FROM g)",Integer.class,destination,place);if(matches==0)throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,"Inconsistent offering scope");}}
    @Transactional public Map<String,Object> create(Map<String,Object> body,UUID actor){vn.smarttravel.catalog.infrastructure.persistence.repository.UserMutationFence.acquire(db,actor);UUID id=UUID.randomUUID();UUID place=optional(body.get("place_id")),destination=optional(body.get("destination_id"));anchors(place,destination);String type=Objects.toString(body.getOrDefault("item_type",body.get("type")),"");if(!Set.of("SERVICE","TOUR","EVENT","ACTIVITY","EXPERIENCE").contains(type))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid offering type");String name=Objects.toString(body.getOrDefault("name_vi",body.get("name")),"").trim();if(name.isBlank())throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Name required");
        db.update("INSERT INTO catalog.offerings(offering_id,place_id,destination_id,item_type,name_vi,description,price_min,price_max,currency) VALUES(?,?,?,?,?,?,?,?,?)",id,place,destination,type,name,body.get("description"),body.getOrDefault("price_min",body.get("price")),body.get("price_max"),body.getOrDefault("currency","VND"));schedules(id,body);if(body.containsKey("status"))status(id,1,body.get("status").toString());return get(id,false);
    }
    private void schedules(UUID id,Map<String,Object> body){if(!body.containsKey("schedules"))return;db.update("DELETE FROM catalog.offering_schedules WHERE offering_id=?",id);for(Object value:(List<?>)body.get("schedules")){@SuppressWarnings("unchecked")Map<String,Object> schedule=(Map<String,Object>)value;String timezone=Objects.toString(schedule.getOrDefault("timezone","Asia/Ho_Chi_Minh"));java.time.ZoneId.of(timezone);db.update("INSERT INTO catalog.offering_schedules(schedule_id,offering_id,starts_at,ends_at,timezone) VALUES(?,?,?::timestamptz,?::timestamptz,?)",UUID.randomUUID(),id,schedule.get("starts_at"),schedule.get("ends_at"),timezone);}}
    private void publishable(UUID id,String status){if(status.equals("PUBLISHED")){var row=get(id,false);if(row.get("item_type").equals("EVENT")&&((List<?>)row.get("schedules")).isEmpty())throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,"Event schedule required");if(row.get("place_id")!=null)events.place((UUID)row.get("place_id"),true);if(row.get("destination_id")!=null&&db.queryForObject("SELECT count(*) FROM catalog.destinations WHERE destination_id=? AND status='PUBLISHED'",Integer.class,row.get("destination_id"))==0)throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,"Destination unpublished");}}
    @Transactional public Map<String,Object> update(UUID id,long version,Map<String,Object> body){
        vn.smarttravel.catalog.infrastructure.persistence.repository.UserMutationFence.acquireAuthenticated(db);
        var row=get(id,false);
        UUID place=body.containsKey("place_id")?optional(body.get("place_id")):(UUID)row.get("place_id");
        UUID destination=(UUID)row.get("destination_id");
        anchors(place,destination);
        String type=Objects.toString(body.getOrDefault("type",body.getOrDefault("item_type",row.get("item_type"))));
        if(!Set.of("SERVICE","TOUR","EVENT","ACTIVITY","EXPERIENCE").contains(type))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid offering type");
        String currency=Objects.toString(body.getOrDefault("currency",row.get("currency")));
        if(!"VND".equals(currency))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Unsupported currency");
        if(db.update("UPDATE catalog.offerings SET place_id=?,item_type=?,currency=?,name_vi=coalesce(?,name_vi),description=coalesce(?,description),price_min=coalesce(?,price_min),price_max=coalesce(?,price_max),status=coalesce(?,status),version=version+1,updated_at=now() WHERE offering_id=? AND version=?",
                place,type,currency,body.getOrDefault("name_vi",body.get("name")),body.get("description"),body.getOrDefault("price_min",body.get("price")),body.get("price_max"),body.get("status"),id,version)==0)throw new ResponseStatusException(HttpStatus.CONFLICT,"Version conflict");
        schedules(id,body);
        publishable(id,Objects.toString(body.getOrDefault("status",row.get("status"))));
        return get(id,false);
    }
    private void status(UUID id,long version,String status){publishable(id,status);db.update("UPDATE catalog.offerings SET status=? WHERE offering_id=? AND version=?",status,id,version);}
    @Transactional public void archive(UUID id,long version){vn.smarttravel.catalog.infrastructure.persistence.repository.UserMutationFence.acquireAuthenticated(db);update(id,version,Map.of("status","ARCHIVED"));}
}
