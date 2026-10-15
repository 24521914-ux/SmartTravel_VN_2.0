-- Add contract editor semantics without changing existing Flyway checksums.
ALTER TABLE trip.trip_destinations ADD COLUMN start_date date, ADD COLUMN end_date date;
UPDATE trip.trip_destinations d SET start_date=t.start_date,end_date=t.end_date FROM trip.trips t WHERE t.trip_id=d.trip_id;
ALTER TABLE trip.trip_destinations ALTER COLUMN start_date SET NOT NULL, ALTER COLUMN end_date SET NOT NULL;
ALTER TABLE trip.trip_destinations ADD CHECK (end_date >= start_date);
ALTER TABLE trip.itinerary_items DROP CONSTRAINT itinerary_items_duration_min_check;
ALTER TABLE trip.itinerary_items ADD CHECK (duration_min >= 0);
ALTER TABLE trip.place_snapshots ADD COLUMN price numeric(14,2), ADD COLUMN currency char(3) NOT NULL DEFAULT 'VND', ADD COLUMN visibility_version bigint NOT NULL DEFAULT 0;
ALTER TABLE trip.place_snapshots ADD COLUMN catalog_snapshot jsonb NOT NULL DEFAULT '{}';
ALTER TABLE trip.transfer_items ALTER COLUMN from_trip_destination_id DROP NOT NULL, ALTER COLUMN to_trip_destination_id DROP NOT NULL;
ALTER TABLE trip.transfer_items ADD COLUMN from_item_id uuid, ADD COLUMN to_item_id uuid, ADD COLUMN duration_seconds integer, ADD COLUMN fallback boolean NOT NULL DEFAULT false;
ALTER TABLE trip.itinerary_items ADD UNIQUE (trip_id,item_id);
ALTER TABLE trip.transfer_items ADD FOREIGN KEY (trip_id,from_item_id) REFERENCES trip.itinerary_items(trip_id,item_id) ON DELETE CASCADE;
ALTER TABLE trip.transfer_items ADD FOREIGN KEY (trip_id,to_item_id) REFERENCES trip.itinerary_items(trip_id,item_id) ON DELETE CASCADE;
ALTER TABLE trip.transfer_items ADD CHECK (from_item_id IS NULL OR from_item_id <> to_item_id);
CREATE TABLE trip.user_tombstones (user_id uuid PRIMARY KEY, deletion_request_id uuid NOT NULL, deleted_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE trip.user_status (user_id uuid PRIMARY KEY, status varchar(20) NOT NULL, source_version bigint NOT NULL);
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA trip TO trip_runtime;
