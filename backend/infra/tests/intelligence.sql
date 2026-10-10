BEGIN;
INSERT INTO intelligence.interactions(event_id,event_type,session_id,occurred_at) VALUES
 ('ffffffff-0000-4000-8000-000000000001','SEARCH','ffffffff-0000-4000-8000-000000000002',now());
DO $$ BEGIN
  BEGIN
    INSERT INTO intelligence.interactions(event_id,event_type,session_id,occurred_at) VALUES
      ('ffffffff-0000-4000-8000-000000000001','SEARCH','ffffffff-0000-4000-8000-000000000002',now());
    RAISE EXCEPTION 'duplicate interaction accepted'; EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO intelligence.interactions(event_id,event_type,session_id,occurred_at) VALUES
      ('ffffffff-0000-4000-8000-000000000003','PLACE_VIEW','ffffffff-0000-4000-8000-000000000002',now());
    RAISE EXCEPTION 'view without place accepted'; EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
INSERT INTO intelligence.dataset_versions(dataset_version_id,name,criteria,feature_schema_version,row_count,artifact_object_key,checksum) VALUES
 ('ffffffff-0000-4000-8000-000000000004','Synthetic fixture','{}','fixture-v1',0,'fixture/empty',repeat('a',64));
DO $$ BEGIN
  BEGIN
    INSERT INTO intelligence.dataset_sources(dataset_version_id,source_id,source_version,license_version,allow_training_snapshot) VALUES
      ('ffffffff-0000-4000-8000-000000000004','ffffffff-0000-4000-8000-000000000005',1,'fixture-v1',false);
    RAISE EXCEPTION 'forbidden training source accepted'; EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
ROLLBACK;
