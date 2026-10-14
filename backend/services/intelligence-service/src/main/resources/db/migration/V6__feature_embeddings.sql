-- pgvector is provisioned by the platform administrator, not the runtime workload.
ALTER TABLE intelligence.place_features ADD COLUMN embedding vector(3);
CREATE INDEX place_feature_embedding_idx ON intelligence.place_features USING hnsw(embedding vector_cosine_ops) WHERE status='PUBLISHED';
