# P01-CO Community Service — cá nhân C

Trạng thái: **NOT_STARTED**. Dependency: P00, không chờ Identity/Catalog. Scope F06/F07, collections/contributions/moderation. Reviewer: D.

[Database Community](../../database/community.md) · [DDL](../../database/sql/community.sql) · [Contract](../../04-api-events.md) · [Gate](README.md). Owner: `backend/services/community-service/**`.

## Dependency được giả lập

| Đối tác | Thay thế P01 | Case |
|---|---|---|
| Identity | Signed test token/JWKS, status/deletion events | Owner/other user/admin/suspended/deletion |
| Catalog HTTP | Validate/batch place stub | Public/hidden/archive/not found/timeout |
| Catalog events | Visibility + contribution apply results | Version conflict/reject/missing ack/replay |
| Storage/scanner | Local storage và scan fixture | Approved/quarantine/rejected UGC |

Review/rating/favorite và contribution state machine là code thật với DB Community, không mock chính service.

## M1 Database và local runtime

- [ ] P01-CO-01: Flyway 12 domain + 4 technical, unique user/place, order deferrable, media FK và visibility projection; seed U1/U2/place IDs theo fixture.
- [ ] P01-CO-02: Local app/security/log/health/image/CI cùng HTTP stub và consumer harness, không cần DB hay runtime Catalog/Identity.

## M2 Nghiệp vụ

- [ ] P01-CO-03: Review CRUD/owner/limits/media, report/moderation queue/reason/audit; sửa APPROVED→PENDING, chỉ APPROVED tính điểm.
- [ ] P01-CO-04: Transaction review+summary+outbox với khóa/concurrency; COUNT/SUM reconciliation; favorite PUT/DELETE idempotent.
- [ ] P01-CO-05: Collection public/private, item/note/reorder, batch enrich bằng Catalog stub; không lộ thông tin private.
- [ ] P01-CO-06: Contribution add/edit/withdraw/approve→APPLYING→APPLIED/APPLY_FAILED, expected version/command ID; reviewer phải đúng quyền.

API: review/report, me/favorites, collection/items/order, contribution/status/withdraw, admin queues/decision, internal rating batch/snapshot. UI examples thể hiện riêng trạng thái đã duyệt và đã áp dụng.

## M3 Biên giao tiếp

- [ ] P01-CO-07: Catalog validate/batch client thật trỏ stub; đóng quyền ghi mới nếu không xác minh place được.
- [ ] P01-CO-08: Publish review/favorite/rating/contribution command; consume apply results/visibility/user-deletion qua fixtures; outbox/inbox dedup + transaction hoàn chỉnh. Event review có change_kind, không biến moderation thành review mới.

## M4 Kiểm nhận và bàn giao

- [ ] P01-CO-09: Approve/edit/hide/delete/restore làm summary đúng; concurrency và duplicate không double-count; favorite không duplicate.
- [ ] P01-CO-10: Cross-user access/collection private/UGC chưa duyệt bị chặn; missing apply ack giữ APPLYING; conflict không tự báo thành công.
- [ ] P01-CO-11: Handoff schema/API/events/image/test/local-run, fixture ratings, moderation/replay/reconciliation runbook và config kết nối.

**Gate:** C/D xác nhận READY_FOR_INTEGRATION qua DB thật và partner stub. Chưa yêu cầu rating hiển thị trên Catalog thật trước gate.

## Chỉ làm ở P02

Nối validation/snapshot/visibility Catalog thật; rating projection thực sự đến Catalog/Intelligence; contribution request/result và notifications sang Identity. Rollback projection bằng rebuild từ review gốc, không sửa avg tùy ý; contribution đã apply dùng corrective Catalog version.
