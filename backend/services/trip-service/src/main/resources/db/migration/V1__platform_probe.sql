-- P00 platform-only migration. Domain migration starts in P01.
CREATE TABLE platform_probe (probe_id UUID PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
