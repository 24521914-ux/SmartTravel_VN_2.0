-- Frozen source-policy contract permits a 1024-character license identifier.
ALTER TABLE intelligence.source_policies ALTER COLUMN license_version TYPE varchar(1024);
ALTER TABLE intelligence.dataset_sources ALTER COLUMN license_version TYPE varchar(1024);
ALTER TABLE intelligence.training_jobs ALTER COLUMN code_revision TYPE varchar(1024);
