# P01 Nền tảng chạy và delivery

Trạng thái: **Đang triển khai — M1 database/runtime P01**. Baseline migration, credential isolation và CI source tại `backend/infra/`, `backend/services/`, `.github/workflows/p01-services.yml`; evidence và các phần chưa đủ tại [progress](../../progress/PHASE_TASK_CHECKLIST.md). Các checklist tổng bên dưới chưa đóng. Checklist nền tảng dùng trong P00/P01/P02 theo [lộ trình hiện hành](README.md): template tối thiểu bàn giao tại P00; sáu owner hoàn thiện runtime/CI service mình song song trong P01; platform chuẩn bị môi trường kết nối P02. Mục tiêu: sáu service có build, credential, migration và deploy độc lập.

## Công việc

- [ ] P01-01: Tạo cấu trúc dự kiến `backend/services/{identity,catalog,community,trip,intelligence,ingestion}-service`, `backend/platform/api-gateway`, `backend/contracts`, `backend/infra`. Đây là đầu ra triển khai tương lai.
- [ ] P01-02: Điều chỉnh cấu trúc Maven từ demo sau xác minh BOM. Mỗi app chỉ nhận dependency cần thiết; không đưa Spring AI/Redis vào tất cả service; không chung JPA entity/repository.
- [ ] P01-03: Docker Compose dev cho 6 database/credential, broker, object storage và Redis khi cần. PostGIS chỉ Catalog; tài khoản runtime không có quyền DDL hoặc đọc DB khác.
- [ ] P01-04: Health/live/ready, config/secret injection, structured logs, trace ID, metrics, request size, timeout và error format; tránh restart dây chuyền vì dependency phụ lỗi.
- [ ] P01-05: Framework security/JWT resource server/JWKS, workload scopes, gateway routing và CORS allowlist. Mỗi service tự kiểm token và quyền đối tượng.
- [ ] P01-06: Outbox worker, inbox dedup, DLQ/replay, idempotency, audit redaction. Worker thuộc đúng service, không có DB credential toàn hệ thống.
- [ ] P01-07: CI build/lint/unit/integration/contract/migration theo service; shared contract change chạy affected checks; image tag commit SHA, dependency scan và rollback artifact.
- [ ] P01-08: OpenAPI/event schema skeleton, fixtures, migration naming/checksum, API client frontend và contract compatibility.

## Database API và event

Tạo baseline schema cùng bốn bảng kỹ thuật/service. Domain migration thuộc sáu gói P01-ID/CA/CO/TR/IG/IN, thực hiện song song theo owner. Health/metrics internal không public tùy tiện. Thử event fixture qua outbox→broker→inbox→DLQ/replay trong harness local; kết nối event giữa các service thật tại P02. Framework hỗ trợ secret/key rotation và scope service-to-service.

## Kiểm chứng và điều kiện hoàn thành

- [ ] Từ checkout sạch dựng được từng app với DB riêng và stub của đối tác; DB permission negative test chứng minh không đọc chéo. Tổng hợp bằng chứng của cả sáu app tại gate P01; mỗi nhóm bắt đầu domain sau khi template P00 của mình sẵn sàng.
- [ ] Crash sau commit/trước publish không mất event; duplicate delivery không lặp side effect; consumer transaction rollback không lưu inbox thành công giả.
- [ ] Poison message vào DLQ có cảnh báo và replay được; secret không xuất hiện trong logs.
- [ ] Có build/image/migration riêng mỗi service; deploy một service không bắt buộc restart sáu service.

Frontend đầu ra: API/error/auth client và mock contract; chưa cần màn nghiệp vụ hoàn chỉnh. Bàn giao source, CI evidence, local setup, runbook broker/replay/secret. Rollback image/config với migration expand-only; không DROP database để chữa boot lỗi.
