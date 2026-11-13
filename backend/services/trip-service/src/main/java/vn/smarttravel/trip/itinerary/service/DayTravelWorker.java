package vn.smarttravel.trip.itinerary.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import vn.smarttravel.trip.itinerary.client.RoutingAdapter;
import vn.smarttravel.trip.itinerary.repository.TripStore;
import java.util.*;
import static vn.smarttravel.trip.shared.web.ApiValues.*;

/** Durable pending work with a lease; HTTP routing never runs inside a DB transaction. */
@Component
public class DayTravelWorker {
    private final TripStore store;
    private final RoutingAdapter routing;
    private final TransactionTemplate transaction;
    private final boolean enabled;
    public DayTravelWorker(TripStore store,RoutingAdapter routing,PlatformTransactionManager manager,@Value("${trip.travel-worker.enabled:true}") boolean enabled) {
        this.store=store;this.routing=routing;this.transaction=new TransactionTemplate(manager);this.enabled=enabled;
    }

    @Scheduled(fixedDelayString="${trip.travel-worker.delay-ms:1000}",scheduler="dayTravelScheduler")
    public void tick() {
        if(!enabled) return;
        for(int index=0;index<8;index++) if(!processOne()) break;
    }

    public boolean processOne() {
        var work=transaction.execute(status->{
            var rows=store.pendingTravelWork();
            if(rows.isEmpty()) return null;
            var row=rows.getFirst();store.claimTravelLeg(row.get("leg_id"));return row;
        });
        if(work==null) return false;
        Map<String,Object> route;
        try {
            route=routing.estimate(map("latitude",work.get("from_latitude"),"longitude",work.get("from_longitude")),map("latitude",work.get("to_latitude"),"longitude",work.get("to_longitude")),work.get("transport_mode").toString());
        } catch(Exception failure) {
            route=map("distance_m",null,"duration_seconds",null,"fallback",false,"warning","ROUTING_FAILED");
        }
        var result=route;
        transaction.executeWithoutResult(status->store.completeTravelLeg(result.get("distance_m")==null?"FAILED":Boolean.TRUE.equals(result.get("fallback"))?"FALLBACK":"READY",result.get("distance_m"),result.get("duration_seconds"),Boolean.TRUE.equals(result.get("fallback")),store.encode(result),work.get("leg_id"),work.get("route_token")));
        return true;
    }
}
