-- SPECIFICATION ONLY: trip_db.
CREATE SCHEMA trip;

CREATE TABLE trip.trips (
  trip_id uuid PRIMARY KEY,
  user_id uuid NOT NULL, -- external Identity owner
  title varchar(200) NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  timezone varchar(64) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  budget numeric(14,2) CHECK (budget IS NULL OR budget >= 0),
  currency char(3) NOT NULL DEFAULT 'VND' CHECK (currency ~ '^[A-Z]{3}$'),
  people_count integer NOT NULL DEFAULT 1 CHECK (people_count > 0),
  status varchar(16) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PLANNED','COMPLETED','CANCELLED')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (end_date >= start_date)
);

CREATE TABLE trip.trip_destinations (
  trip_destination_id uuid PRIMARY KEY,
  trip_id uuid NOT NULL REFERENCES trip.trips(trip_id) ON DELETE CASCADE,
  destination_id uuid NOT NULL, -- external Catalog; may repeat on another segment
  destination_name_snapshot varchar(200) NOT NULL,
  source_version bigint NOT NULL CHECK (source_version > 0),
  sequence_no integer NOT NULL CHECK (sequence_no >= 0),
  planned_days integer CHECK (planned_days IS NULL OR planned_days > 0),
  note text,
  UNIQUE (trip_id, trip_destination_id),
  UNIQUE (trip_id, sequence_no) DEFERRABLE INITIALLY IMMEDIATE
);

CREATE TABLE trip.trip_days (
  day_id uuid PRIMARY KEY,
  trip_id uuid NOT NULL REFERENCES trip.trips(trip_id) ON DELETE CASCADE,
  trip_destination_id uuid,
  local_date date NOT NULL,
  day_no integer NOT NULL CHECK (day_no > 0),
  timezone varchar(64) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  note text,
  UNIQUE (trip_id, day_id),
  UNIQUE (trip_id, local_date) DEFERRABLE INITIALLY IMMEDIATE,
  UNIQUE (trip_id, day_no) DEFERRABLE INITIALLY IMMEDIATE,
  FOREIGN KEY (trip_id, trip_destination_id) REFERENCES trip.trip_destinations(trip_id, trip_destination_id)
);

CREATE TABLE trip.place_snapshots (
  trip_id uuid NOT NULL REFERENCES trip.trips(trip_id) ON DELETE CASCADE,
  place_id uuid NOT NULL, -- external Catalog
  name varchar(240) NOT NULL,
  address text NOT NULL,
  latitude numeric(9,6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric(9,6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  timezone varchar(64) NOT NULL,
  opening_hours_snapshot jsonb NOT NULL DEFAULT '[]',
  source_version bigint NOT NULL CHECK (source_version > 0),
  captured_at timestamptz NOT NULL DEFAULT now(),
  unavailable_at timestamptz,
  PRIMARY KEY (trip_id, place_id)
);

CREATE TABLE trip.itinerary_items (
  item_id uuid PRIMARY KEY,
  trip_id uuid NOT NULL REFERENCES trip.trips(trip_id) ON DELETE CASCADE,
  day_id uuid NOT NULL,
  place_id uuid NOT NULL,
  starts_at timestamptz,
  duration_min integer NOT NULL CHECK (duration_min > 0),
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  note text,
  estimated_cost numeric(14,2) CHECK (estimated_cost IS NULL OR estimated_cost >= 0),
  source varchar(16) NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL','BASIC_RECO','MODEL')),
  recommendation_request_id uuid, -- external Intelligence; nullable for manual
  locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (trip_id, day_id) REFERENCES trip.trip_days(trip_id, day_id) ON DELETE CASCADE,
  FOREIGN KEY (trip_id, place_id) REFERENCES trip.place_snapshots(trip_id, place_id),
  UNIQUE (day_id, sort_order) DEFERRABLE INITIALLY IMMEDIATE
);

CREATE TABLE trip.transfer_items (
  transfer_id uuid PRIMARY KEY,
  trip_id uuid NOT NULL REFERENCES trip.trips(trip_id) ON DELETE CASCADE,
  day_id uuid,
  from_trip_destination_id uuid NOT NULL,
  to_trip_destination_id uuid NOT NULL,
  starts_at timestamptz,
  ends_at timestamptz,
  travel_time_min integer CHECK (travel_time_min IS NULL OR travel_time_min >= 0),
  distance_m integer CHECK (distance_m IS NULL OR distance_m >= 0),
  transport_mode varchar(20) NOT NULL CHECK (transport_mode IN ('WALK','DRIVE','BICYCLE','TRANSIT','FLIGHT','OTHER')),
  route_meta jsonb NOT NULL DEFAULT '{}',
  note text,
  FOREIGN KEY (trip_id, day_id) REFERENCES trip.trip_days(trip_id, day_id),
  FOREIGN KEY (trip_id, from_trip_destination_id) REFERENCES trip.trip_destinations(trip_id, trip_destination_id),
  FOREIGN KEY (trip_id, to_trip_destination_id) REFERENCES trip.trip_destinations(trip_id, trip_destination_id),
  CHECK (from_trip_destination_id <> to_trip_destination_id),
  CHECK (ends_at IS NULL OR (starts_at IS NOT NULL AND ends_at >= starts_at))
);

CREATE TABLE trip.route_estimates (
  route_key varchar(64) PRIMARY KEY,
  provider varchar(40) NOT NULL,
  transport_mode varchar(20) NOT NULL,
  distance_m integer NOT NULL CHECK (distance_m >= 0),
  duration_sec integer NOT NULL CHECK (duration_sec >= 0),
  route_payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > fetched_at)
);

CREATE INDEX trip_owner_idx ON trip.trips(user_id, updated_at DESC, trip_id) WHERE deleted_at IS NULL;
CREATE INDEX trip_destination_ref_idx ON trip.trip_destinations(destination_id);
CREATE INDEX day_destination_idx ON trip.trip_days(trip_id, trip_destination_id);
CREATE INDEX itinerary_trip_place_idx ON trip.itinerary_items(trip_id, place_id);
CREATE INDEX snapshot_place_idx ON trip.place_snapshots(place_id);
CREATE INDEX transfer_trip_idx ON trip.transfer_items(trip_id, starts_at);
CREATE INDEX route_expiry_idx ON trip.route_estimates(expires_at);

-- Infrastructure tables local to this service; no cross-database access.
CREATE TABLE trip.outbox_events (
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
CREATE TABLE trip.inbox_events (
  consumer_name varchar(100) NOT NULL,
  event_id uuid NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer_name, event_id)
);
CREATE TABLE trip.audit_logs (
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
CREATE TABLE trip.idempotency_records (
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
CREATE INDEX outbox_pending_idx ON trip.outbox_events(available_at, occurred_at) WHERE published_at IS NULL;
CREATE INDEX audit_entity_idx ON trip.audit_logs(entity_type, entity_id, created_at);
CREATE INDEX idempotency_expiry_idx ON trip.idempotency_records(expires_at);
