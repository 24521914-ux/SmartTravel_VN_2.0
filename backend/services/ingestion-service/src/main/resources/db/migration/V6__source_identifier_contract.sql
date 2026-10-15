-- Partner command/link contracts allow 1024-character source identifiers.
ALTER TABLE ingestion.raw_records ALTER COLUMN external_id TYPE varchar(1024);
ALTER TABLE ingestion.source_place_links ALTER COLUMN external_id TYPE varchar(1024);
