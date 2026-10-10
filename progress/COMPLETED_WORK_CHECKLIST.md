# Checklist những gì đã làm được

Tiến độ từng task xem [PHASE_TASK_CHECKLIST.md](PHASE_TASK_CHECKLIST.md). `[x]` ghi artifact/kết quả thực tế; không mặc định chức năng nghiệp vụ hoặc phase đã nghiệm thu. P00 **hoàn tất triển khai kỹ thuật, READY_FOR_REVIEW**, chờ xác nhận bàn giao N1/N2.

## Tài liệu và quyết định

- [x] Kiến trúc sáu service, mapping F01–F11/42 nguồn, DB conventions, API/events và kế hoạch phase — `plan/`.
- [x] Chốt database: Catalog PostgreSQL/PostGIS; Community MongoDB; Identity/Trip/Ingestion PostgreSQL; Intelligence PostgreSQL/pgvector; Redis cache riêng.
- [x] Hai người N1/N2, review chéo, file ownership/platform/frontend — `plan/06-work-assignment.md`; không cần GitHub username.
- [x] Có frontend, triển khai mới, recommendation Basic hoàn thiện trước ML, release cuối gồm ML.
- [x] Scope/policies, auth/roles/consent/currency/retry/version và baseline vận hành/provider/retention/ML quality/load — `plan/P00-DECISIONS.md`, `plan/P00-POLICIES.md`.
- [x] Thiết kế MongoDB collections/index/transaction/concurrency — `plan/database/community-mongodb.md`; SQL Community cũ được đánh dấu baseline lịch sử.
- [x] Quy tắc Git/GitHub — `AGENTS.md`, commit nền `83c07f3`; không suy ra đã merge main.

## Source/scaffold

- [x] Backend demo gốc và Maven Wrapper giữ nguyên, không xóa thay đổi người dùng.
- [x] Platform template Java21/Boot3.5.13/Flyway/health/JWT — `backend/platform/p00-template/`.
- [x] Sáu skeleton Java build/deploy độc lập — `backend/services/`; chưa có domain API/entity/repository/logic.
- [x] Community dùng Spring Data MongoDB, không JPA/JDBC/Flyway; P00 platform_probe giữ nguyên. P01 đã bổ sung domain migrations/index/collections thật, chưa có domain APIs.
- [x] Correlation/trace MDC, error auth JSON và WWW-Authenticate; audience/issuer/exp/iat/sub/signature validators.
- [x] Dockerfiles chạy non-root và Compose sáu DB +platform DB +sáu Redis riêng — `backend/platform/compose.p00.yaml`.
- [x] React/TypeScript/Vite frontend scaffold và API dev proxy — `frontend/`; chưa có màn nghiệp vụ hoàn chỉnh.
- [x] CI source cho contract/service/runtime/frontend — `.github/workflows/p00-template.yml`; chưa có remote CI run.

## Contract, fixture và bàn giao

- [x] Sáu OpenAPI 3.1, **183 operation** — `backend/contracts/openapi/`.
- [x] **23 event/command** schema +producer/consumer registry — `backend/contracts/events/`, `registry.json`.
- [x] Fixture request/response/header theo operation, event examples và common IDs/negative cases.
- [x] Candidate revision `1.0.0-candidate` và manifest SHA-256; validator mặc định kiểm, không tự che thay đổi bằng refresh.
- [x] Schema-driven stubs cho cả sáu service, auth giả lập rõ ràng; JWT test issuer ephemeral riêng.
- [x] Event transaction harness demo cho serialization/dedup/rollback/retry/out-of-order.
- [x] Load profile/generator deterministic, 83.000 synthetic records; không phải domain seed/ML quality evidence.
- [x] Hướng dẫn chạy độc lập và manifest sáu gói — `backend/platform/README.md`, `P00_HANDOFF.md`.

## Kiểm chứng thực tế

- [x] Sáu service Maven verify: **18 tests PASS**, 0 failures/errors/skips.
- [x] Platform Maven verify trên PostgreSQL thật: **4 tests PASS**, Flyway/rollback/app startup.
- [x] Sáu skeleton chạy lần lượt trên DB riêng: health UP, JWT thật accepted, sai audience/no JWT 401, error/correlation format đúng.
- [x] PostGIS ST_DWithin, pgvector cosine, MongoDB replica-set commit/rollback và sáu Redis PONG PASS.
- [x] Contract validator: **183 operation/examples/errors +23 message examples/negative cases PASS**.
- [x] Policy review suite: **7 tests PASS**; HTTP suite: **3 tests PASS**, gồm loop toàn bộ operation và common fixture invariants; event harness: **2 tests PASS**.
- [x] Synthetic load generator hai lần có checksum giống nhau.
- [x] Frontend build và HTTP Vite dev proxy PASS; npm audit **0 vulnerabilities** lúc kiểm tra.
- [x] Sáu service images và platform image build PASS; platform container health đã smoke UP.

## P01 đang triển khai — M1 storage/runtime (10/10/2026)

- [x] Năm PostgreSQL Flyway baseline domain + technical tables, runtime grants và Identity role seed; Community V1 16 collections/validator/index/checksum, revision startup guard và transaction manager.
- [x] Compose/runner/runbook riêng tại `backend/infra/`; admin/migrator/runtime tách riêng, MongoDB authenticated replica set, secret local đã ignore; không dùng lại/xóa volume P00.
- [x] Maven clean verify **21 tests PASS**, 6/6 app standalone DB/JWKS smoke, 6/6 storage/permission/constraint/rollback probes và 6/6 image build PASS.
- [x] CI matrix theo service + shared-contract checks đã có source/YAML parse, chưa có remote CI evidence. Không ghi nhận dependency scan/deploy/rollback đã pass.
- [x] Contract tracked revision kiểm trên temporary copy PASS (183 operation/23 messages); workspace validator đang bị bốn `text.txt` untracked có trước task làm manifest mismatch. Giữ nguyên file người dùng và manifest.
- [ ] Chưa hoàn tất seed/domain/security/adapter/outbox worker/DLQ/broker/frontend client hoặc gate M1–M4. Chi tiết lệnh và evidence tại [checklist P01 M1](PHASE_TASK_CHECKLIST.md#p01-m1--phần-đã-triển-khai-và-kiểm-chứng).

## Chưa được xác nhận / thuộc giai đoạn sau

- [ ] N1/N2 phê duyệt contract/policy candidate và nhận gói; điều phối freeze/đóng gate P00. Agent không tự ký thay.
- [ ] Chức năng nghiệp vụ/seed đầy đủ, provider adapters/outbox worker/inbox handlers thực và functional/contract/fault tests P01; baseline storage đã có, không tự đóng parent task.
- [ ] Kết nối thật và frontend nghiệp vụ/E2E/security/load/restore/ML quality P02–P03.
- [ ] Production domain/provider credentials/licenses/budget/support-EOL review, release/rollback/bàn giao P04.
- [ ] Remote GitHub Actions pass và commit/push các thay đổi hiện tại.

Cơ sở: revision Git nền `83c07f3`, thay đổi chưa commit/push, evidence local ngày08/10/2026. Không lấy thư mục target hoặc source test làm bằng chứng pass; lệnh/kết quả và giới hạn ở manifest. Test apps/stubs/issuers/Vite tạm được dừng; DB/cache Docker/volumes giữ để tiếp tục làm việc.
