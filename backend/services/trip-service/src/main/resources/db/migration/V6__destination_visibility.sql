CREATE TABLE trip.destination_status (
    destination_id uuid PRIMARY KEY,
    status varchar(16) NOT NULL CHECK(status IN ('ACTIVE','INACTIVE')),
    source_version bigint NOT NULL CHECK(source_version > 0)
);
GRANT SELECT,INSERT,UPDATE,DELETE ON trip.destination_status TO trip_runtime;
