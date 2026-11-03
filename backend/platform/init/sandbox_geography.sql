-- Explicit synthetic local geometry for the licensed source sandbox, not real VN boundaries.
-- Local/dev only; idempotent (only fills an empty boundary).
UPDATE catalog.geographic_units SET boundary=ST_Multi(ST_MakeEnvelope(107.8,15.7,108.5,16.4,4326)) WHERE code='DNG' AND boundary IS NULL;
