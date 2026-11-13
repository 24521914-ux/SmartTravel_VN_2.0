-- Derived edges of the authoritative itinerary, separate from UC14 transfers.
-- A road leg must never replace a flight, train or inter-destination transfer.
CREATE TABLE trip.day_travel_legs (
  leg_id uuid PRIMARY KEY,
  trip_id uuid NOT NULL REFERENCES trip.trips(trip_id) ON DELETE CASCADE,
  day_id uuid NOT NULL,
  from_item_id uuid NOT NULL,
  to_item_id uuid NOT NULL,
  transport_mode varchar(20) NOT NULL DEFAULT 'DRIVE'
    CHECK (transport_mode IN ('DRIVE','WALK','BICYCLE','SELF_MANAGED')),
  status varchar(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','READY','FALLBACK','FAILED','SELF_MANAGED')),
  coordinates_key text NOT NULL,
  route_token uuid NOT NULL,
  claimed_at timestamptz,
  distance_m integer CHECK (distance_m IS NULL OR distance_m >= 0),
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  fallback boolean NOT NULL DEFAULT false,
  route_payload jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (trip_id,day_id) REFERENCES trip.trip_days(trip_id,day_id) ON DELETE CASCADE,
  FOREIGN KEY (trip_id,from_item_id) REFERENCES trip.itinerary_items(trip_id,item_id) ON DELETE CASCADE,
  FOREIGN KEY (trip_id,to_item_id) REFERENCES trip.itinerary_items(trip_id,item_id) ON DELETE CASCADE,
  UNIQUE (day_id,from_item_id,to_item_id),
  CHECK (from_item_id <> to_item_id),
  CHECK (NOT fallback OR duration_seconds IS NULL)
);
CREATE INDEX day_legs_pending_idx ON trip.day_travel_legs(updated_at) WHERE status='PENDING';
GRANT SELECT,INSERT,UPDATE,DELETE ON trip.day_travel_legs TO trip_runtime;

-- Existing saved itineraries receive edges without modifying items or trip versions.
WITH ordered AS (
  SELECT i.trip_id,i.day_id,i.item_id,p.latitude,p.longitude,
    lead(i.item_id) OVER w AS next_id,
    lead(p.latitude) OVER w AS next_lat,
    lead(p.longitude) OVER w AS next_lon
  FROM trip.itinerary_items i JOIN trip.place_snapshots p USING(trip_id,place_id)
  WINDOW w AS (PARTITION BY i.day_id ORDER BY i.sort_order)
)
INSERT INTO trip.day_travel_legs(leg_id,trip_id,day_id,from_item_id,to_item_id,coordinates_key,route_token)
SELECT gen_random_uuid(),trip_id,day_id,item_id,next_id,
  latitude::text||','||longitude::text||'>'||next_lat::text||','||next_lon::text,
  gen_random_uuid()
FROM ordered WHERE next_id IS NOT NULL;
