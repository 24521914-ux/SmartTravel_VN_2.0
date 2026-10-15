package vn.smarttravel.trip.itinerary.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.*;

/** Opt-in fixture data only. This is never a production migration. */
@Repository
public class LocalFixturesRepository {
    private final JdbcTemplate db;
    public LocalFixturesRepository(JdbcTemplate db){this.db=db;}
    public void seed(){UUID trip=UUID.fromString("40000000-0000-4000-8000-000000000001"),owner=UUID.fromString("00000000-0000-4000-8000-000000000001");if(db.queryForObject("SELECT count(*) FROM trip.trips WHERE trip_id=?",Long.class,trip)>0)return;
        db.update("INSERT INTO trip.trips(trip_id,user_id,title,start_date,end_date,budget) VALUES (?,?,'SYNTHETIC FIXTURE — multi-destination itinerary','2026-10-01','2026-10-03',100000)",trip,owner);
        for(int i=1;i<=2;i++){UUID segment=UUID.fromString("41000000-0000-4000-8000-00000000000"+i),destination=UUID.fromString("50000000-0000-4000-8000-00000000000"+i);db.update("INSERT INTO trip.trip_destinations(trip_destination_id,trip_id,destination_id,destination_name_snapshot,source_version,sequence_no,start_date,end_date) VALUES (?,?,?,'SYNTHETIC destination',1,?,'2026-10-01','2026-10-03')",segment,trip,destination,i-1);}
        for(int i=1;i<=3;i++){UUID day=UUID.fromString("42000000-0000-4000-8000-00000000000"+i);db.update("INSERT INTO trip.trip_days(day_id,trip_id,local_date,day_no) VALUES (?,?,?::date,?)",day,trip,"2026-10-0"+i,i);}
        for(int i=1;i<=2;i++){UUID place=UUID.fromString("10000000-0000-4000-8000-00000000000"+i),item=UUID.fromString("43000000-0000-4000-8000-00000000000"+i),day=UUID.fromString("42000000-0000-4000-8000-000000000001");String snapshot="{\"place_id\":\""+place+"\",\"name\":\"SYNTHETIC place "+i+"\",\"status\":\"PUBLISHED\",\"version\":1,\"latitude\":10.76,\"longitude\":106.66,\"category_ids\":[],\"tag_ids\":[],\"amenity_ids\":[],\"geographic_unit_id\":\"60000000-0000-4000-8000-000000000001\",\"destination_ids\":[],\"price\":10000,\"currency\":\"VND\",\"opening_hours\":[],\"media_keys\":[],\"source_version\":1}";db.update("INSERT INTO trip.place_snapshots(trip_id,place_id,name,address,latitude,longitude,timezone,source_version,price,catalog_snapshot) VALUES (?,?,'SYNTHETIC fixture place','SYNTHETIC address',10.76,106.66,'Asia/Ho_Chi_Minh',1,10000,?::jsonb)",trip,place,snapshot);db.update("INSERT INTO trip.itinerary_items(item_id,trip_id,day_id,place_id,duration_min,sort_order,note,estimated_cost) VALUES (?,?,?,?,45,?,'SYNTHETIC fixture visit',10000)",item,trip,day,place,i-1);}
    }
}
