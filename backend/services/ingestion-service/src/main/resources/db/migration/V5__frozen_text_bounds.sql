-- Match frozen contract string lengths; earlier migration checksums remain immutable.
ALTER TABLE ingestion.data_sources ALTER COLUMN name TYPE varchar(1024);
ALTER TABLE ingestion.data_sources ALTER COLUMN license_version TYPE varchar(1024);
