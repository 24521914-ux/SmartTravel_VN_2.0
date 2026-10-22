# P01-CA Catalog Service — nhóm B

Trạng thái (20/10/2026): **11/12 task LOCAL_VERIFIED; CA-12 (handoff/reviewer N2) còn PARTIAL; finding F-03 (seed homestay), F-04 (index alias)**. Code đã merge vào `main` (PR #10, merge `d799fa2`); người dùng chấp nhận P01 ngày 11/10/2026, chưa có chữ ký reviewer. Evidence chính thức tại [progress](../../../PROGRESS.md); checkbox trong file này là yêu cầu, không phải trạng thái. Dependency: P00; không chờ Identity/Community/Ingestion. Scope: F02/F03/F04, geo/place/search/offering/business và canonical data. Reviewer: C.

[Database Catalog](../../database/catalog.md) · [DDL](../../database/sql/catalog.sql) · [Contract](../../04-api-events.md) · [Gate](README.md). Owner: `backend/services/catalog-service/**`.

## Dependency được giả lập

| Đối tác | Thay thế P01 | Case |
|---|---|---|
| Identity | Test JWKS + token claims; HTTP status stub nếu dùng | USER/admin/business/suspended/expired/wrong audience |
| Community | Rating snapshot và contribution command fixtures | Version mới/cũ/lặp, apply/conflict/reject |
| Ingestion | Upsert command fixture + source-policy HTTP stub | CREATE/UPDATE/retry/revoked/protected field |
| Object storage/scanner | Local storage tương đương và scan stub | MIME/size/quarantine/approve/reject |

Business verification/claim, place data và quyền trên place phải do Catalog thực thi thật; không giả nghiệp vụ cốt lõi này.

## M1 Database và local runtime

- [ ] P01-CA-01: PostgreSQL/PostGIS local, Flyway 24 domain + 4 technical, taxonomy/geo/aliases/destination seed; GiST/GIN, FK/index/unique.
- [ ] P01-CA-02: Security với signed test token; config/log/health/image/local compose, test setup không cần runtime Identity.

## M2 Nghiệp vụ

- [ ] P01-CA-03: Geo hierarchy/version/alias/cycle/effective dates; destination/category/tag/amenity; Place CRUD/publish/hide/archive/version/history/audit.
- [ ] P01-CA-04: Search tiếng Việt/name/alias/tên cũ, category/region/destination/price/rating/type; stable cursor, distance SRID/mét; rating seeded qua consumer fixture rồi filter thật.
- [ ] P01-CA-05: Opening hours nhiều ca/qua đêm/holiday/unknown; price NULL/0/currency; media quarantine/approval, claim evidence private.
- [ ] P01-CA-06: Offerings/schedules cho service/tour/event/activity/experience, Place+Category+Amenities cho restaurant/hotel/homestay; không thêm booking/payment.
- [ ] P01-CA-07: Business/member/verification/claim/change requests, owner/claim uniqueness, expected version/protected field precedence; BUSINESS token không tự có quyền trên mọi place.

API: public places/search/detail/destination/taxonomy/offering; admin CRUD/status; business/claim/change request; internal batch validation/full snapshot/import/contribution apply. Hoàn thiện provider API để đối tác chỉ đổi cấu hình khi kết nối.

## M3 Biên giao tiếp

- [ ] P01-CA-08: Rating consumer versioned, import/contribution command handlers idempotent; canonical mutation + history + inbox/outbox atomic. Capture applied/rejected result bằng sink local.
- [ ] P01-CA-09: Publish place/visibility/destination/category/business-claim events; source policy client stub, revoke handler và snapshot/reconciliation API. Kiểm cả payload mới/cũ/lặp.

## M4 Kiểm nhận và bàn giao

- [ ] P01-CA-10: Test geo/search/pagination/unknown price/overnight/24h/holiday; cycle invalid bị chặn; claim-place mismatch/unauthorized business bị chặn.
- [ ] P01-CA-11: Hai update cùng version chỉ một commit; duplicate import không thêm place; protected fields không bị ghi đè; rating cũ không quay lùi; hidden không public.
- [ ] P01-CA-12: Handoff image/migrations/API/events/fixtures/EXPLAIN/test report/local-run/admin-business examples và known limits.

**Gate:** 24 domain tables và nghiệp vụ/handlers/clients chạy local với đối tác stub; B/C ký READY_FOR_INTEGRATION. Search/rating không phải chờ Community thật để nghiệm thu code của Catalog.

## Chỉ làm ở P02

Thay JWKS/status thật; nối rating/contribution của Community, policy/commands của Ingestion và snapshot readers Trip/Intelligence. Rollback dữ liệu place bằng version bù mới, không giảm version hay xóa history. UI nhận contracts search/detail/map/media/admin/business từ B.
