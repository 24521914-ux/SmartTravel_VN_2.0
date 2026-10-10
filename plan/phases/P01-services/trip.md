# P01-TR Trip Service — nhóm D

Trạng thái: **IN_PROGRESS — M1 baseline storage/runtime**. Evidence và phần còn thiếu tại [progress](../../../progress/PHASE_TASK_CHECKLIST.md). Chưa hoàn tất P01-TR-01/02 hoặc gate. Dependency: P00, không chờ Identity/Catalog/Intelligence. Scope F09/F10. Reviewer: E.

[Database Trip](../../database/trip.md) · [DDL](../../database/sql/trip.sql) · [Contract](../../04-api-events.md) · [Gate](README.md). Owner: `backend/services/trip-service/**`.

## Dependency được giả lập

| Đối tác | Thay thế P01 | Case |
|---|---|---|
| Identity | Test JWKS/tokens + status/deletion fixture | Owner/other user/revoked/expiry |
| Catalog | Place/destination batch/validation stub + visibility fixture | Public/missing/hidden/price unknown/version changed/timeout |
| Intelligence | Recommendation result/attribution fixture | Request ID, place hợp lệ, không sửa locked |
| Routing provider | HTTP provider stub hoặc sandbox | Route success/quota/timeout; fallback chim bay |

Trip data, snapshot, concurrency và reorder phải thực thi thật. Khoảng cách/kết quả routing mẫu có nhãn fixture, không được nhận là số liệu thực.

## M1 Database và local runtime

- [ ] P01-TR-01: Flyway 7 domain + 4 technical, composite FK cùng trip, unique deferrable; seed nhiều destination/day/items.
- [ ] P01-TR-02: Service/security/local compose/log/health/image/CI, Catalog/provider stub và test JWKS; không boot service khác.

## M2 Nghiệp vụ

- [ ] P01-TR-03: Trip/segment/day CRUD, owner từ JWT, date/day/timezone rules, parent lock/optimistic version và soft delete.
- [ ] P01-TR-04: Add place bằng Catalog client stub, lưu snapshot; item add/remove/reorder/note/duration/locked, cost cùng currency, warning budget.
- [ ] P01-TR-05: Transfer cùng trip, route/cache/transport metadata, fallback có nhãn; refresh snapshot chủ động, giữ completed snapshot.
- [ ] P01-TR-06: Add-from-recommendation xử lý attribution fixture như input thật, không tự sửa locked; visibility archive chỉ đánh unavailable/cảnh báo.

API: me/trips, trip destinations/days/items/order/transfers, route-estimates, snapshots/refresh; trả version mới mỗi mutation. UI contracts cho editor/day tabs/drag-drop/note/budget/map.

## M3 Biên giao tiếp

- [ ] P01-TR-07: Batch/validate Catalog và routing adapters thật trỏ stub, timeout/error/cache/fallback; publish trip.changed/item.added, consume visibility/deletion qua event harness.
- [ ] P01-TR-08: Snapshot/source_version, outbox/inbox/retry/audit; privacy response/cache-control và idempotent add item theo contract.

## M4 Kiểm nhận và bàn giao

- [ ] P01-TR-09: Không gắn item/day/transfer của trip khác; đổi date reject nếu chưa xử lý item ngoài khoảng; order concurrent trả 409 và không mất item.
- [ ] P01-TR-10: Catalog stub down vẫn đọc trip snapshot; add mới fail đúng policy; provider timeout không bịa duration; locked/currency/private owner đúng.
- [ ] P01-TR-11: Handoff migrations/image/API/events/test/local-run, fixture itinerary/routes, provider config và limits; chưa có tối ưu tuyến sâu.

**Gate:** D/E xác nhận READY_FOR_INTEGRATION. Không cần recommendation engine, auth issuer hoặc Catalog thật để hoàn thành Trip.

## Chỉ làm ở P02

Nối auth/Catalog thật, recommendation add-to-trip, interaction event đến Intelligence và provider môi trường tích hợp. Rollback binary tương thích schema; snapshot lỗi refresh có audit, không xóa itinerary để chữa mismatch.
