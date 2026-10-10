-- Stable option IDs; test accounts are deliberately NOT installed in production migrations.
ALTER TABLE identity.users ALTER COLUMN display_name TYPE varchar(1024);
INSERT INTO identity.preference_options(option_id,kind,code,label_vi) VALUES
('00000000-0000-4000-8000-000000000101','TRAVEL_STYLE','CULTURE','Văn hóa'),
('00000000-0000-4000-8000-000000000102','TRAVEL_STYLE','NATURE','Thiên nhiên'),
('00000000-0000-4000-8000-000000000103','FOOD_PREFERENCE','VEGETARIAN','Ăn chay');
UPDATE identity.user_preferences SET budget_level='MID' WHERE budget_level IS NULL;
ALTER TABLE identity.user_preferences ALTER COLUMN budget_level SET DEFAULT 'MID';

-- Two operational tables in addition to the 18 domain/baseline technical tables.
CREATE TABLE identity.auth_rate_limits (
  bucket_hash varchar(64) PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL CHECK (attempts > 0)
);
CREATE TABLE identity.account_mail_jobs (
  job_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES identity.users(user_id),
  encrypted_message text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  failed_at timestamptz
);
CREATE INDEX account_mail_pending_idx ON identity.account_mail_jobs(available_at)
  WHERE sent_at IS NULL AND failed_at IS NULL;
GRANT SELECT,INSERT,UPDATE,DELETE ON identity.auth_rate_limits,identity.account_mail_jobs TO identity_runtime;
