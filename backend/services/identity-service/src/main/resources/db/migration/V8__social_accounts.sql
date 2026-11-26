-- Additive social login provider links (Google, Facebook) for identity.users.
CREATE TABLE identity.social_accounts (
  social_account_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES identity.users(user_id) ON DELETE CASCADE,
  provider varchar(24) NOT NULL CHECK (provider IN ('GOOGLE','FACEBOOK')),
  provider_user_id varchar(255) NOT NULL,
  provider_email varchar(320),
  linked_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_user_id),
  UNIQUE (user_id, provider)
);

CREATE INDEX social_accounts_user_idx ON identity.social_accounts(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON identity.social_accounts TO identity_runtime;
