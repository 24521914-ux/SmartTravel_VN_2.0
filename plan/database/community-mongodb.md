# Community — Thiết kế MongoDB P00

Thay thế hướng lưu trữ PostgreSQL của Community; `community.sql` chỉ là baseline lịch sử. Owner N2, reviewer N1; thiết kế này chưa được hai người ký duyệt.

## Collections

| Collection | Nội dung | Index/invariant chính |
|---|---|---|
| reviews | `_id` UUID string, user_id, place_id, rating 1–5, content, status, version, timestamps | unique (user_id, place_id); (place_id, status, created_at, _id); query update có expected version |
| rating_summaries | `_id` = place_id, count, sum, version, as_of | count/sum không âm, count <= sum <= 5*count; single document atomic update |
| favorites | user_id, place_id, created_at | unique (user_id, place_id), PUT/DELETE idempotent |
| collections | owner_id, visibility, name, version, timestamps | (owner_id, updated_at, _id); kiểm owner/privacy ở mọi query |
| collection_items | collection_id, place_id, rank, note | unique (collection_id, place_id); thứ tự rank + _id; reorder khóa/version collection trong transaction, không mô phỏng DEFERRABLE |
| contributions | user_id, type, target_id, expected_version, payload, payload_schema_version, status, command_id | unique command_id partial; payload whitelist theo type/version, không nhận field canonical tùy ý |
| contribution_media | contribution_id, object_key, status | (contribution_id); binary ở object storage |
| review_media | review_id, object_key, status | (review_id); quarantine/approval trước public |
| moderation_actions | aggregate_id, actor_id, reason, action, occurred_at | (aggregate_id, occurred_at); audit append-only |
| review_reports | review_id, reporter_id, reason, status | unique (review_id, reporter_id) |
| collection_visibility_events | collection_id, version, visibility, occurred_at | (collection_id, version); không thay thế kiểm owner hiện tại |
| place_visibility_projections | `_id` = place_id, status, source_version, as_of | chỉ áp version mới; không cho ghi mới khi Catalog không xác minh được |
| outbox_events | `_id` = event_id, envelope, published_at, attempts, available_at | pending index; lease/claim atomic, retry bounded |
| inbox_events | `_id` = event_id, processed_at, producer | `_id` dedup; ghi cùng transaction domain |
| idempotency_keys | principal, operation, key, request_hash, response, expires_at | unique (principal, operation, key); TTL expires_at không được dùng làm đồng hồ chính xác |
| audit_logs | actor, aggregate_id, action, correlation_id, occurred_at | append-only, không lưu token/secret |

Danh sách phản ánh scope logical baseline, không đòi mỗi bảng SQL phải ánh xạ 1:1. UUID ngoài service là external reference, không có FK xuyên service.

## Transaction và concurrency

- MongoDB replica set, transaction readConcern snapshot/writeConcern majority cho review + rating summary + outbox và consumer inbox + domain update.
- Review create/update/moderate/delete đều tính trừ đóng góp APPROVED cũ, cộng APPROVED mới trong cùng transaction; tăng version, phát full rating snapshot.
- Unique index xử lý create đồng thời; retry transient transaction/write conflict bounded. Duplicate inbox không phát thêm side effect.
- Update aggregate lọc `_id` + owner + version; không match trả 404/403/409 theo visibility policy, không ghi mù.
- Contribution chỉ APPLIED khi nhận Catalog applied ack; conflict/reject giữ trạng thái lỗi có audit.
- JSON payload linh hoạt nhưng có schema_version/validation, giới hạn kích thước; không embed review/media/item vô hạn trong một document.
- Migration là script versioned, kiểm checksum/index/schema trước startup; runtime user không có quyền quản lý index/schema. Bootstrap P00 chỉ là thử nghiệm, không phải bộ migration nghiệp vụ P01.

## Kiểm thử bắt buộc P01

Review state/rating reconciliation; concurrent updates; private collection/BOLA; duplicate/old event; contribution missing ack/conflict; consent/deletion; media moderation; retry sau DB commit. MongoDB transaction smoke P00 không chứng minh toàn bộ invariant nghiệp vụ này.
