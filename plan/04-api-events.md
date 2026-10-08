# Hợp đồng API, event và consistency

## Chuẩn API dùng cho sáu service

Public API đi qua `/api/v1`; internal API dưới `/internal/v1` không expose ra internet. Danh sách endpoint và quyền tối thiểu ở từng tài liệu database và phase; P01/P02 trở đi tạo OpenAPI có request/response/error examples và compatibility check trước triển khai.

- JSON, UUID dạng string, tiền là decimal string + currency để frontend không làm tròn sai; datetime ISO-8601 có offset.
- List dùng `limit` mặc định 20, tối đa 100; cursor opaque chứa keyset và tie-breaker ID. Filter và sort nằm trong cursor signature để không tái dùng sai truy vấn. Geo search có radius tối đa cấu hình và bounding limits.
- Error có `code`, `message`, `fieldErrors`, `traceId`; không chứa stack trace/SQL/token. 400 invalid input, 401 chưa xác thực, 403 thiếu quyền, 404 không tồn tại/không được thấy, 409 version hoặc idempotency conflict, 422 xung đột nghiệp vụ, 429 rate limit, 503 dependency không sẵn sàng.
- Mutation aggregate cần `If-Match`/version; thiếu precondition trên endpoint bắt buộc → 428. Owner lấy từ principal JWT, không tin `user_id` client tự gửi. Admin endpoint có scope và audit riêng.
- POST tạo tài nguyên, import, apply contribution, gửi notification dùng `Idempotency-Key`. PUT favorite có thể idempotent tự nhiên nhờ PK(user_id,place_id). Không retry vô điều kiện mọi POST từ client.
- Timeout riêng: HTTP nội bộ mục tiêu 2 giây, không quá 2 retry có exponential backoff/jitter với thao tác idempotent; tổng deadline phải có budget. Import/train xử lý async với 202 + job ID. Đây là giá trị khởi điểm cần load test P09.

## Event envelope

```json
{
  "event_id": "uuid",
  "event_type": "catalog.place.upserted.v1",
  "schema_version": 1,
  "aggregate_type": "place",
  "aggregate_id": "uuid",
  "aggregate_version": 7,
  "occurred_at": "2026-10-08T00:00:00Z",
  "producer": "catalog",
  "correlation_id": "uuid",
  "causation_id": "uuid-or-null",
  "traceparent": "w3c-trace-context",
  "payload": {}
}
```

Các trường correlation/causation/trace được lưu trong JSON payload envelope của outbox; các cột outbox còn lại hỗ trợ truy vấn/dispatch. Không cần đổi schema database khi thêm trường envelope tương thích. `aggregate_version` chỉ so sánh trong cùng aggregate/stream; Catalog version và rating version không thay thế nhau.

## Danh mục message tối thiểu

| Message | Producer → consumer | Payload tối thiểu / effect |
|---|---|---|
| identity.user.registered.v1 | Identity → hệ thống thông báo nội bộ | user_id, display_name; không gửi hash/email rộng rãi |
| identity.user.status-changed.v1 | Identity → Catalog/Community/Trip/Intelligence/Ingestion | user_id, status, version; ngăn thao tác user bị khóa theo chính sách cache |
| identity.preferences.changed.v1 | Identity → Intelligence | user_id, full preference snapshot, consent_version, version, personalization_enabled |
| identity.user.deletion-requested.v1 | Identity → 5 service còn lại | deletion_request_id, pseudonymous user_id, policy_version |
| domain.user-data-deleted.v1 | Mỗi consumer → Identity | deletion_request_id, service, status, artifact handling; tổng hợp ack bằng workflow ở Identity |
| catalog.place.upserted.v1 | Catalog → Community/Trip/Intelligence | full public projection gồm name/geo/category/tag/amenity/price/hour/media reference/status/version; không có private business evidence |
| catalog.place.visibility-changed.v1 | Catalog → Community/Trip/Intelligence | place_id,status,version; tombstone độc lập để purge/hide khẩn cấp |
| catalog.destination.changed.v1 | Catalog → Trip/Intelligence | destination_id,name,status,version,geo memberships |
| catalog.category.changed.v1 | Catalog → Identity/Intelligence | category_id,active,name; preference giữ ID nhưng không gợi ý category inactive |
| community.rating-summary.changed.v1 | Community → Catalog/Intelligence | place_id,count,sum,version,as_of; full snapshot, không gửi delta để tránh double count |
| community.review.changed.v1 | Community → Intelligence/Identity notification | review_id,user_id,place_id,status,version; chỉ event đủ điều kiện mới tạo interaction |
| community.favorite.changed.v1 | Community → Intelligence | user_id,place_id,action,occurred_at,event_id |
| community.contribution.apply-requested.v1 (command) | Community → Catalog | command_id,contribution_id,approved_by,type,target_id,expected_version,validated fields |
| catalog.contribution.applied.v1 / rejected.v1 | Catalog → Community/Identity | command_id,contribution_id,place_id,version hoặc error_code/reason |
| catalog.business-claim.reviewed.v1 | Catalog → Identity | claim_id,business_id,owner_user_id,status; tạo notification có recipient rõ |
| trip.item.added.v1 | Trip → Intelligence | item_id,trip_id,user_id,place_id,event_id; không kèm toàn bộ lịch trình riêng tư |
| trip.changed.v1 | Trip → Identity notification nếu cấu hình | trip_id,user_id,change_kind,version; chỉ gửi alert hữu ích |
| ingestion.place.upsert-requested.v1 (command) | Ingestion → Catalog | command_id,source_id,external_id,source_version/hash,proposed_place_id,normalized data,expected_catalog_version |
| catalog.place-import.applied.v1 / rejected.v1 | Catalog → Ingestion | command_id,place_id,catalog_version,error_code; cập nhật link/import_items |
| ingestion.source-policy.changed.v1 | Ingestion → Catalog/Intelligence | source_id,source_version,license_version,allow_storage,allow_training,status; chặn import/train và rà artifact |
| intelligence.model.deployed.v1 | Intelligence → vận hành/Identity admin alert | use_case,model_version_id,deployment_id,reason |

Frontend chỉ gửi SEARCH và PLACE_VIEW tới ingestion endpoint sự kiện của Intelligence. Favorite/review/add-to-trip lấy từ event phía server; không ghi thêm lần nữa từ frontend. `session_id` analytics không phải refresh/auth session. Backend event thiếu session analytics dùng pseudonymous server session theo request context; không tự dùng token làm session ID.

`community.review.changed.v1` phải bổ sung `change_kind` (CREATED/UPDATED/MODERATED/DELETED) và trạng thái trước/sau; chỉ CREATED tạo interaction REVIEW_CREATED, không biến mỗi lần kiểm duyệt thành lần viết review mới. Khi event backend không có analytics session, dùng một UUID pseudonymous riêng cho event làm session đơn lẻ. Favorite history là append-only theo event_id; aggregate_id có thể chính là event_id với aggregate_version=1, không suy diễn trạng thái favorite hiện tại từ thứ tự delivery của lịch sử.

Consumer source-policy phải kiểm policy version mới nhất từ Ingestion trước quyết định khôi phục quyền storage/training; không dùng event cũ để hủy hiệu lực một lần revoke mới hơn. Nếu owner policy chưa sẵn sàng, hoãn import/train thay vì mặc định cho phép.

## Giao dịch và bù trừ

### Review và rating

Trong một transaction Community: khóa review và aggregate place; kiểm tra version + state; trừ đóng góp cũ nếu APPROVED, cộng đóng góp mới nếu APPROVED; tăng summary.version; ghi outbox snapshot; commit. Approve/edit/hide/delete đều dùng cùng routine. Catalog chỉ áp dụng snapshot có version lớn hơn; event lặp hoặc cũ không làm sai count. Reconciliation đối chiếu SUM/COUNT APPROVED với summary định kỳ và sửa bằng event version mới.

### Import place

Ingestion normalize/dedup → ghi import_items + outbox → Catalog nhận command, kiểm tra source policy/field precedence/version → ghi place + place_versions + inbox + result outbox trong một transaction. Ingestion nhận result mới ghi source_place_links và APPLIED. Nếu consumer crash sau commit, replay command chỉ trả lại kết quả gắn cùng command_id; không tạo UUID place mới. Candidate ambiguous chuyển NEEDS_REVIEW, không tự merge.

### Contribution

Community duyệt nội dung và ghi APPLYING + command outbox; Catalog kiểm tra expected version rồi apply atomic và phát result. Community chỉ báo APPLIED sau ack. Nếu version conflict, chuyển APPLY_FAILED để reviewer rebase/duyệt lại. Không rollback place tự động khi notification lỗi; notification retry độc lập.

### Snapshot trip và visibility

Trip lưu snapshot khi thêm place. Update catalog không tự ghi đè ghi chú, locked item hay lịch sử chuyến đi. Với draft trip, người dùng có thể refresh snapshot có xác nhận version; completed trip giữ snapshot. Place hidden/archive làm unavailable_at và cảnh báo; endpoint public/recommendation không tiếp tục trả metadata nhạy cảm. Việc bắt buộc xóa nội dung do chính sách được xử lý qua workflow riêng, không mặc định giữ snapshot vô hạn.

## Đảm bảo delivery và reconciliation

At-least-once; inbox dedup + domain update cùng transaction; publish outbox theo aggregate để giảm đảo thứ tự. Snapshot event có version có thể bỏ event cũ; delta cần thứ tự/gap detection hoặc gọi snapshot API. Nghiệp vụ không dựa vào tổng thứ tự toàn hệ thống.

Retry có tối đa số lần, backoff, dead-letter queue, cảnh báo và công cụ replay có audit. Consumer không tự ACK khi parse lỗi/schema version chưa hỗ trợ. Sau deploy mới, contract tests và thử old/new consumer phải pass. P09 diễn tập mất broker, crash sau DB commit, duplicate, out-of-order, poison message và reconciliation.

## Những contract phải tạo khi triển khai

`contracts/openapi/{service}.yaml`, `contracts/events/{message}.schema.json`, ví dụ payload, error catalog và compatibility tests. Các đường dẫn này là đầu ra dự kiến của phase, chưa được tạo trong lượt lập kế hoạch. Public schema không import entity database. Event payload chứa PII phải dùng exchange/ACL riêng hoặc internal pull API có kiểm soát.
