-- Match frozen contract string lengths; earlier migration checksums remain immutable.
ALTER TABLE trip.trips ALTER COLUMN title TYPE varchar(1024);
ALTER TABLE trip.trip_destinations ALTER COLUMN destination_name_snapshot TYPE varchar(1024);
ALTER TABLE trip.place_snapshots ALTER COLUMN name TYPE varchar(1024);
