# Checklist những gì đã làm được


Cập nhật giao code **21/10/2026**: toàn bộ checkpoint local gốc được giữ trong [lịch sử](evidence/2026-10-20-local-checklist-history.md). P03 **PARTIAL**, chờ CI revision cuối; không thay chữ ký owner/reviewer hoặc mở P04.

Cập nhật lần cuối: **21/10/2026** · Revision: `0bcdca4` · Người cập nhật: coding agent theo yêu cầu người dùng · Evidence giao code/CI: [2026-10-21-github-delivery-ci.md](evidence/2026-10-21-github-delivery-ci.md).

File này tóm tắt **artifact và chức năng đã làm được** theo mốc thời gian. `[x]` nghĩa là artifact có thật và có evidence ghi kèm; không có nghĩa phase đã nghiệm thu. Mục mới nhất ở trên. Mục cũ giữ nguyên trạng thái tại ngày ghi.

## Quét source đối chiếu — 20/10/2026

- [x] Quét toàn bộ source trên `main` `9f4beca`:
  - API: 183/183 operation contract có controller thật, thêm 9 endpoint ngoài contract.
  - Event: producer 23/23 message; consumer thiếu 3 message ở Identity.
  - Không có TODO nghiệp vụ trong `src/main`.
  - Evidence: [2026-10-20-source-scan.md](evidence/2026-10-20-source-scan.md).
- [x] Chạy lại local:
  - Maven sáu service BUILD SUCCESS: 235 tests, 0 failure/error, **165 skipped** (DB/broker, không có Docker).
  - Gateway 14/14.
  - Frontend `npm ci`/audit 0 vulnerabilities/7 contract tests/build PASS.
  - Checksum contract 66/66.
- [x] Chuẩn hóa folder `progress/`:
  - Thêm [README](README.md) và thư mục `evidence/`.
  - Ba báo cáo tiếng Anh được chuyển sang tiếng Việt và đặt tên theo ngày.
  - Lịch sử P01 đến 10/10/2026 được tách nguyên văn sang [evidence](evidence/2026-10-10-p01-m1-identity-community-history.md).
- [x] Thêm quy tắc ghi progress vào [AGENTS.md mục 10](../AGENTS.md#10-quy-tắc-ghi-progress); cập nhật dòng trạng thái lỗi thời trong `plan/`.
- [ ] Mở 11 finding F-01…F-11, chưa sửa code. Xem [Findings](PHASE_TASK_CHECKLIST.md#findings-đang-mở).

## Sửa CI lịch sử — 16/10/2026 (PR #17, `9f4beca`)

- [x] Identity DLQ test đồng bộ assertion. Catalog CI dùng port loopback ephemeral. Regression port 3 tests và layout 7 tests PASS. Evidence: [2026-10-16-ci-historical-failure-fixes.md](evidence/2026-10-16-ci-historical-failure-fixes.md).
- [ ] Run ID CI sau sửa chưa được ghi (F-09).

## Kết nối P02 — 15/10/2026 (PR #16, `14b342c`)

- [x] Môi trường P02 cô lập (`backend/infra/p02.py`): sáu DB, RabbitMQ ACL/DLQ, Mailpit, synthetic licensed source, manifest/monitor.
- [x] Gateway principal exchange + live session check. Thêm 9 endpoint internal/media phục vụ P02 (ngoài contract, F-02).
- [x] Snapshot/rebuild Intelligence từ Catalog/Community/Identity/Trip/Ingestion. Có các suite fault/privacy/transport/import-ack (`p02_*.py`) và CI `p02-integration.yml`.
- [x] Frontend nghiệp vụ `TravelApp`, `TripEditor`, `OperationalPanels`, gọi Gateway thật. Có gateway smoke và browser smoke.
- [x] Evidence connected local 11/10/2026 trên checkout gốc: [P02_README](../backend/infra/P02_README.md#verification-checkpoint---11-october-2026). Bàn giao: [2026-10-15-p02-github-delivery.md](evidence/2026-10-15-p02-github-delivery.md).
- [ ] Chưa đủ gate P02: object storage/tracing, notification contribution/model.deployed, schema evolution, run ID CI `connected`, chữ ký N1/N2.

## Bàn giao P01 lên GitHub — 14–15/10/2026 (PR #8–#15)

- [x] Identity notification inbox (PR #8, `cb44518`) và lifecycle deletion/email/event (PR #9, `a9ab23a`): 25/25 operation, 60 tests DB/broker local PASS.
- [x] Catalog (PR #10, 26 tests), Community (PR #11, 30 tests), Trip (PR #12, 40 tests), Ingestion (PR #13, 38 tests), Intelligence Basic + ML pipeline (PR #14, 35 tests). Tất cả là suite DB/broker disposable, 0 failure/error/skip.
- [x] Gateway standalone + frontend API/rotating auth client (PR #15): Gateway 12 tests, client 7 tests lúc bàn giao.
- [x] Người dùng chấp nhận P01 trên checkout gốc ngày 11/10/2026 (ghi tại [P02_README](../backend/infra/P02_README.md)). Evidence: [2026-10-14-p01-github-delivery.md](evidence/2026-10-14-p01-github-delivery.md).
- [ ] Chưa có chữ ký reviewer chéo N1/N2 cho 6 gói; chưa có run ID CI của PR #14/#15.

## Platform/frontend ban đầu — 08–10/10/2026 (PR #3, #4)

- [x] PR #3 (`cc3b372`, 08/10/2026): landing page frontend "travel clay". Chưa có evidence test riêng trong progress.
- [x] PR #4 (`5319942`, 10/10/2026): cấu hình Docker cho Neon PostgreSQL và MongoDB Atlas tại [backend/platform/cloud/](../backend/platform/cloud/README.md), có `test_cloud_setup.py`, `check_databases.py`. Chưa ghi kết quả chạy; không dùng cho P02 local.
- [ ] Owner PR #3/#4 bổ sung lệnh test và kết quả (F-10).

## Lịch sử đến 10/10/2026

Các mục dưới đây giữ nguyên **trạng thái tại ngày ghi**. Một số dòng `[ ]` (ví dụ "Identity chưa xong P01") đã được hoàn thành ở các mục mới phía trên.

### Tài liệu và quyết định

- [x] Kiến trúc sáu service, mapping F01–F11/42 nguồn, DB conventions, API/events và kế hoạch phase — `plan/`.
- [x] Chốt database: Catalog PostgreSQL/PostGIS; Community MongoDB; Identity/Trip/Ingestion PostgreSQL; Intelligence PostgreSQL/pgvector; Redis cache riêng.
- [x] Hai người N1/N2, review chéo, file ownership/platform/frontend — `plan/06-work-assignment.md`; không cần GitHub username.
- [x] Có frontend, triển khai mới, recommendation Basic hoàn thiện trước ML, release cuối gồm ML.
- [x] Scope/policies, auth/roles/consent/currency/retry/version và baseline vận hành/provider/retention/ML quality/load — `plan/P00-DECISIONS.md`, `plan/P00-POLICIES.md`.
- [x] Thiết kế MongoDB collections/index/transaction/concurrency — `plan/database/community-mongodb.md`; SQL Community cũ được đánh dấu baseline lịch sử.
- [x] Quy tắc Git/GitHub — `AGENTS.md`, commit nền `83c07f3`; không suy ra đã merge main.

### Source/scaffold

- [x] Backend demo gốc và Maven Wrapper giữ nguyên, không xóa thay đổi người dùng.
- [x] Platform template Java21/Boot3.5.13/Flyway/health/JWT — `backend/platform/p00-template/`.
- [x] Sáu skeleton Java build/deploy độc lập — `backend/services/`; P00 chưa có domain API. P01 Identity đã triển khai auth/session/profile như evidence bên dưới; năm service còn lại vẫn ở baseline.
- [x] Community dùng Spring Data MongoDB, không JPA/JDBC/Flyway; P00 platform_probe giữ nguyên. P01 đã bổ sung domain migrations/index/collections thật, chưa có domain APIs.
- [x] Correlation/trace MDC, error auth JSON và WWW-Authenticate; audience/issuer/exp/iat/sub/signature validators.
- [x] Dockerfiles chạy non-root và Compose sáu DB +platform DB +sáu Redis riêng — `backend/platform/compose.p00.yaml`.
- [x] React/TypeScript/Vite frontend scaffold và API dev proxy — `frontend/`; chưa có màn nghiệp vụ hoàn chỉnh.
- [x] CI source cho contract/service/runtime/frontend — `.github/workflows/p00-template.yml`; chưa có remote CI run.

### Contract, fixture và bàn giao

- [x] Sáu OpenAPI 3.1, **183 operation** — `backend/contracts/openapi/`.
- [x] **23 event/command** schema +producer/consumer registry — `backend/contracts/events/`, `registry.json`.
- [x] Fixture request/response/header theo operation, event examples và common IDs/negative cases.
- [x] Candidate revision `1.0.0-candidate` và manifest SHA-256; validator mặc định kiểm, không tự che thay đổi bằng refresh.
- [x] Schema-driven stubs cho cả sáu service, auth giả lập rõ ràng; JWT test issuer ephemeral riêng.
- [x] Event transaction harness demo cho serialization/dedup/rollback/retry/out-of-order.
- [x] Load profile/generator deterministic, 83.000 synthetic records; không phải domain seed/ML quality evidence.
- [x] Hướng dẫn chạy độc lập và manifest sáu gói — `backend/platform/README.md`, `P00_HANDOFF.md`.

### Kiểm chứng thực tế

- [x] Sáu service Maven verify: **18 tests PASS**, 0 failures/errors/skips.
- [x] Platform Maven verify trên PostgreSQL thật: **4 tests PASS**, Flyway/rollback/app startup.
- [x] Sáu skeleton chạy lần lượt trên DB riêng: health UP, JWT thật accepted, sai audience/no JWT 401, error/correlation format đúng.
- [x] PostGIS ST_DWithin, pgvector cosine, MongoDB replica-set commit/rollback và sáu Redis PONG PASS.
- [x] Contract validator: **183 operation/examples/errors +23 message examples/negative cases PASS**.
- [x] Policy review suite: **7 tests PASS**; HTTP suite: **3 tests PASS**, gồm loop toàn bộ operation và common fixture invariants; event harness: **2 tests PASS**.
- [x] Synthetic load generator hai lần có checksum giống nhau.
- [x] Frontend build và HTTP Vite dev proxy PASS; npm audit **0 vulnerabilities** lúc kiểm tra.
- [x] Sáu service images và platform image build PASS; platform container health đã smoke UP.

### P01 đang triển khai — M1 storage/runtime (10/10/2026)

- [x] Năm PostgreSQL Flyway baseline domain + technical tables, runtime grants và Identity role seed; Community V1 16 collections/validator/index/checksum, revision startup guard và transaction manager.
- [x] Compose/runner/runbook riêng tại `backend/infra/`; admin/migrator/runtime tách riêng, MongoDB authenticated replica set, secret local đã ignore; không dùng lại/xóa volume P00.
- [x] Maven clean verify **21 tests PASS**, 6/6 app standalone DB/JWKS smoke, 6/6 storage/permission/constraint/rollback probes và 6/6 image build PASS.
- [x] CI matrix theo service + shared-contract checks đã có source/YAML parse, chưa có remote CI evidence. Không ghi nhận dependency scan/deploy/rollback đã pass.
- [x] Contract tracked revision kiểm trên temporary copy PASS (183 operation/23 messages); workspace validator đang bị bốn `text.txt` untracked có trước task làm manifest mismatch. Giữ nguyên file người dùng và manifest.
- [ ] Chưa hoàn tất seed/domain/security/adapter/outbox worker/DLQ/broker/frontend client hoặc gate M1–M4. Chi tiết lệnh và evidence tại [checklist P01 M1](evidence/2026-10-10-p01-m1-identity-community-history.md#p01-m1--phần-đã-triển-khai-và-kiểm-chứng).

### P01 Identity — auth/session (10/10/2026)

- [x] M1 Identity roles/options + U1/U2/admin/business opt-in fixture seed, V5 operational rate-limit/encrypted mail queue (20 tables, giữ V1–V4 checksum).
- [x] 13/25 operation thật: auth/verify/reset/change password, profile ETag, sessions cursor/owner/revoke và issuer RS256/JWKS/key rotation. Refresh/account token chỉ hash, consent default false, sensitive requests kiểm current status/session.
- [x] `python backend/services/identity-service/test-local.py`: **19 tests PASS**, 0 failure/error/skip, gồm **12** DB/API/domain tests trên PostgreSQL disposable thật. Concurrent refresh chỉ một thắng; reuse commit family revoke trước 401; expired/consumed token, reset/password/logout/session ownership và USER không gọi admin/internal.
- [x] Live jar và non-root image `smarttravel-identity:p01-auth-local`: SMTP Mailpit → verify/login/profile/sessions/refresh/logout, current-session revocation và frozen provider schemas/two event envelopes PASS. Storage/security smoke + permission/rollback probe Identity 20 tables PASS.
- [x] Local runners, ignored persistent signing/mail/fixture secrets, Mailpit loopback, CI source DB tests/image smoke và rotation/revoke/config runbook — `backend/services/identity-service/README.md`. Chưa remote CI hoặc con người review.
- [x] Blocker Community CRLF/LF của lượt hồi quy Identity đã được xử lý ở mục EOL bên dưới; full storage chạy lại 6/6 PASS. Lượt Identity cũ chỉ 5 PostgreSQL PASS, không sửa lại lịch sử kiểm thử.
- [ ] Identity chưa xong P01: preferences/category/consent/admin/internal batches, notifications/deletion/ack, transport/inbox/outbox worker/DLQ và toàn bộ provider/fault/security/handoff. Không READY_FOR_INTEGRATION. Chi tiết tại [checklist](evidence/2026-10-10-p01-m1-identity-community-history.md#identity-authsession--evidence-local-10102026).

### Refactor source layout — 10/10/2026

- [x] Sáu service theo service → chức năng → tầng, main/test package khớp thư mục; bootstrap ở root, common security/web và Community storage config về đúng package.
- [x] Identity tách auth/profile controller/DTO/service/repository; SQL chuyển vào repositories, mail/fixtures/outbox/audit/idempotency và JWT/error helpers tách file/package riêng, giữ transaction và wire contract.
- [x] Reactor 6/6 clean verify BUILD SUCCESS; Identity 19/19 tests trên PostgreSQL thật PASS; layout/generator safety 6 tests PASS; jar + non-root Identity image live SMTP/provider smoke và 5/5 relational app legacy smoke PASS.
- [x] Scaffold sinh layout mới; security sync chỉ export proposal review, không overwrite domain security. Quy ước: `backend/services/README.md`; evidence tại checklist chung.
- [ ] Identity P01 vẫn chưa hoàn tất toàn scope. Blocker EOL Community sau refactor đã xử lý và kiểm runtime PASS ở mục bên dưới; không đổi nội dung migration/database để che lỗi.

### Community EOL checksum — 10/10/2026

- [x] Giữ LF cho migration qua `backend/.gitattributes`; khôi phục file V1 về đúng bytes đã commit, không đổi checksum metadata/applied_at hoặc reset/xóa volume.
- [x] Java regression RED trên CRLF rồi GREEN trên LF; Community clean verify **7 tests PASS**. Layout/source guards **7 tests PASS**, gồm Git checkout `core.autocrlf=true`; JAR resource khớp checksum gốc `1830d58c…`.
- [x] Community storage/permissions/rollback PASS, app jar smoke/restart hai lần PASS, image `smarttravel-community:p01-eol-local` build PASS.
- [x] Full storage hồi quy **6/6 PASS**; read-only snapshot revision và document counts 16 collections trước/sau không đổi. Blocker CRLF/LF đã đóng; không coi đây là Community domain/P01 gate hoàn tất.

### Sửa CI PR #6 — 10/10/2026

- [x] Bổ sung manifest cho bốn ghi chú `text.txt`, không đổi checksum wire artifacts/revision; sửa POSIX runner gọi `bash mvnw` và image smoke dùng Compose DNS DB/SMTP, giữ host bindings loopback.
- [x] Regression runner 3/3 trên Linux container, image config/network 4/4; Identity PostgreSQL 19/19 và non-root image live auth/SMTP/provider/events PASS local.
- [x] Đã push `55fdc66` + `e1d1ddd` vào `feature/identity-phase01`; revision `e1d1ddd` **9/9 GitHub Actions checks PASS**. PR #6 `CLEAN`/`MERGEABLE`, chưa merge. Runs/evidence tại [checklist chung](evidence/2026-10-10-p01-m1-identity-community-history.md#sửa-ci-pull-request-6--10102026).
- [ ] Phần Identity workflows tiếp tục đang triển khai riêng, chưa commit/push hoặc đạt gate P01; không suy ra hoàn thành từ CI auth PASS.


Ghi chú gốc của các mục lịch sử: Cơ sở: revision Git nền `83c07f3`, thay đổi chưa commit/push, evidence local ngày08/10/2026. Không lấy thư mục target hoặc source test làm bằng chứng pass; lệnh/kết quả và giới hạn ở manifest. Test apps/stubs/issuers/Vite tạm được dừng; DB/cache Docker/volumes giữ để tiếp tục làm việc.

## Chưa xong / thuộc giai đoạn sau (hiện hành 20/10/2026)

- [ ] Gate P00: N1/N2 phê duyệt contract/policy candidate, nhận gói, freeze revision (F-05). Agent không ký thay.
- [ ] Gate P01: chữ ký owner/reviewer cho 6 gói và run ID CI. Các task handoff ID-10/CA-12/CO-11/TR-11/IG-11/IN-12 đang PARTIAL.
- [ ] Gate P02: P02-01, P02-08, P02-14 và CI `connected`.
- [ ] P03 kiểm thử hệ thống: E2E/security/load/restore/frontend a11y/ML quality trên dữ liệu thật. **NOT_STARTED**.
- [ ] P04: production domain/provider credentials/licenses/budget/support-EOL, release/rollback/bàn giao. **NOT_STARTED**.
