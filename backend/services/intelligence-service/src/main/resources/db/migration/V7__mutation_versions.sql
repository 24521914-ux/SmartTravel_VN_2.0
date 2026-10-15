ALTER TABLE intelligence.training_jobs ADD COLUMN mutation_version bigint NOT NULL DEFAULT 1 CHECK(mutation_version>0);
ALTER TABLE intelligence.model_versions ADD COLUMN mutation_version bigint NOT NULL DEFAULT 1 CHECK(mutation_version>0);
