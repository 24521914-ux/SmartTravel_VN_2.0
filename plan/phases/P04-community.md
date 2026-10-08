# P04 Community Service và nội dung cộng đồng

Trạng thái: **Chưa triển khai**. Dependency: P02/P03. Chức năng: F06/F07, collections, contributions và moderation.

## Công việc

- [ ] P04-01: [Community migration](../database/community.md), local constraints/projection; ownership và Catalog validate khi ghi mới.
- [ ] P04-02: Review CRUD/media và state machine; edit APPROVED→PENDING, không giữ điểm chưa duyệt trong rating.
- [ ] P04-03: Atomic review+rating summary+audit+outbox; Catalog versioned consumer; reconciliation COUNT/SUM.
- [ ] P04-04: Favorite PUT/DELETE idempotent; collection visibility/reorder; enrich dữ liệu place bằng batch tránh N+1.
- [ ] P04-05: Report/moderation queue, reason/actor/audit; không cho user tự approve qua endpoint public.
- [ ] P04-06: Contribution PENDING→APPLYING→APPLIED/APPLY_FAILED; command fixed ID, expected Catalog version, notification result.
- [ ] P04-07: Consume place visibility/user deletion; xử lý dữ liệu unavailable và rating rebuild theo policy.

## Contract và dữ liệu

12 bảng domain + 4 kỹ thuật. Review/report CRUD; me/favorites; collection/items/order; contribution/withdraw; admin queues/decisions; internal rating snapshot/batch. Publish review/favorite/rating/contribution commands; consume Catalog result/visibility và Identity events. Không FK user/place xuyên DB.

Frontend: review/report/favorite/collection/contribution và trạng thái chờ áp dụng; admin moderation. Contribution “đã duyệt” không đồng nghĩa Catalog “đã áp dụng”.

## Kiểm nhận

- [ ] Rating/count đúng sau approve/edit/hide/delete/restore; duplicate/out-of-order event không làm sai projection.
- [ ] Concurrent rating/favorite không tạo duplicate; collection riêng tư không lộ cho user khác.
- [ ] Catalog down giữ contribution APPLYING; version conflict yêu cầu rebase/duyệt lại, không báo thành công giả.
- [ ] Media chưa APPROVED không public; report duplicate và cross-user access bị chặn.
- [ ] F06/F07 và phần rating F04 E2E pass; rating reconciliation có evidence.

Đầu ra: migrations/API/events/UI, test concurrency và replay, moderation/reconciliation runbook. Rollback projection bằng rebuild từ reviews; sửa contribution đã apply bằng phiên bản bù Catalog, không xóa audit.
