BEGIN;
INSERT INTO ingestion.data_sources(source_id,code,name,source_type,license_terms,license_version) VALUES
 ('ffffffff-0000-4000-8000-000000000001','P01-SYNTHETIC','Synthetic test data','FILE','Synthetic fixture, no external data','fixture-v1');
INSERT INTO ingestion.import_jobs(job_id,source_id,idempotency_key,mode) VALUES
 ('ffffffff-0000-4000-8000-000000000002','ffffffff-0000-4000-8000-000000000001','p01-probe','FULL');
DO $$ BEGIN
  BEGIN
    INSERT INTO ingestion.import_jobs(job_id,source_id,idempotency_key,mode) VALUES
      ('ffffffff-0000-4000-8000-000000000003','ffffffff-0000-4000-8000-000000000001','p01-probe-2','FULL');
    RAISE EXCEPTION 'two active jobs accepted'; EXCEPTION WHEN unique_violation THEN NULL;
  END;
END $$;
INSERT INTO ingestion.raw_records(raw_id,source_id,external_id,first_job_id,payload,content_hash) VALUES
 ('ffffffff-0000-4000-8000-000000000004','ffffffff-0000-4000-8000-000000000001','synthetic-1',
  'ffffffff-0000-4000-8000-000000000002','{}',repeat('a',64));
DO $$ BEGIN
  BEGIN
    INSERT INTO ingestion.raw_records(raw_id,source_id,external_id,first_job_id,payload,content_hash) VALUES
      ('ffffffff-0000-4000-8000-000000000005','ffffffff-0000-4000-8000-000000000001','synthetic-1',
       'ffffffff-0000-4000-8000-000000000002','{}',repeat('a',64));
    RAISE EXCEPTION 'duplicate raw accepted'; EXCEPTION WHEN unique_violation THEN NULL;
  END;
END $$;
ROLLBACK;
