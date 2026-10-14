ALTER TABLE intelligence.outbox_events ADD COLUMN failed_at timestamptz;
CREATE INDEX outbox_failed_idx ON intelligence.outbox_events(failed_at) WHERE failed_at IS NOT NULL;
