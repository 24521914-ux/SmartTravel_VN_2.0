-- Additive recovery metadata; immutable earlier migrations stay unchanged.
ALTER TABLE catalog.outbox_events ADD COLUMN failed_at timestamptz;
