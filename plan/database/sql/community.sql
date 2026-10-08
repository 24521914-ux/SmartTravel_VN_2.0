-- SPECIFICATION ONLY: community_db.
CREATE SCHEMA community;

CREATE TABLE community.reviews (
  review_id uuid PRIMARY KEY,
  user_id uuid NOT NULL, -- external Identity
  place_id uuid NOT NULL, -- external Catalog
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 10000),
  status varchar(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','HIDDEN','DELETED')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, place_id)
);

CREATE TABLE community.place_rating_summaries (
  place_id uuid PRIMARY KEY, -- external Catalog
  review_count integer NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  rating_sum bigint NOT NULL DEFAULT 0 CHECK (rating_sum >= 0),
  rating_avg numeric(4,3) GENERATED ALWAYS AS (CASE WHEN review_count = 0 THEN NULL ELSE rating_sum::numeric / review_count END) STORED,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (rating_sum BETWEEN review_count AND review_count::bigint * 5)
);

CREATE TABLE community.favorites (
  user_id uuid NOT NULL, -- external Identity
  place_id uuid NOT NULL, -- external Catalog
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, place_id)
);

CREATE TABLE community.collections (
  collection_id uuid PRIMARY KEY,
  user_id uuid NOT NULL, -- external Identity
  name varchar(160) NOT NULL,
  visibility varchar(12) NOT NULL DEFAULT 'PRIVATE' CHECK (visibility IN ('PRIVATE','PUBLIC')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE community.collection_items (
  collection_id uuid NOT NULL REFERENCES community.collections(collection_id) ON DELETE CASCADE,
  place_id uuid NOT NULL, -- external Catalog
  note text,
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, place_id),
  UNIQUE (collection_id, sort_order) DEFERRABLE INITIALLY IMMEDIATE
);

CREATE TABLE community.contributions (
  contribution_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL, -- external Identity
  actor_type varchar(16) NOT NULL CHECK (actor_type IN ('USER','BUSINESS','ADMIN')),
  contribution_type varchar(20) NOT NULL CHECK (contribution_type IN ('ADD_PLACE','SUGGEST_EDIT')),
  target_place_id uuid, -- external Catalog; NULL only for ADD_PLACE
  expected_place_version bigint,
  payload jsonb NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','APPLYING','APPLIED','APPLY_FAILED','REJECTED','WITHDRAWN')),
  apply_command_id uuid UNIQUE,
  resulting_place_id uuid, -- external Catalog result
  reason text,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((contribution_type = 'ADD_PLACE' AND target_place_id IS NULL) OR
    (contribution_type = 'SUGGEST_EDIT' AND target_place_id IS NOT NULL AND expected_place_version IS NOT NULL AND expected_place_version > 0))
);

CREATE TABLE community.review_reports (
  report_id uuid PRIMARY KEY,
  review_id uuid NOT NULL REFERENCES community.reviews(review_id),
  reporter_user_id uuid NOT NULL, -- external Identity
  reason_code varchar(40) NOT NULL,
  detail text,
  status varchar(16) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED','DISMISSED')),
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, reporter_user_id)
);

CREATE TABLE community.moderation_actions (
  action_id uuid PRIMARY KEY,
  review_id uuid REFERENCES community.reviews(review_id),
  contribution_id uuid REFERENCES community.contributions(contribution_id),
  moderator_id uuid NOT NULL, -- external Identity admin
  decision varchar(20) NOT NULL CHECK (decision IN ('APPROVE','REJECT','HIDE','RESTORE')),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(review_id, contribution_id) = 1)
);

CREATE TABLE community.media_assets (
  media_id uuid PRIMARY KEY,
  object_key text NOT NULL UNIQUE,
  checksum varchar(64) NOT NULL,
  mime_type varchar(100) NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  created_by uuid NOT NULL, -- external Identity
  source_id uuid, -- external Ingestion, optional provenance
  moderation_status varchar(16) NOT NULL DEFAULT 'PENDING' CHECK (moderation_status IN ('PENDING','APPROVED','REJECTED')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE community.review_media (
  review_id uuid NOT NULL REFERENCES community.reviews(review_id) ON DELETE CASCADE,
  media_id uuid NOT NULL REFERENCES community.media_assets(media_id),
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  PRIMARY KEY (review_id, media_id),
  UNIQUE (review_id, sort_order) DEFERRABLE INITIALLY IMMEDIATE
);

CREATE TABLE community.contribution_media (
  contribution_id uuid NOT NULL REFERENCES community.contributions(contribution_id) ON DELETE CASCADE,
  media_id uuid NOT NULL REFERENCES community.media_assets(media_id),
  PRIMARY KEY (contribution_id, media_id)
);

CREATE TABLE community.place_visibility (
  place_id uuid PRIMARY KEY, -- external Catalog projection
  status varchar(16) NOT NULL CHECK (status IN ('DRAFT','PUBLISHED','HIDDEN','ARCHIVED')),
  source_version bigint NOT NULL CHECK (source_version > 0),
  as_of timestamptz NOT NULL
);

CREATE INDEX review_public_idx ON community.reviews(place_id, created_at DESC, review_id) WHERE status = 'APPROVED';
CREATE INDEX review_moderation_idx ON community.reviews(status, updated_at);
CREATE INDEX favorite_history_idx ON community.favorites(user_id, created_at DESC, place_id);
CREATE INDEX collections_owner_idx ON community.collections(user_id, updated_at DESC);
CREATE INDEX contribution_queue_idx ON community.contributions(status, created_at);
CREATE INDEX contribution_actor_idx ON community.contributions(actor_id, created_at DESC);
CREATE INDEX report_queue_idx ON community.review_reports(status, created_at);
CREATE INDEX moderation_review_idx ON community.moderation_actions(review_id, created_at);
CREATE INDEX moderation_contribution_idx ON community.moderation_actions(contribution_id, created_at);

-- Infrastructure tables local to this service; no cross-database access.
CREATE TABLE community.outbox_events (
  event_id uuid PRIMARY KEY,
  aggregate_type varchar(80) NOT NULL,
  aggregate_id varchar(160) NOT NULL,
  aggregate_version bigint NOT NULL CHECK (aggregate_version > 0),
  event_type varchar(120) NOT NULL,
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE community.inbox_events (
  consumer_name varchar(100) NOT NULL,
  event_id uuid NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer_name, event_id)
);
CREATE TABLE community.audit_logs (
  audit_id uuid PRIMARY KEY,
  actor_id uuid,
  actor_type varchar(20) NOT NULL,
  entity_type varchar(80) NOT NULL,
  entity_id varchar(160) NOT NULL,
  action varchar(80) NOT NULL,
  old_value jsonb,
  new_value jsonb,
  correlation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE community.idempotency_records (
  scope varchar(100) NOT NULL,
  actor_key varchar(160) NOT NULL,
  idempotency_key varchar(160) NOT NULL,
  request_hash varchar(64) NOT NULL,
  response_status smallint NOT NULL CHECK (response_status BETWEEN 100 AND 599),
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (scope, actor_key, idempotency_key),
  CHECK (expires_at > created_at)
);
CREATE INDEX outbox_pending_idx ON community.outbox_events(available_at, occurred_at) WHERE published_at IS NULL;
CREATE INDEX audit_entity_idx ON community.audit_logs(entity_type, entity_id, created_at);
CREATE INDEX idempotency_expiry_idx ON community.idempotency_records(expires_at);
