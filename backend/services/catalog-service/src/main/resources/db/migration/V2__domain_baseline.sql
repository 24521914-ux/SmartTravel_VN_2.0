-- P01 baseline adapted from plan/database/sql/catalog.sql. Platform provisions PostGIS.
CREATE SCHEMA catalog;

CREATE TABLE catalog.geographic_units (
  geographic_unit_id uuid PRIMARY KEY,
  parent_id uuid REFERENCES catalog.geographic_units(geographic_unit_id),
  unit_type varchar(24) NOT NULL,
  code varchar(64) NOT NULL,
  name_vi varchar(200) NOT NULL,
  name_en varchar(200),
  version integer NOT NULL CHECK (version > 0),
  valid_from date NOT NULL,
  valid_to date,
  status varchar(16) NOT NULL CHECK (status IN ('ACTIVE','RETIRED')),
  boundary geometry(MultiPolygon,4326),
  UNIQUE (unit_type, code, version),
  CHECK (parent_id IS NULL OR parent_id <> geographic_unit_id),
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE TABLE catalog.geographic_aliases (
  alias_id uuid PRIMARY KEY,
  geographic_unit_id uuid NOT NULL REFERENCES catalog.geographic_units(geographic_unit_id),
  alias varchar(200) NOT NULL,
  normalized_alias varchar(200) NOT NULL,
  language varchar(16) NOT NULL DEFAULT 'vi',
  valid_from date NOT NULL,
  valid_to date,
  UNIQUE (geographic_unit_id, normalized_alias, language, valid_from),
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE TABLE catalog.destinations (
  destination_id uuid PRIMARY KEY,
  name_vi varchar(200) NOT NULL,
  name_en varchar(200),
  destination_type varchar(40) NOT NULL,
  summary text,
  status varchar(16) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','HIDDEN','ARCHIVED')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE catalog.destination_geo (
  destination_id uuid NOT NULL REFERENCES catalog.destinations(destination_id) ON DELETE CASCADE,
  geographic_unit_id uuid NOT NULL REFERENCES catalog.geographic_units(geographic_unit_id),
  PRIMARY KEY (destination_id, geographic_unit_id)
);

CREATE TABLE catalog.categories (
  category_id uuid PRIMARY KEY,
  parent_id uuid REFERENCES catalog.categories(category_id),
  code varchar(64) NOT NULL UNIQUE,
  name_vi varchar(160) NOT NULL,
  name_en varchar(160),
  active boolean NOT NULL DEFAULT true,
  CHECK (parent_id IS NULL OR parent_id <> category_id)
);

CREATE TABLE catalog.places (
  place_id uuid PRIMARY KEY,
  geographic_unit_id uuid NOT NULL REFERENCES catalog.geographic_units(geographic_unit_id),
  name_vi varchar(240) NOT NULL,
  name_en varchar(240),
  description text,
  address text NOT NULL,
  location geography(Point,4326) NOT NULL,
  timezone varchar(64) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  price_min numeric(14,2),
  price_max numeric(14,2),
  currency char(3) NOT NULL DEFAULT 'VND' CHECK (currency ~ '^[A-Z]{3}$'),
  status varchar(16) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','HIDDEN','ARCHIVED')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  search_document tsvector,
  created_by uuid, -- external Identity user or NULL for system
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CHECK (price_min IS NULL OR price_min >= 0),
  CHECK (price_max IS NULL OR price_max >= 0),
  CHECK (price_min IS NULL OR price_max IS NULL OR price_max >= price_min),
  CHECK ((status = 'ARCHIVED') = (archived_at IS NOT NULL))
);

CREATE TABLE catalog.place_aliases (
  alias_id uuid PRIMARY KEY,
  place_id uuid NOT NULL REFERENCES catalog.places(place_id),
  alias varchar(240) NOT NULL,
  normalized_alias varchar(240) NOT NULL,
  source_id uuid, -- external Ingestion source, NULL for manual alias
  UNIQUE NULLS NOT DISTINCT (place_id, normalized_alias, source_id)
);

CREATE TABLE catalog.place_categories (
  place_id uuid NOT NULL REFERENCES catalog.places(place_id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES catalog.categories(category_id),
  PRIMARY KEY (place_id, category_id)
);

CREATE TABLE catalog.tags (
  tag_id uuid PRIMARY KEY,
  code varchar(64) NOT NULL UNIQUE,
  name_vi varchar(160) NOT NULL,
  name_en varchar(160)
);

CREATE TABLE catalog.place_tags (
  place_id uuid NOT NULL REFERENCES catalog.places(place_id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES catalog.tags(tag_id),
  PRIMARY KEY (place_id, tag_id)
);

CREATE TABLE catalog.amenities (
  amenity_id uuid PRIMARY KEY,
  code varchar(64) NOT NULL UNIQUE,
  name_vi varchar(160) NOT NULL,
  name_en varchar(160)
);

CREATE TABLE catalog.place_amenities (
  place_id uuid NOT NULL REFERENCES catalog.places(place_id) ON DELETE CASCADE,
  amenity_id uuid NOT NULL REFERENCES catalog.amenities(amenity_id),
  PRIMARY KEY (place_id, amenity_id)
);

CREATE TABLE catalog.opening_hours (
  opening_hour_id uuid PRIMARY KEY,
  place_id uuid NOT NULL REFERENCES catalog.places(place_id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time time NOT NULL,
  close_time time NOT NULL,
  end_day_offset smallint NOT NULL DEFAULT 0 CHECK (end_day_offset IN (0,1)),
  valid_from date NOT NULL,
  valid_to date,
  CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CHECK (end_day_offset = 1 OR close_time > open_time),
  UNIQUE (place_id, day_of_week, open_time, valid_from)
);

CREATE TABLE catalog.opening_exceptions (
  exception_id uuid PRIMARY KEY,
  place_id uuid NOT NULL REFERENCES catalog.places(place_id) ON DELETE CASCADE,
  local_date date NOT NULL,
  is_closed boolean NOT NULL,
  open_time time,
  close_time time,
  end_day_offset smallint NOT NULL DEFAULT 0 CHECK (end_day_offset IN (0,1)),
  reason text,
  CHECK ((is_closed AND open_time IS NULL AND close_time IS NULL AND end_day_offset = 0) OR
    (NOT is_closed AND open_time IS NOT NULL AND close_time IS NOT NULL AND (end_day_offset = 1 OR close_time > open_time))),
  UNIQUE NULLS NOT DISTINCT (place_id, local_date, open_time)
);

CREATE TABLE catalog.media_assets (
  media_id uuid PRIMARY KEY,
  object_key text NOT NULL UNIQUE,
  checksum varchar(64) NOT NULL,
  mime_type varchar(100) NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  source_id uuid, -- external Ingestion
  created_by uuid, -- external Identity
  moderation_status varchar(16) NOT NULL DEFAULT 'PENDING' CHECK (moderation_status IN ('PENDING','APPROVED','REJECTED')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE catalog.place_media (
  place_id uuid NOT NULL REFERENCES catalog.places(place_id) ON DELETE CASCADE,
  media_id uuid NOT NULL REFERENCES catalog.media_assets(media_id),
  alt_text varchar(300),
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  PRIMARY KEY (place_id, media_id),
  UNIQUE (place_id, sort_order) DEFERRABLE INITIALLY IMMEDIATE
);

CREATE TABLE catalog.offerings (
  offering_id uuid PRIMARY KEY,
  place_id uuid REFERENCES catalog.places(place_id),
  destination_id uuid REFERENCES catalog.destinations(destination_id),
  item_type varchar(16) NOT NULL CHECK (item_type IN ('SERVICE','TOUR','EVENT','ACTIVITY','EXPERIENCE')),
  name_vi varchar(240) NOT NULL,
  name_en varchar(240),
  description text,
  price_min numeric(14,2),
  price_max numeric(14,2),
  currency char(3) NOT NULL DEFAULT 'VND' CHECK (currency ~ '^[A-Z]{3}$'),
  status varchar(16) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','HIDDEN','ARCHIVED')),
  metadata jsonb NOT NULL DEFAULT '{}',
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (place_id IS NOT NULL OR destination_id IS NOT NULL),
  CHECK (price_min IS NULL OR price_min >= 0),
  CHECK (price_max IS NULL OR price_max >= 0),
  CHECK (price_min IS NULL OR price_max IS NULL OR price_min <= price_max)
);

CREATE TABLE catalog.offering_schedules (
  schedule_id uuid PRIMARY KEY,
  offering_id uuid NOT NULL REFERENCES catalog.offerings(offering_id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  timezone varchar(64) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  UNIQUE (offering_id, starts_at),
  CHECK (ends_at > starts_at)
);

CREATE TABLE catalog.businesses (
  business_id uuid PRIMARY KEY,
  owner_user_id uuid NOT NULL, -- external Identity
  legal_name varchar(240),
  display_name varchar(240) NOT NULL,
  contact_email varchar(320),
  contact_phone varchar(32),
  verification_status varchar(16) NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING','VERIFIED','REJECTED','SUSPENDED')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE catalog.business_members (
  business_id uuid NOT NULL REFERENCES catalog.businesses(business_id) ON DELETE CASCADE,
  user_id uuid NOT NULL, -- external Identity
  member_role varchar(12) NOT NULL CHECK (member_role IN ('OWNER','MANAGER','EDITOR')),
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (business_id, user_id)
);

CREATE TABLE catalog.business_place_claims (
  claim_id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES catalog.businesses(business_id),
  place_id uuid NOT NULL REFERENCES catalog.places(place_id),
  claim_role varchar(16) NOT NULL CHECK (claim_role IN ('OWNER','MANAGER')),
  status varchar(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','REVOKED')),
  evidence_object_key text NOT NULL,
  reviewed_by uuid, -- external Identity admin
  reviewed_at timestamptz,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (claim_id, place_id)
);

CREATE TABLE catalog.change_requests (
  request_id uuid PRIMARY KEY,
  claim_id uuid NOT NULL,
  place_id uuid NOT NULL,
  submitted_by uuid NOT NULL, -- external Identity
  expected_place_version bigint NOT NULL CHECK (expected_place_version > 0),
  field_changes jsonb NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','CONFLICT')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (claim_id, place_id) REFERENCES catalog.business_place_claims(claim_id, place_id)
);

CREATE TABLE catalog.place_versions (
  place_version_id uuid PRIMARY KEY,
  place_id uuid NOT NULL REFERENCES catalog.places(place_id),
  version_no bigint NOT NULL CHECK (version_no > 0),
  snapshot jsonb NOT NULL,
  reason text NOT NULL,
  created_by uuid,
  source_id uuid, -- external Ingestion or NULL
  source_command_id uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (place_id, version_no)
);

CREATE TABLE catalog.place_rating_summary (
  place_id uuid PRIMARY KEY REFERENCES catalog.places(place_id),
  review_count integer NOT NULL CHECK (review_count >= 0),
  rating_sum bigint NOT NULL CHECK (rating_sum >= 0),
  rating_avg numeric(4,3) GENERATED ALWAYS AS (CASE WHEN review_count = 0 THEN NULL ELSE rating_sum::numeric / review_count END) STORED,
  source_version bigint NOT NULL CHECK (source_version > 0),
  as_of timestamptz NOT NULL,
  CHECK (rating_sum BETWEEN review_count AND review_count::bigint * 5)
);

CREATE INDEX geo_parent_idx ON catalog.geographic_units(parent_id);
CREATE INDEX geo_alias_lookup_idx ON catalog.geographic_aliases(normalized_alias);
CREATE INDEX destination_geo_unit_idx ON catalog.destination_geo(geographic_unit_id);
CREATE INDEX category_parent_idx ON catalog.categories(parent_id);
CREATE INDEX places_location_idx ON catalog.places USING gist(location);
CREATE INDEX places_search_idx ON catalog.places USING gin(search_document);
CREATE INDEX places_geo_status_idx ON catalog.places(geographic_unit_id, status, place_id);
CREATE INDEX places_price_idx ON catalog.places(currency, price_min, place_id) WHERE status = 'PUBLISHED';
CREATE INDEX place_alias_lookup_idx ON catalog.place_aliases(normalized_alias);
CREATE INDEX place_category_reverse_idx ON catalog.place_categories(category_id, place_id);
CREATE INDEX place_tag_reverse_idx ON catalog.place_tags(tag_id, place_id);
CREATE INDEX place_amenity_reverse_idx ON catalog.place_amenities(amenity_id, place_id);
CREATE INDEX opening_hours_place_idx ON catalog.opening_hours(place_id, day_of_week, valid_from);
CREATE INDEX offering_place_idx ON catalog.offerings(place_id, status);
CREATE INDEX offering_destination_idx ON catalog.offerings(destination_id, status);
CREATE INDEX offering_schedule_idx ON catalog.offering_schedules(starts_at, offering_id);
CREATE INDEX business_owner_idx ON catalog.businesses(owner_user_id);
CREATE INDEX member_user_idx ON catalog.business_members(user_id, business_id);
CREATE UNIQUE INDEX one_live_claim_idx ON catalog.business_place_claims(business_id, place_id) WHERE status IN ('PENDING','APPROVED');
CREATE UNIQUE INDEX one_place_owner_idx ON catalog.business_place_claims(place_id) WHERE claim_role = 'OWNER' AND status = 'APPROVED';
CREATE INDEX claim_place_idx ON catalog.business_place_claims(place_id, status);
CREATE INDEX change_request_queue_idx ON catalog.change_requests(status, created_at);
CREATE INDEX rating_sort_idx ON catalog.place_rating_summary(rating_avg DESC, review_count DESC);

-- Infrastructure tables local to this service; no cross-database access.
CREATE TABLE catalog.outbox_events (
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
CREATE TABLE catalog.inbox_events (
  consumer_name varchar(100) NOT NULL,
  event_id uuid NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer_name, event_id)
);
CREATE TABLE catalog.audit_logs (
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
CREATE TABLE catalog.idempotency_records (
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
CREATE INDEX outbox_pending_idx ON catalog.outbox_events(available_at, occurred_at) WHERE published_at IS NULL;
CREATE INDEX audit_entity_idx ON catalog.audit_logs(entity_type, entity_id, created_at);
CREATE INDEX idempotency_expiry_idx ON catalog.idempotency_records(expires_at);
