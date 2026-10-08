-- Platform-only migration; not a domain table or production service migration.
CREATE TABLE platform_probe (
    probe_id UUID PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
