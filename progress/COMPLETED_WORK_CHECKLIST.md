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
- [x] Sáu skeleton Java build/deploy độc lập — `backend/services/`; P00 chưa có domain API. P01 Identity đã triển khai auth/session/profile như evidence bên dưới; năm service còn lại vẫn ở baseline.
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

## P01 Identity — auth/session (10/10/2026)

- [x] M1 Identity roles/options + U1/U2/admin/business opt-in fixture seed, V5 operational rate-limit/encrypted mail queue (20 tables, giữ V1–V4 checksum).
- [x] 13/25 operation thật: auth/verify/reset/change password, profile ETag, sessions cursor/owner/revoke và issuer RS256/JWKS/key rotation. Refresh/account token chỉ hash, consent default false, sensitive requests kiểm current status/session.
- [x] `python backend/services/identity-service/test-local.py`: **19 tests PASS**, 0 failure/error/skip, gồm **12** DB/API/domain tests trên PostgreSQL disposable thật. Concurrent refresh chỉ một thắng; reuse commit family revoke trước 401; expired/consumed token, reset/password/logout/session ownership và USER không gọi admin/internal.
- [x] Live jar và non-root image `smarttravel-identity:p01-auth-local`: SMTP Mailpit → verify/login/profile/sessions/refresh/logout, current-session revocation và frozen provider schemas/two event envelopes PASS. Storage/security smoke + permission/rollback probe Identity 20 tables PASS.
- [x] Local runners, ignored persistent signing/mail/fixture secrets, Mailpit loopback, CI source DB tests/image smoke và rotation/revoke/config runbook — `backend/services/identity-service/README.md`. Chưa remote CI hoặc con người review.
- [x] Blocker Community CRLF/LF của lượt hồi quy Identity đã được xử lý ở mục EOL bên dưới; full storage chạy lại 6/6 PASS. Lượt Identity cũ chỉ 5 PostgreSQL PASS, không sửa lại lịch sử kiểm thử.
- [ ] Identity chưa xong P01: preferences/category/consent/admin/internal batches, notifications/deletion/ack, transport/inbox/outbox worker/DLQ và toàn bộ provider/fault/security/handoff. Không READY_FOR_INTEGRATION. Chi tiết tại [checklist](PHASE_TASK_CHECKLIST.md#identity-authsession--evidence-local-10102026).

## Refactor source layout — 10/10/2026

- [x] Sáu service theo service → chức năng → tầng, main/test package khớp thư mục; bootstrap ở root, common security/web và Community storage config về đúng package.
- [x] Identity tách auth/profile controller/DTO/service/repository; SQL chuyển vào repositories, mail/fixtures/outbox/audit/idempotency và JWT/error helpers tách file/package riêng, giữ transaction và wire contract.
- [x] Reactor 6/6 clean verify BUILD SUCCESS; Identity 19/19 tests trên PostgreSQL thật PASS; layout/generator safety 6 tests PASS; jar + non-root Identity image live SMTP/provider smoke và 5/5 relational app legacy smoke PASS.
- [x] Scaffold sinh layout mới; security sync chỉ export proposal review, không overwrite domain security. Quy ước: `backend/services/README.md`; evidence tại checklist chung.
- [ ] Identity P01 vẫn chưa hoàn tất toàn scope. Blocker EOL Community sau refactor đã xử lý và kiểm runtime PASS ở mục bên dưới; không đổi nội dung migration/database để che lỗi.

## Community EOL checksum — 10/10/2026

- [x] Giữ LF cho migration qua `backend/.gitattributes`; khôi phục file V1 về đúng bytes đã commit, không đổi checksum metadata/applied_at hoặc reset/xóa volume.
- [x] Java regression RED trên CRLF rồi GREEN trên LF; Community clean verify **7 tests PASS**. Layout/source guards **7 tests PASS**, gồm Git checkout `core.autocrlf=true`; JAR resource khớp checksum gốc `1830d58c…`.
- [x] Community storage/permissions/rollback PASS, app jar smoke/restart hai lần PASS, image `smarttravel-community:p01-eol-local` build PASS.
- [x] Full storage hồi quy **6/6 PASS**; read-only snapshot revision và document counts 16 collections trước/sau không đổi. Blocker CRLF/LF đã đóng; không coi đây là Community domain/P01 gate hoàn tất.

## Chưa được xác nhận / thuộc giai đoạn sau

- [ ] N1/N2 phê duyệt contract/policy candidate và nhận gói; điều phối freeze/đóng gate P00. Agent không tự ký thay.
- [ ] Chức năng nghiệp vụ/seed đầy đủ, provider adapters/outbox worker/inbox handlers thực và functional/contract/fault tests P01; baseline storage đã có, không tự đóng parent task.
- [ ] Kết nối thật và frontend nghiệp vụ/E2E/security/load/restore/ML quality P02–P03.
- [ ] Production domain/provider credentials/licenses/budget/support-EOL review, release/rollback/bàn giao P04.
- [ ] Remote GitHub Actions pass và commit/push các thay đổi hiện tại.

Cơ sở: revision Git nền `83c07f3`, thay đổi chưa commit/push, evidence local ngày08/10/2026. Không lấy thư mục target hoặc source test làm bằng chứng pass; lệnh/kết quả và giới hạn ở manifest. Test apps/stubs/issuers/Vite tạm được dừng; DB/cache Docker/volumes giữ để tiếp tục làm việc.
