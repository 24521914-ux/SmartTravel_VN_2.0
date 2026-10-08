# P03 Catalog Service và địa điểm

Trạng thái: **Chưa triển khai**. Checklist chi tiết thuộc [P01-CA](P01-services/catalog.md), bắt đầu sau P00 khi taxonomy và policy fixture đã chốt. Catalog phát triển/test song song với Identity/Community/Ingestion bằng test JWKS, command/event fixtures và policy stub. Kết nối thật tại P02. Chức năng: F02/F03/F04, dữ liệu bản đồ và business/admin. Mã P03-* bên dưới là mã checklist cũ.

## Công việc

- [ ] P03-01: [Catalog migration](../database/catalog.md)/PostGIS; geo hierarchy/version/alias/destination/taxonomy/amenity; kiểm cycle và khoảng hiệu lực.
- [ ] P03-02: Place CRUD/version/status, audit/place_versions/outbox cùng transaction; archive giữ ID.
- [ ] P03-03: Search tiếng Việt có/không dấu/tên cũ; filter category/region/destination/price/rating/type; GiST/GIN và stable cursor.
- [ ] P03-04: Giờ tuần nhiều ca, qua đêm, exception/ngày lễ/timezone; phân biệt unknown hours/price với đóng cửa/miễn phí.
- [ ] P03-05: Upload quarantine, MIME/size/checksum/scan/approve; official media public, evidence claim private.
- [ ] P03-06: Offering/schedule cho tour/event/activity/experience; nhà hàng/khách sạn/homestay là Place+Category+Amenities; không thêm booking.
- [ ] P03-07: Business verification/membership/claim/sensitive field requests; expected version; reviewer audit; protected field precedence cho import.
- [ ] P03-08: Batch validate/snapshot API và handlers import/contribution; hoàn thiện rating consumer với fixture đúng contract ngay trong P01-CA, nối Community thật tại P02.

## Contract và dữ liệu

24 bảng domain + 4 kỹ thuật. Public search/detail/destination/taxonomy/offering; admin CRUD/status; business/claim/change request. Internal batch/validate/snapshot/apply commands. Publish place.upserted/visibility/destination/category/business-claim; consume rating/source policy; result event cho import/contribution.

Frontend: search/filter/detail/gallery/hour/amenity/offering/map; admin catalog; business claim và trạng thái duyệt.

## Kiểm nhận

- [ ] Query geo đúng SRID/mét; pagination không duplicate/mất item trên dataset cố định; search alias không cần tên hiện tại chính xác.
- [ ] Giờ qua đêm/24h/ngày lễ và price NULL/0 xử lý đúng; category/geo cycle bị từ chối.
- [ ] BUSINESS chưa claim hoặc claim revoked không sửa place; claim/place mismatch bị chặn.
- [ ] Concurrent edit cùng version chỉ một commit; history/event không mất; hidden không xuất hiện public.
- [ ] F02/F03/F04 gồm rating filter pass độc lập tại P01-CA với projection được tạo qua consumer fixture; chạy lại luồng rating thật tại P02 và E2E tại P03. Mọi canonical mutation qua Catalog.

Đầu ra: migrations/API/events, taxonomy/provenance seed hợp lệ, indexes/EXPLAIN queries, UI, tests và moderation/import runbook. Rollback place bằng phiên bản bù mới có reason; không giảm version hoặc ghi đè history.
