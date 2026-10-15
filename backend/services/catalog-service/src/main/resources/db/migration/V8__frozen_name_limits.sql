-- Additive widening to match the frozen 1024-character API names; baseline checksums remain untouched.
ALTER TABLE catalog.places ALTER COLUMN name_vi TYPE varchar(1024),ALTER COLUMN name_en TYPE varchar(1024),ALTER COLUMN address TYPE text;
ALTER TABLE catalog.place_aliases ALTER COLUMN alias TYPE varchar(1024),ALTER COLUMN normalized_alias TYPE varchar(1024);
ALTER TABLE catalog.geographic_units ALTER COLUMN name_vi TYPE varchar(1024),ALTER COLUMN name_en TYPE varchar(1024);
ALTER TABLE catalog.geographic_aliases ALTER COLUMN alias TYPE varchar(1024),ALTER COLUMN normalized_alias TYPE varchar(1024);
ALTER TABLE catalog.categories ALTER COLUMN name_vi TYPE varchar(1024),ALTER COLUMN name_en TYPE varchar(1024);
ALTER TABLE catalog.tags ALTER COLUMN name_vi TYPE varchar(1024),ALTER COLUMN name_en TYPE varchar(1024);
ALTER TABLE catalog.amenities ALTER COLUMN name_vi TYPE varchar(1024),ALTER COLUMN name_en TYPE varchar(1024);
ALTER TABLE catalog.destinations ALTER COLUMN name_vi TYPE varchar(1024),ALTER COLUMN name_en TYPE varchar(1024);
ALTER TABLE catalog.offerings ALTER COLUMN name_vi TYPE varchar(1024);
ALTER TABLE catalog.businesses ALTER COLUMN display_name TYPE varchar(1024);
