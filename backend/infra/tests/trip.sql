BEGIN;
INSERT INTO trip.trips(trip_id,user_id,title,start_date,end_date) VALUES
 ('ffffffff-0000-4000-8000-000000000001','ffffffff-0000-4000-8000-000000000010','Probe A','2026-10-01','2026-10-03'),
 ('ffffffff-0000-4000-8000-000000000002','ffffffff-0000-4000-8000-000000000010','Probe B','2026-10-01','2026-10-03');
INSERT INTO trip.trip_days(day_id,trip_id,local_date,day_no) VALUES
 ('ffffffff-0000-4000-8000-000000000003','ffffffff-0000-4000-8000-000000000001','2026-10-01',1),
 ('ffffffff-0000-4000-8000-000000000004','ffffffff-0000-4000-8000-000000000001','2026-10-02',2);
INSERT INTO trip.place_snapshots(trip_id,place_id,name,address,latitude,longitude,timezone,source_version) VALUES
 ('ffffffff-0000-4000-8000-000000000002','ffffffff-0000-4000-8000-000000000005','Fixture','Synthetic',10.7,106.7,'Asia/Ho_Chi_Minh',1);
DO $$ BEGIN
  BEGIN
    INSERT INTO trip.itinerary_items(item_id,trip_id,day_id,place_id,duration_min,sort_order) VALUES
      ('ffffffff-0000-4000-8000-000000000006','ffffffff-0000-4000-8000-000000000002',
       'ffffffff-0000-4000-8000-000000000003','ffffffff-0000-4000-8000-000000000005',30,0);
    RAISE EXCEPTION 'cross-trip day accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END $$;
-- Reordering requires deferral, not delete/reinsert.
SET CONSTRAINTS ALL DEFERRED;
UPDATE trip.trip_days SET day_no=CASE day_no WHEN 1 THEN 2 ELSE 1 END WHERE trip_id='ffffffff-0000-4000-8000-000000000001';
SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;
