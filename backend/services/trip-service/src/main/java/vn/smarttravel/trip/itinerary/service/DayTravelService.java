package vn.smarttravel.trip.itinerary.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import vn.smarttravel.trip.itinerary.repository.TripStore;
import java.util.*;
import static vn.smarttravel.trip.shared.web.ApiValues.*;

/** Derived adjacency only. UC14 transfer_items remain independently authoritative. */
@Service
@Transactional
public class DayTravelService {
    private final TripStore store;
    public DayTravelService(TripStore store) { this.store=store; }

    public void synchronizeTrip(UUID trip) {
        for (var day:store.queryForList("SELECT day_id FROM trip.trip_days WHERE trip_id=?",trip))
            synchronizeDay(trip,(UUID)day.get("day_id"));
    }

    /** Called under the trip row lock, in the same transaction as the item mutation. */
    public void synchronizeDay(UUID trip,UUID day) {
        var items=store.queryForList("SELECT i.item_id,p.latitude,p.longitude FROM trip.itinerary_items i JOIN trip.place_snapshots p USING(trip_id,place_id) WHERE i.trip_id=? AND i.day_id=? ORDER BY i.sort_order",trip,day);
        var existing=store.queryForList("SELECT * FROM trip.day_travel_legs WHERE trip_id=? AND day_id=?",trip,day);
        var retained=new HashSet<UUID>();
        for(int index=1;index<items.size();index++) {
            var from=items.get(index-1);var to=items.get(index);
            var old=existing.stream().filter(leg->leg.get("from_item_id").equals(from.get("item_id"))&&leg.get("to_item_id").equals(to.get("item_id"))).findFirst();
            String coordinates=coordinatesKey(from,to);
            if(old.isEmpty()) {
                UUID leg=UUID.randomUUID();retained.add(leg);
                store.update("INSERT INTO trip.day_travel_legs(leg_id,trip_id,day_id,from_item_id,to_item_id,coordinates_key,route_token) VALUES (?,?,?,?,?,?,?)",leg,trip,day,from.get("item_id"),to.get("item_id"),coordinates,UUID.randomUUID());
            } else {
                var leg=old.get();retained.add((UUID)leg.get("leg_id"));
                if(!coordinates.equals(leg.get("coordinates_key"))) invalidate((UUID)leg.get("leg_id"),leg.get("transport_mode").toString(),coordinates);
            }
        }
        for(var leg:existing) if(!retained.contains(leg.get("leg_id")))
            store.update("DELETE FROM trip.day_travel_legs WHERE leg_id=?",leg.get("leg_id"));
    }

    static String coordinatesKey(Map<String,Object> from,Map<String,Object> to) {
        return from.get("latitude")+","+from.get("longitude")+">"+to.get("latitude")+","+to.get("longitude");
    }

    private void invalidate(UUID leg,String mode,String coordinates) {
        store.update("UPDATE trip.day_travel_legs SET transport_mode=?,coordinates_key=?,route_token=?,status=?,claimed_at=NULL,distance_m=NULL,duration_seconds=NULL,fallback=false,route_payload='{}',updated_at=now() WHERE leg_id=?",mode,coordinates,UUID.randomUUID(),"SELF_MANAGED".equals(mode)?"SELF_MANAGED":"PENDING",leg);
    }

    public Map<String,Object> list(UUID trip,UUID user,UUID day) {
        var owner=store.owner(trip,user,false);
        store.one("SELECT day_id FROM trip.trip_days WHERE trip_id=? AND day_id=?",trip,day);
        long version=number(owner.get("version"));
        var rows=store.queryForList("SELECT l.* FROM trip.day_travel_legs l JOIN trip.itinerary_items i ON i.item_id=l.from_item_id WHERE l.trip_id=? AND l.day_id=? ORDER BY i.sort_order",trip,day);
        return store.page(rows.stream().map(row->response(row,version)).toList(),version);
    }

    public Map<String,Object> mode(UUID trip,UUID user,UUID day,UUID leg,String version,Map<String,Object> body) {
        var owner=store.owner(trip,user,true);store.expected(owner,version);
        require(body.size()==1&&body.get("mode") instanceof String,400,"INVALID_MODE");
        String mode=body.get("mode").toString();
        require(Set.of("DRIVE","WALK","BICYCLE","SELF_MANAGED").contains(mode),400,"INVALID_MODE");
        var row=store.one("SELECT * FROM trip.day_travel_legs WHERE trip_id=? AND day_id=? AND leg_id=?",trip,day,leg);
        invalidate(leg,mode,row.get("coordinates_key").toString());
        long next=store.changed(trip,user,"TRAVEL_MODE_CHANGED");
        return response(store.one("SELECT * FROM trip.day_travel_legs WHERE leg_id=?",leg),next);
    }

    private Map<String,Object> response(Map<String,Object> row,long version) {
        var route=store.decode(row.get("route_payload"));
        return map("leg_id",row.get("leg_id"),"day_id",row.get("day_id"),"from_item_id",row.get("from_item_id"),"to_item_id",row.get("to_item_id"),"mode",row.get("transport_mode"),"status",row.get("status"),"distance_m",row.get("distance_m"),"duration_seconds",row.get("duration_seconds"),"fallback",row.get("fallback"),"geometry",route.get("geometry"),"version",version);
    }
}
