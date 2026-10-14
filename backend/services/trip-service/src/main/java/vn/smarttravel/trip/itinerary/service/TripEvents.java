package vn.smarttravel.trip.itinerary.service;
import vn.smarttravel.trip.itinerary.repository.TripStore;
import vn.smarttravel.trip.itinerary.client.*;
import vn.smarttravel.trip.itinerary.service.*;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;
import static vn.smarttravel.trip.itinerary.repository.SqlStatements.*;
import static vn.smarttravel.trip.shared.web.ApiValues.*;

@Service
public class TripEvents {
    private final TripStore s;
    public TripEvents(TripStore s){this.s=s;}
    private void destination(Map<String,Object> payload){
        s.lockDestinations();
        UUID destination=id(payload.get("destination_id"));String status=Objects.toString(payload.get("status"),"");long version=number(payload.get("version"));
        require(Set.of("ACTIVE","INACTIVE").contains(status)&&version>0,422,"INVALID_DESTINATION_STATUS");
        s.queryForObject(FINAL_REVIEW_SQL_1,Object.class,"trip-destination:"+destination);
        int changed=s.update(FINAL_REVIEW_SQL_2,destination,status,version);
        if(changed==0)return;
        var trips=s.queryForList(FINAL_REVIEW_SQL_3,destination);
        for(var trip:trips)s.changed((UUID)trip.get("trip_id"),(UUID)trip.get("user_id"),"DESTINATION_CHANGED");
    }
    @Transactional
    public void consume(Map<String,Object>event){String type=Objects.toString(event.get("event_type"),"");require(number(event.get("schema_version"))==1,422,"UNSUPPORTED_EVENT_VERSION");require(event.get("payload") instanceof Map<?,?>,422,"INVALID_EVENT");@SuppressWarnings("unchecked")var p=(Map<String,Object>)event.get("payload");UUID eventId=id(event.get("event_id"));require(Set.of("catalog.destination.changed.v1","catalog.place.upserted.v1","catalog.place.visibility-changed.v1","identity.user.status-changed.v1","identity.user.deletion-requested.v1").contains(type),422,"UNSUPPORTED_EVENT");
        if(type.startsWith("identity."))s.lockUser(id(p.get("user_id")));
        if(s.update(INSERT_INBOX_EVENTS_3,eventId)==0)return;
        if(type.equals("catalog.destination.changed.v1")){destination(p);}
        else if(type.startsWith("catalog.place.")){UUID place=id(p.get("place_id"));long version=number(p.get("version"));String status=Objects.toString(p.get("status"),"");require(Set.of("DRAFT","PUBLISHED","HIDDEN","ARCHIVED").contains(status)&&version>0,422,"INVALID_VISIBILITY");
            var trips=s.queryForList(SELECT_TRIPS_4,place,version);
            s.update(UPDATE_PLACE_SNAPSHOTS_5,status,version,place,version);
            for(var trip:trips)s.changed((UUID)trip.get("trip_id"),(UUID)trip.get("user_id"),"PLACE_VISIBILITY_CHANGED");
        }else if(type.equals("identity.user.status-changed.v1")){UUID user=id(p.get("user_id"));String status=p.get("status").toString();long version=number(p.get("version"));require(Set.of("ACTIVE","DISABLED","DELETED","LOCKED").contains(status),422,"INVALID_USER_STATUS");s.update(INSERT_USER_STATUS_6,user,status,version);
        }else{UUID user=id(p.get("user_id")),request=id(p.get("deletion_request_id"));s.queryForList(SELECT_TRIPS_7,user);s.update(INSERT_USER_TOMBSTONES_8,user,request);s.update(DELETE_OUTBOX_EVENTS_9,user.toString());s.update(DELETE_TRIPS_10,user);s.update(DELETE_IDEMPOTENCY_RECORDS_11,user.toString());s.queryForList(PURGE_USER_AUDIT,user);s.update(DELETE_USER_STATUS_13,user);s.event(request,number(event.get("aggregate_version")),"domain.user-data-deleted.v1",map("deletion_request_id",request,"service","trip","status","COMPLETED","artifact_handling","Trips, snapshots, items, transfers, private audit and idempotency data purged; tombstone retained"));}
    }
}
