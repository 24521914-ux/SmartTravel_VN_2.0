-- P01 additive helpers and deterministic fixtures for standalone Catalog runtime.
CREATE EXTENSION IF NOT EXISTS unaccent;

INSERT INTO catalog.geographic_units(geographic_unit_id,parent_id,unit_type,code,name_vi,name_en,version,valid_from,status) VALUES
 ('10000000-0000-0000-0000-000000000001',NULL,'COUNTRY','VN','Việt Nam','Vietnam',1,'2024-01-01','ACTIVE'),
 ('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','PROVINCE','HCM','Thành phố Hồ Chí Minh','Ho Chi Minh City',1,'2024-01-01','ACTIVE'),
 ('10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','PROVINCE','HN','Hà Nội','Hanoi',1,'2024-01-01','ACTIVE'),
 ('10000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','PROVINCE','DNG','Đà Nẵng','Da Nang',1,'2024-01-01','ACTIVE')
ON CONFLICT DO NOTHING;

INSERT INTO catalog.geographic_aliases(alias_id,geographic_unit_id,alias,normalized_alias,valid_from) VALUES
 ('10000000-0000-0000-0000-000000000102','10000000-0000-0000-0000-000000000002','Sài Gòn','sai gon','2024-01-01'),
 ('10000000-0000-0000-0000-000000000103','10000000-0000-0000-0000-000000000003','Thăng Long','thang long','2024-01-01')
ON CONFLICT DO NOTHING;

INSERT INTO catalog.categories(category_id,parent_id,code,name_vi,name_en,active) VALUES
 ('20000000-0000-0000-0000-000000000001',NULL,'attraction','Điểm tham quan','Attraction',true),
 ('20000000-0000-0000-0000-000000000002',NULL,'restaurant','Nhà hàng','Restaurant',true),
 ('20000000-0000-0000-0000-000000000003',NULL,'hotel','Khách sạn','Hotel',true),
 ('20000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000001','museum','Bảo tàng','Museum',true)
ON CONFLICT DO NOTHING;

INSERT INTO catalog.tags(tag_id,code,name_vi,name_en) VALUES
 ('30000000-0000-0000-0000-000000000001','family','Phù hợp gia đình','Family'),
 ('30000000-0000-0000-0000-000000000002','nightlife','Về đêm','Nightlife'),
 ('30000000-0000-0000-0000-000000000003','heritage','Di sản','Heritage')
ON CONFLICT DO NOTHING;

INSERT INTO catalog.amenities(amenity_id,code,name_vi,name_en) VALUES
 ('40000000-0000-0000-0000-000000000001','wifi','Wi-Fi','Wi-Fi'),
 ('40000000-0000-0000-0000-000000000002','parking','Bãi đỗ xe','Parking'),
 ('40000000-0000-0000-0000-000000000003','air_conditioning','Điều hòa','Air conditioning')
ON CONFLICT DO NOTHING;

INSERT INTO catalog.destinations(destination_id,name_vi,name_en,destination_type,summary,status) VALUES
 ('50000000-0000-0000-0000-000000000001','Sài Gòn năng động','Vibrant Saigon','CITY','Điểm đến đô thị, ẩm thực và văn hóa.','PUBLISHED'),
 ('50000000-0000-0000-0000-000000000002','Hà Nội ngàn năm','Historic Hanoi','CITY','Thủ đô với di sản và ẩm thực.','PUBLISHED'),
 ('50000000-0000-0000-0000-000000000003','Đà Nẵng biển xanh','Coastal Da Nang','COAST','Biển, cầu và trải nghiệm miền Trung.','PUBLISHED')
ON CONFLICT DO NOTHING;
INSERT INTO catalog.destination_geo(destination_id,geographic_unit_id) VALUES
 ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002'),
 ('50000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003'),
 ('50000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000004')
ON CONFLICT DO NOTHING;
