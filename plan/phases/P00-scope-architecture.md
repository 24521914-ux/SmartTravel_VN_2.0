# P00 Chuẩn bị để sáu nhóm phát triển độc lập

Trạng thái: **Chưa triển khai**. Người điều phối và sáu owner cùng chốt đầu vào. Chưa kết nối các service nghiệp vụ thật.

## Công việc

- [ ] P00-01: Review F01–F11/42 bảng; chốt boundary và policy user/business/guest/review/currency/consent. Giữ sáu service đã thống nhất.
- [ ] P00-02: Điền A–F, folder ownership và reviewer chéo; chỉ định một owner root Maven/BOM/CI/contracts/infra để tránh xung đột sửa file.
- [ ] P00-03: Chốt OpenAPI v1: request/response/error/pagination/If-Match/idempotency, auth claim/issuer/audience/JWKS. Khi triển khai lưu `backend/contracts/openapi/{service}.yaml`.
- [ ] P00-04: Chốt event/command JSON Schema, producer/consumer, ID/version/correlation, success/reject, retry/outbox/inbox; lưu `backend/contracts/events/`.
- [ ] P00-05: Gói fixture chung ID cố định: U1/U2/admin/business, place public/hidden/archive, category active/inactive, source permitted/revoked, consent on/off, trip/model mẫu. Có success/403/404/conflict/timeout/duplicate/out-of-order.
- [ ] P00-06: Template chạy một service + DB riêng thật + HTTP stub + test JWKS + event harness. Không cần boot năm service còn lại; test key không dùng cho môi trường thật.
- [ ] P00-07: Xác minh Java/Spring/BOM/PostgreSQL >=15/PostGIS; thống nhất build/image/Flyway/config/log/tracing/health/error và CI template. Không ép AI/Redis/JPA vào service không dùng.
- [ ] P00-08: Chốt SLO/load dataset/RPO/RTO/provider/retention, scope ML và nhánh có/không DB monolith thực. Quyết định còn thiếu có owner.
- [ ] P00-09: Producer/consumer review ví dụ contract; gắn revision/checksum v1, validate fixture theo schema và cung cấp hướng dẫn mỗi người chạy độc lập.

## Gói đầu vào và gate

Database riêng + contract v1 + fixture + template local/build + checklist bàn giao cho từng owner. Frontend nếu có người riêng có thể làm với API stub ngay sau P00; backend không chờ UI.

- [ ] Sáu owner nhận cùng revision, đủ mock đối tác; không task P01 nào phải chờ service khác chạy.
- [ ] Template chứng minh DB migration, JWT validation và event serialization local, chưa nối service nghiệp vụ thật.
- [ ] Schema là biên API/event, không chia sẻ JPA entity hoặc DB credential.
- [ ] Dataset synthetic chỉ dùng kiểm pipeline ML, không phải bằng chứng chất lượng model production.
- [ ] Scope, root-file owner, folder assignment, contract change process đã chốt.

Nếu contract sai, cập nhật schema/fixture qua review hai đầu trước tiếp tục. [Architecture](../01-architecture.md) · [Phân công](../06-work-assignment.md).
