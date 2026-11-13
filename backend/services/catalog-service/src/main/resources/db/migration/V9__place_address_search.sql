-- Keep address and name in the same accent-insensitive search document.
CREATE FUNCTION catalog.place_search_document(place_name text, place_address text)
RETURNS tsvector LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT to_tsvector('simple', regexp_replace(
    normalize(replace(lower(coalesce(place_name, '') || ' ' || coalesce(place_address, '')), 'đ', 'd'), NFD),
    U&'[\0300-\036F]', '', 'g'));
$$;

UPDATE catalog.places SET search_document = catalog.place_search_document(name_vi, address);
