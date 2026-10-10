BEGIN;
INSERT INTO catalog.geographic_units(geographic_unit_id,unit_type,code,name_vi,version,valid_from,status) VALUES
 ('ffffffff-0000-4000-8000-000000000001','PROVINCE','P01-SYNTHETIC','Synthetic fixture',1,'2026-01-01','ACTIVE');
INSERT INTO catalog.places(place_id,geographic_unit_id,name_vi,address,location) VALUES
 ('ffffffff-0000-4000-8000-000000000002','ffffffff-0000-4000-8000-000000000001','Fixture','Synthetic',ST_SetSRID(ST_MakePoint(106.7,10.7),4326)::geography);
DO $$ BEGIN
  IF NOT (SELECT ST_DWithin(location,ST_SetSRID(ST_MakePoint(106.7,10.7),4326)::geography,1) FROM catalog.places WHERE place_id='ffffffff-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'PostGIS distance incorrect';
  END IF;
  BEGIN
    INSERT INTO catalog.place_rating_summary(place_id,review_count,rating_sum,source_version,as_of) VALUES
      ('ffffffff-0000-4000-8000-000000000002',1,6,1,now());
    RAISE EXCEPTION 'invalid rating accepted'; EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO catalog.opening_hours(opening_hour_id,place_id,day_of_week,open_time,close_time,valid_from) VALUES
      ('ffffffff-0000-4000-8000-000000000003','ffffffff-0000-4000-8000-000000000002',1,'22:00','02:00','2026-01-01');
    RAISE EXCEPTION 'overnight without offset accepted'; EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
INSERT INTO catalog.opening_hours(opening_hour_id,place_id,day_of_week,open_time,close_time,end_day_offset,valid_from) VALUES
 ('ffffffff-0000-4000-8000-000000000003','ffffffff-0000-4000-8000-000000000002',1,'22:00','02:00',1,'2026-01-01');
ROLLBACK;
