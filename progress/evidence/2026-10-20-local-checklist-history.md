# L?ch s? checklist local ???c b?o to?n khi ??ng b? main

Ngu?n nguy?n v?n: commit `15e9004`, checkout local tr??c ??ng b? `origin/main` `3e20d63`. Nh?ng tuy?n b? nghi?m thu v? s? ?o d??i ??y l? l?ch s? ch?a ???c x?c nh?n l?i; tr?ng th?i hi?n h?nh theo hai checklist ch?nh, gi? m?c th?p h?n khi m?u thu?n. Kh?ng d?ng n?i dung l?ch s? n?y ?? ??ng gate ho?c k? thay owner/reviewer.

## Ngu?n `progress/COMPLETED_WORK_CHECKLIST.md`

# Checklist những gì đã làm được

**20/10/2026 — P03 không AI: COMPLETE / P03_NON_AI_VERIFIED.** Đã nghiệm thu toàn bộ phạm vi không AI theo yêu cầu người dùng; F05/F08, quản trị model/dataset, ML và AI quality là **DEFERRED_BY_USER**. Full SYSTEM_VERIFIED chưa được cấp; P04 vẫn NOT_STARTED. Chi tiết và số đo: [bàn giao P03 không AI](../docs/P03_NON_AI_ACCEPTANCE.md).

- [x] P03-01/02/03/04/05/06/07/08/11: hoàn thành phạm vi không AI, có đủ bằng chứng current-source và gate đạt.
- [ ] P03-09/10 và các phần AI lồng trong task khác: DEFERRED_BY_USER, để thực hiện sau.
- [x] Gate phạm vi người dùng yêu cầu: P03_NON_AI_VERIFIED; full SYSTEM_VERIFIED và P04 không được cấp.

216 service test; 94 tooling test (93 pass, 1 skip Windows); 532 security request; 8 browser nhóm/36 responsive; load 1.200 HTTP 200, 50 tài khoản, p95 tổng 232,16 ms; application restore 183,92 giây.

Các checklist và checkpoint cũ bên dưới lưu lịch sử/phạm vi đầy đủ trước khi người dùng hoãn AI; trạng thái hiện hành nằm ở block 20/10 này.

---

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
- [x] Sáu skeleton Java build/deploy độc lập — `backend/services/`; P00 chưa có domain API. P01 hiện đã triển khai domain APIs/workers/handlers của sáu service; evidence hiện hành ngày 11/10/2026 ở trên các mục lịch sử bên dưới.
- [x] Community dùng Spring Data MongoDB, không JPA/JDBC/Flyway; P00 platform_probe giữ nguyên. P01 đã bổ sung domain migrations/index/collections và domain APIs thật; các phiên bản/test cuối xem evidence hiện hành.
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

## P01 kiểm nhận hiện hành — 11/10/2026

- [x] Domain source của sáu service, feature → layer repositories/services/controllers, DB riêng, API/provider/events/outbox/inbox/retry/DLQ/operator runbooks đã có; không còn chỉ skeleton. Kiểm kỹ thuật với đối tác stub, chưa nối service thật.
- [x] Identity **58/58 PASS**, 25 provider operations, non-root live SMTP/RabbitMQ/deletion sáu ack PASS; Intelligence **32/32 PASS**, Basic→licensed synthetic dataset/training/validation/activation/rollback/inference fallback và non-root V1–V9/pgvector image PASS.
- [x] Catalog **26/26 PASS**, provider 66 operations, PostGIS EXPLAIN index evidence; Community **27/27 PASS**, MongoDB transaction/rating/private collection/contribution và migration V3 fence. Scanner HTTP giới hạn 1 MiB/2 giây; cả hai image non-root cuối PASS.
- [x] Gateway **12/12**, frontend API client **7/7**, TypeScript/Vite build, audit **0 vulnerabilities**; frozen **183 operations/23 messages** và layout/checksum/policy/stub/event tests PASS.
- [x] Independent agent review phát hiện/sửa bounded HTTP body deadline và mutation/deletion race; bổ sung shared transaction fences/current-status guards/privacy purge/concurrency regressions. Agent review không thay chữ ký N1/N2.
- [x] Full persistent storage/permissions/rollback PASS: Identity22, Catalog31, Trip14, Ingestion13, Intelligence19 tables; Community17 collections V1–V3. Trip V1–V7/Ingestion V1–V8 thu hồi audit mutation runtime và giữ privacy purge qua restricted function.
- [x] Trip **39/39** và Ingestion **38/38** tests PASS, không failure/error/skip; image rebuild/probe cuối của cả hai PASS. Trip bổ sung route/attribution/visibility; Ingestion kiểm price/address/malformed rows/PARTIAL và assertions ack/checkpoint. Tổng sáu service **220 tests PASS**; sáu image non-root cuối PASS.
- [x] P01 được người dùng duyệt ngày 11/10/2026 và mở P02; phê duyệt thay thủ tục chữ ký từng gói, không giả chữ ký N1/N2.
- [ ] P00 candidate freeze và remote CI cho source cuối còn chờ; không dùng CI PR #6 ngày 10/10 làm evidence cho source mới.

Chi tiết lệnh/kết quả/current blockers và journal kỹ thuật nằm trong [checklist tiến độ chung](PHASE_TASK_CHECKLIST.md#kiểm-nhận-p01-hiện-hành--11102026); không tạo báo cáo riêng cho phase/service. Các phần ngày 08–10/10 dưới đây giữ nguyên làm lịch sử.

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

## Sửa CI PR #6 — 10/10/2026

- [x] Bổ sung manifest cho bốn ghi chú `text.txt`, không đổi checksum wire artifacts/revision; sửa POSIX runner gọi `bash mvnw` và image smoke dùng Compose DNS DB/SMTP, giữ host bindings loopback.
- [x] Regression runner 3/3 trên Linux container, image config/network 4/4; Identity PostgreSQL 19/19 và non-root image live auth/SMTP/provider/events PASS local.
- [x] Đã push `55fdc66` + `e1d1ddd` vào `feature/identity-phase01`; revision `e1d1ddd` **9/9 GitHub Actions checks PASS**. PR #6 `CLEAN`/`MERGEABLE`, chưa merge. Runs/evidence tại [checklist chung](PHASE_TASK_CHECKLIST.md#sửa-ci-pull-request-6--10102026).
- [ ] Phần Identity workflows tiếp tục đang triển khai riêng, chưa commit/push hoặc đạt gate P01; không suy ra hoàn thành từ CI auth PASS.

## P01 Identity — notification/deletion handlers (10/10/2026)

- [x] Nhánh `feature/backend-phase01-completion` từ main mới nhất; giữ commit preferences/admin/batches qua cherry-pick. Không push, không dừng localhost hay sửa/xóa volumes/secret/.pi-logs.
- [x] Bổ sung 4 routes: notification list/read và deletion request/internal status; Identity **25/25 routes implemented**, chưa full gate.
- [x] Notification frozen-schema handlers (claim/review/trip), title allowlist, inbox/IN_APP atomic dedup, stream version, signed cursor, owner/read idempotency.
- [x] Deletion local purge/consent revoke/tombstone/session revoke/outbox atomic; sáu ack, missing/FAILED/stale/dedup/concurrency/recovery/terminal completion; internal workload authorization, migration V7 additive.
- [x] **40/40 tests PASS**, 0 skip trên PostgreSQL16 disposable: 28 DB/API/domain + 12 unit/security/client. Reactor 6/6 build PASS (ordinary run skip 28 DB tests), image `smarttravel-identity:p01-workflows-local` build PASS. Dùng bản sao source temporary vì JAR checkout bị Windows lock; giữ process cũ.
- [x] Frozen contracts/manifest PASS (183 operations/23 messages), layout 7 PASS, whitespace PASS. Chi tiết/giới hạn tại [progress P01](PHASE_TASK_CHECKLIST.md).
- [ ] Chưa EMAIL notification/retry, category invalidation, broker/outbox/replay/DLQ/retention/full provider/fault/security/handoff; chưa live image smoke mới hoặc remote CI. Năm service còn lại chưa xong domain; **P01 chưa hoàn thành**.

## P01 tiếp tục — Identity transport và các worktree song song

- [x] Identity EMAIL/retry, category invalidation, RabbitMQ confirmed outbox/inbox/DLQ/replay/ACL/fault tests, retention/request size/config guards: **52/52 tests PASS**, 0 skip trên disposable PostgreSQL16 + RabbitMQ4.1; provider HTTP kiểm đủ25 operations. Image `smarttravel-identity:p01-transport-local` build PASS, chưa live image smoke mới.
- [x] Coordinator verify draft worktrees: Catalog5 tests (2 PostGIS), Ingestion5 (2 PostgreSQL), Community7/Trip3/Intelligence3 baseline tests PASS. Đây không phải full domain gate.
- [ ] Domain/platform draft chưa review/integrate, ML pipeline và full gates còn thiếu. Năm agent gặp usage-limit; không còn chạy ngầm. Giữ worktrees và Community commit `ec46125`, không push hoặc tự đóng P01. Chi tiết vị trí/evidence tại [checklist chung](PHASE_TASK_CHECKLIST.md).

## Chưa được xác nhận / thuộc giai đoạn sau

- [ ] N1/N2 phê duyệt contract/policy candidate và nhận gói; điều phối freeze/đóng gate P00. Agent không tự ký thay.
- [x] P01 technical evidence and user approval on 11 October 2026; no N1/N2 signatures claimed.
- [x] P02 COMPLETE: final core/fault/privacy/transport/Gateway client/browser, exact manifest and clean monitor PASS; all six services CONNECTED.
- [ ] P03 system E2E/security/full load/application DR/real ML quality: **IN_PROGRESS**, full gate **NO_GO**; local probes/tooling có evidence, full acceptance chưa đạt.
- [ ] Production domain/provider credentials/licenses/budget/support-EOL review, release/rollback/bàn giao P04.
- [x] Remote GitHub Actions PR #6 pass và auth/layout/CI fixes đã commit/push như evidence ở trên; không bao gồm Identity workflows mới đang triển khai.

Cơ sở: revision Git nền `83c07f3`, thay đổi chưa commit/push, evidence local ngày08/10/2026. Không lấy thư mục target hoặc source test làm bằng chứng pass; lệnh/kết quả và giới hạn ở manifest. Test apps/stubs/issuers/Vite tạm được dừng; DB/cache Docker/volumes giữ để tiếp tục làm việc.

P01 **ACCEPTED_BY_USER** on 11 October 2026. P02 **COMPLETE**, six services **CONNECTED**: final real core/fault/privacy/transport, Gateway client/browser, manifest and monitor PASS. P03/P04 not started at this P02 checkpoint (current P03: IN_PROGRESS; P04: NOT_STARTED). P00 remains 1.0.0-candidate; freeze and remote CI for latest source remain pending. Source is dirty with exact hashes recorded; no new commit/push or N1/N2 signatures claimed.

## P02 integration checkpoint - 11 October 2026

- [x] Six real services + Gateway, separate credentials/databases, RabbitMQ ACL/subscriptions, persistent issuer and live revocation; ignored local secrets and explicit provider sandboxes.
- [x] Core SMTP/six-deletion-ack smoke, real Gateway client and browser smoke PASS. Commands/evidence: [phase checklist](PHASE_TASK_CHECKLIST.md), [runbook](../backend/infra/P02_README.md).
- [x] Latest core smoke validates persisted Catalog rating; connected faults cover concurrent snapshot/delta and pending deletion with a missing Trip acknowledgement. Latest privacy, Gateway client and browser smoke PASS.
- [x] Latest independent regressions: Identity61, Catalog27, Intelligence38, Trip41 full transport tests; Gateway14, frontend7/build, frozen 183 operations/23 messages/checksum PASS.
- [x] Final Catalog27/full transport/rebuilt image, connected retry/DLQ/scoped replay/audit, exact running-image manifest and monitoring PASS (seven ready, six consumers, zero pending/unacknowledged service-inbox messages and zero DLQ messages; alarms=[]). P02 COMPLETE; no SYSTEM_VERIFIED/production connectivity claimed.

- [x] Final P02-05 `p02_import_ack_test.py` PASS exit0: withheld Catalog ack after DB commit, original command redelivery without duplicate/version change, ACL restored and durable ack retry completes job. All P02 tasks/gates complete; P03/P04 not started at this P02 checkpoint (current P03: IN_PROGRESS; P04: NOT_STARTED).

Monitor scope note: zero backlog applies to the six service inboxes and their DLQs. The bounded `platform.audit` sink intentionally retains 288 audit messages without a consumer; it is not claimed empty. Actual monitor status field is `alarms=[]`.


## P03 evidence update - 11 October 2026

Current status: **IN_PROGRESS / NO_GO**; P04 **NOT_STARTED**, dependent on SYSTEM_VERIFIED. Earlier P02 checkpoint statements retain their historical scope. P03-07 complete in measured browser scope; other full P03/P04 tasks and phase gates remain pending. Runbook: [P03_README](../backend/infra/P03_README.md).

- Local tooling: 45 P03 tests pass; release gate requires explicit matching release_id on every report, fresh aware timestamps, current source hashes and reviewed operations linkage. Missing identity/evidence returns NO_GO. Remote P03 tooling CI has not run.
- Frozen validator: 183 HTTP operations/23 event examples and exact canonical manifest pass. Security: 504 negative guest/malformed/USER/BUSINESS admin/internal checks pass; 22 anonymous operations skipped, full_role_matrix_pass=false.
- Read load: 600 requests, zero errors, about19.972rps, p95 157.983ms, 50 virtual users/peak4 inflight. Optional full-mix snapshot: 600 requests/30.103s, zero errors/dropped slots, 19.932rps, 50 virtual users but ONE authenticated fixture, peak5 inflight. Class p95 catalog167.016ms/Basic476.551ms/trip78.329ms/write65.654ms. Original fixture display name restored in finally; recommendation request records persist.
- Read-only dataset diagnostic snapshot: places20/users13/reviews11/trips12/interactions6; required deficits9980/1987/19989/988/49994. Actual unfiltered Catalog page query EXPLAIN ANALYZE BUFFERS execution10.492ms/planning0.873ms on small dataset. Full P00 load gate remains false; no bulk seed or claim of realistic-user contention.
- Fresh P02 core/fault evidence remains scoped, not F01?F11 certification. Covers contribution/dedup/visibility/crash-after-commit/snapshot-delta/missing-Trip-ack; monitor sevenready/six service inbox consumer1 ready0unacked0DLQ0/alarms[], separate audit sink321 retained.
- Outstanding: complete role/BOLA/upload/rate-limit security, all E2E/compatibility/reconciliation, full scale/mix/distinct-user load and hot-query/pool/backpressure, application DR/projection-watermark recovery, real licensed data/holdout quality, complete frontend/provider scope and reviewed operational owners/release linkage. Storage restore and browser results are tracked separately by exercise scope; these probes do not establish SYSTEM_VERIFIED.

Private evidence stays under ignored backend/infra/.local/p03. No new commit/push, production deployment or model activation is claimed.

Browser checkpoint: frontend53 checks PASS, zero failures/gaps; 36 responsive cases cover user map, business and admin review at320/390/768/1280. Real OSM response200 and MapLibre zoom; verification/claim pending, moderation, import QUEUED with refresh, labels/keyboard focus/loading/error/empty states observed. P03-07 complete for this measured scope/basic accessibility; no broad WCAG certification claimed. Evidence release_id p03-local-20261011-a466c6d, timestamp2026-10-11T11:19:38.038Z, five current source hashes. Frontend build37 modules and contracts7 checks PASS. Full P03 gate remains NO_GO.

Subsequent concurrent probe checkpoint: mixed load overlapping isolated restore measured600 requests with3 Basic errors (Basic120 requests), 19.8969rps. Class p95 Catalog218.593ms/Basic679.993ms/Trip99.270ms/write92.942ms. Older600/zero-error snapshots above remain historical; they precede this concurrent run; the final sequential candidate snapshot is recorded below. HTTP error codes were not captured in that older report and cause is unresolved. Sequential rerun and final restore evidence are recorded below; do not infer a release pass.

Final isolated storage checkpoint: restore-report.json PASS exit0, release p03-local-20261011-a466c6d, UTC2026-10-11T11:26:51.630878+00:00. Restore125.301558s, checkpoint age678.592985s; source hashes unchanged during run. Six DB row/document counts, Mongo options/indexes and full PostgreSQL schema against same-engine archive-only reference MATCH. Fifteen backup artifacts pass integrity validation;17 restore safety tests PASS. Six object volumes each contain0 files: nonempty object recovery remains unverified. All exercise-owned containers/volumes removed; original seven apps ready. Application DR, Mongo auth roles/topology, PostgreSQL ownership/ACL, encryption/offsite backup and production RPO/RTO remain unverified; P03-06 remains unchecked.

Final sequential candidate checkpoint:45 P03 tooling unit tests PASS and independent review APPROVE for scoped local tooling, no high/critical findings in that review scope. Frozen contracts183 HTTP operations/23 messages PASS; security504 checks PASS (full role matrix still incomplete). Final isolated mixed run600/600 HTTP200 over30.1706s,19.8869rps, zero errors/dropped slots, aggregate p95472.484ms/max591.568ms, peak6 inflight,50 virtual users sharing ONE principal. Class counts/p95: Catalog300/178.435ms, Basic120/554.207ms, Trip90/81.913ms, writes90/62.305ms. Fixture profile recovered. Source hashes match current candidate; previous3-Basic-error report retained in private raw archive with concurrency context, cause unproven. Local mixed latency passes; frozen dataset/distinct-principal load acceptance remains false. P03 remains IN_PROGRESS / NO_GO; P04 NOT_STARTED.

Final gate/monitor checkpoint: actual release gate NO_GO, p04_authorized=false and release_linkage_review_required=true; operations review and full acceptance criteria remain missing. Seven original applications ready; all six service inboxes consumer1/ready0/unacked0/DLQ0, alarms empty. Audit sink retained383 messages intentionally; earlier321 is historical. Final local manifest verification PASS exit0: source/image/JAR/running image exact match for all seven packages; Git dirty state preserved accurately. This does not authorize production release. Backups remain ignored and no exercise-owned restore containers remain.

## Ngu?n `progress/PHASE_TASK_CHECKLIST.md`

# Checklist tiến độ các phase

**20/10/2026 — P03 không AI: COMPLETE / P03_NON_AI_VERIFIED.** Đã nghiệm thu toàn bộ phạm vi không AI theo yêu cầu người dùng; F05/F08, quản trị model/dataset, ML và AI quality là **DEFERRED_BY_USER**. Full SYSTEM_VERIFIED chưa được cấp; P04 vẫn NOT_STARTED. Chi tiết và số đo: [bàn giao P03 không AI](../docs/P03_NON_AI_ACCEPTANCE.md).

- [x] P03-01/02/03/04/05/06/07/08/11: hoàn thành phạm vi không AI, có đủ bằng chứng current-source và gate đạt.
- [ ] P03-09/10 và các phần AI lồng trong task khác: DEFERRED_BY_USER, để thực hiện sau.
- [x] Gate phạm vi người dùng yêu cầu: P03_NON_AI_VERIFIED; full SYSTEM_VERIFIED và P04 không được cấp.

216 service test; 94 tooling test (93 pass, 1 skip Windows); 532 security request; 8 browser nhóm/36 responsive; load 1.200 HTTP 200, 50 tài khoản, p95 tổng 232,16 ms; application restore 183,92 giây.

Các checklist và checkpoint cũ bên dưới lưu lịch sử/phạm vi đầy đủ trước khi người dùng hoãn AI; trạng thái hiện hành nằm ở block 20/10 này.

---

## Cách cập nhật

- `[x]`: đã hoàn thành và có bằng chứng; `[ ]`: chưa hoàn thành hoặc chưa được kiểm chứng.
- Sau task hoàn thành, ghi artifact/commit, lệnh và kết quả kiểm thử, người review. Task đang làm ghi `Đang làm`; bị chặn ghi blocker/người xử lý ngay dưới task.
- Chỉ đóng phase khi đạt gate trong tài liệu gốc, không dựa vào số ô đã tích.
- Revision Git nền `83c07f3`; cập nhật P00 ngày 08/10/2026. P00 **READY_FOR_REVIEW**: triển khai kỹ thuật hoàn tất, chưa đóng gate bàn giao N1/N2. Contract revision `1.0.0-candidate`; evidence tại `backend/platform/P00_HANDOFF.md`.
- Checklist này là nguồn theo dõi tiến độ chung; không cần tạo báo cáo riêng cho từng phase/service. Chi tiết yêu cầu vẫn nằm trong `plan/phases/`.

## P00 — Chuẩn bị chung

Nguồn: [checklist P00](../plan/phases/P00-scope-architecture.md).

- [x] P00-01: Review kỹ thuật F01–F11/42 logical mappings, giữ boundary sáu service và ghi policy — `plan/P00-POLICIES.md`, `plan/database/community-mongodb.md`.
- [x] P00-02: Owner/reviewer N1/N2, folder ownership/platform/frontend đã được phân công theo xác nhận người dùng.
- [ ] P00-03: OpenAPI đã đủ 183 operation và validate PASS; **chờ N1/N2 chốt candidate thành revision bàn giao**.
- [ ] P00-04: Đủ 23 event/command schema và registry producer/consumer; **chờ N1/N2 chốt candidate**.
- [x] P00-05: Fixture chung và từng operation/message, negative cases, deterministic synthetic load profile/generator.
- [x] P00-06: Sáu skeleton chạy độc lập trên DB riêng, platform migration probe, HTTP stubs/JWKS/event harness có test evidence.
- [x] P00-07: Java21/Boot3.5.13/build/image/config/log-correlation/health/error và CI source đã kiểm chứng local; không tuyên bố CI remote đã pass.
- [x] P00-08: Scope/frontend/new deployment/Basic→ML và baseline SLO/load/RPO/RTO/provider/retention có owner.
- [ ] P00-09: Agent review kỹ thuật producer/consumer và checksum/examples PASS; manifest/hướng dẫn đầy đủ; **còn xác nhận N1/N2 nhận gói và điều phối freeze revision**.
- [ ] **Gate P00:** sáu owner có đầu vào cùng revision, chạy độc lập được và xác nhận bàn giao.

### Các bước nhỏ P00 đã thực hiện (lịch sử và evidence)

- [x] P00-01.a: Ánh xạ Tourism & Geo/Auth/UGC/AI sang Catalog/Identity/Community/Intelligence, giữ sáu service — `plan/P00-DECISIONS.md`.
- [x] P00-01.b: Ghi nhận Catalog PostgreSQL/PostGIS, Community MongoDB và Redis cache tách service; các lựa chọn còn lại đã chốt ở P00-08.
- [x] P00-01.c: Cập nhật kiến trúc và cảnh báo baseline SQL Community không còn dùng trực tiếp; thiết kế MongoDB mới đã ghi tại `plan/database/community-mongodb.md`.
- [x] P00-06.a: Tạo template độc lập, security JWT validator và migration probe — `backend/platform/p00-template/`.
- [x] P00-06.b: Tạo Compose PostGIS, DB platform, MongoDB replica-set init và sáu Redis cache — `backend/platform/compose.p00.yaml`.
- [x] P00-07.a: Xác minh Java 21/Maven Wrapper 3.9.16; template Spring Boot 3.5.13 resolve/build/package thành công.
- [x] P00-07.b: Hai unit tests audience/issuer/expiry pass. Lệnh: `./backend/mvnw -f backend/platform/p00-template/pom.xml verify -B`; kết quả 2 tests, 0 failures/errors, BUILD SUCCESS.
- [x] P00-07.c: Compose parse pass: đặt sáu password environment local rồi chạy `docker compose -f backend/platform/compose.p00.yaml config --quiet` (exit 0).
- [x] P00-07.d: Viết workflow CI template — `.github/workflows/p00-template.yml`; mới có source, chưa chạy GitHub Actions.
- [x] P00-09.a: Viết hướng dẫn build/local và danh sách quyết định cần người dùng xác nhận — `backend/platform/README.md`, `plan/P00-DECISIONS.md`.
- [x] P00-06.c: Bật Docker Desktop và chạy sáu DB domain + sáu Redis cache; `check_runtime.py` PASS.
- [x] P00-06.d: PostGIS ST_DWithin, pgvector cosine và MongoDB commit/rollback probe PASS.
- [x] P00-06.e: Template app startup, Flyway V1 và PostgreSQL rollback test PASS trên DB thật.
- [x] P00-06.f: HTTP JWKS test kiểm RS256 signature, forged key, issuer/audience/expiry và rotation PASS.
- [x] P00-07.e: Build Docker image template (non-root), container startup/Flyway và health UP với DB thật; container probe đã dừng/xóa, DB/cache giữ lại.
- [x] P00-06.g: Stub mọi service — `contract_stub.py`; ba HTTP tests thực hiện 183 operation, negative auth/precondition/body/timeout và common fixture visibility/consent/revocation/missing IDs PASS. Stub Catalog cũ đã được thay thế.
- [x] P00-03.a: Sáu OpenAPI candidate, 183 operation + request/response/errors/headers/pagination fixtures; validator PASS.
- [x] P00-04.a: 23 message schemas/envelopes, applied/rejected, registry producer/consumer; serialization/schema negative cases PASS.
- [x] P00-05.a: Fixture chung cùng revision, HTTP/event fixtures và SHA-256 manifest; verify không âm thầm refresh checksum.
- [x] P00-01.d: Thiết kế collections/index/transaction/concurrency Community MongoDB — `plan/database/community-mongodb.md`; chưa được N1/N2 review.
- [x] P00-06.h: Tạo sáu Java skeleton tại `backend/services/`; Maven verify 18 tests PASS, MongoDB không JDBC/Flyway/JPA.
- [x] P00-06.i: Chạy riêng 6/6 skeleton với DB thật, test issuer JWKS ephemeral; JWT đúng được nhận, sai audience/no JWT 401, error/correlation schema đúng.
- [x] P00-04.b: Event harness SQLite transaction demo: 23 messages, dedup, crash/rollback/retry và old-version handling PASS; domain consumers/transport còn thuộc P01/P02.
- [x] P00-09.b: Independent policy review suite 7 tests PASS; không ghi nhận đây là chữ ký N1/N2.
- [x] P00-05.b: Sinh 83.000 synthetic records hai lần, checksum khớp; chưa benchmark tải hoặc ML quality.
- [x] P00-06.j: Frontend React/TypeScript/Vite scaffold, build và HTTP dev proxy PASS; npm audit 0 vulnerabilities lúc kiểm tra, chưa browser/E2E.
- [x] P00-09.c: Manifest sáu gói cùng revision và hướng dẫn independent local — `backend/platform/P00_HANDOFF.md`, `backend/platform/README.md`.
- [ ] N1/N2 xác nhận review/nhận gói; điều phối freeze contract và đóng gate.

- [x] P00-02.a: Chia N1 = Identity/Catalog/Ingestion, N2 = Community/Trip/Intelligence; review chéo, N1 quản lý platform và N2 frontend shell.
- [x] P00-08.a: Chốt PostgreSQL cho Identity/Trip/Ingestion, PostgreSQL + pgvector cho Intelligence.
- [x] P00-08.b: Chốt frontend, triển khai mới, Basic hoàn thiện trước rồi ML; release cuối gồm ML.
- [x] P00-08.c: Ghi baseline provider/load/SLO/RPO/RTO/retention/model và người chịu trách nhiệm quyết định còn lại — `plan/P00-DECISIONS.md`. Đây là mục tiêu thiết kế, chưa kiểm chứng hoặc provision dịch vụ.

**Còn thiếu duy nhất để đóng gate bàn giao:** xác nhận N1/N2 phê duyệt candidate/nhận sáu gói và điều phối freeze revision. Không còn phần scaffold P00 chưa triển khai được ghi nhận trong lượt này. Không giả mạo chữ ký hoặc gọi policy tests là review của con người. Credential/domain/ngân sách/source license/support-EOL production có owner xử lý trước triển khai, không chặn scaffold local. Không cần GitHub username. Xem [manifest bàn giao](../backend/platform/P00_HANDOFF.md).

## P01 — Phát triển và kiểm thử độc lập

Nguồn: [sáu gói service](../plan/phases/P01-services/README.md). Các nhóm có thể làm song song sau P00.

### Kiểm nhận P01 hiện hành — 11/10/2026

**ACCEPTED_BY_USER**, user approval on 11 October 2026 opens P02. Existing verified P01 package: 220 service tests PASS (zero failures/errors/skips), six non-root images and persistent storage PASS. Source remains dirty; no new commit/push or N1/N2 signatures are claimed.

| Gói | Tests cuối | Image/runtime cuối | Trạng thái |
|---|---|---|---|
| Identity | **58/58 PASS**, không failure/error/skip; PostgreSQL16/RabbitMQ4.1 disposable, provider đủ 25 operations | Non-root live SMTP/JWKS/auth/preferences/session, notification EMAIL/read, deletion thiếu/đủ sáu ack, outbound schemas PASS | ACCEPTED_BY_USER |
| Catalog | **26/26 PASS**, không failure/error/skip; provider 66 operations, admin/actor fence và scanner giới hạn body/deadline | Image non-root PASS; EXPLAIN dùng Index Scan `places_location_idx`; persistent storage 31 tables PASS | ACCEPTED_BY_USER |
| Community | **27/27 PASS**, không failure/error/skip; MongoDB transaction, broker, provider, mutation fence và scanner giới hạn body/deadline | Image non-root MongoDB V1–V3, 17 collections, runtime/security PASS; audit append-only | ACCEPTED_BY_USER |
| Trip | **39/39 PASS**, không failure/error/skip: 18 DB/provider, 12 broker, 9 unit/security; thêm route/attribution/visibility hồi quy | Image rebuild/probe cuối PASS; owned PostgreSQL V1–V7, non-root health/JWKS/auth/CRUD/frozen responses | ACCEPTED_BY_USER |
| Ingestion | **38/38 PASS**, không failure/error/skip; normalization price/address, malformed-row quarantine, registered consumers và projected admin status/deletion concurrency; Flyway V1–V8 | Image non-root rebuild/probe cuối PASS | ACCEPTED_BY_USER |
| Intelligence | **32/32 PASS**, không failure/error/skip: 21 DB/domain/HTTP/ML, 4 broker, 7 security/contracts | Non-root PostgreSQL/pgvector, migrations V1–V9, health/readiness/liveness, exact guest response và artifact storage PASS | ACCEPTED_BY_USER |

Lệnh domain gate: `python backend/services/<service>-service/test-local.py --transport`; Identity thêm `--isolated-source` để giữ JAR/process checkout đã có. Reports ở `target/surefire-reports`, riêng verified Identity ở ignored `.local/verified-build`. Image tag `smarttravel-<service>:p01-finish-local`; build helper `python backend/platform/build_service_image.py <service> --tag ...` dùng JAR đã verify. Probe `python backend/services/<service>-service/check-local.py --image ...`; Identity thêm `--transport --jar <verified-jar>`. Mỗi runner chỉ dừng/xóa dependencies disposable nó sở hữu; persistent DB/volumes giữ nguyên.

- [x] Gateway `clean verify`: **12/12 PASS**, RS256/JWKS HTTP thật, target audience/admin/internal denial, CORS/chunked size, bounded dependency/retry/runtime guards.
- [x] Frontend `npm run test:contracts`: **7/7 PASS**; TypeScript/Vite build PASS; `npm audit --audit-level=high`: **0 vulnerabilities**. Đây là API client/stub verification, chưa frontend nghiệp vụ E2E.
- [x] Shared frozen validator **183 operations/23 messages/manifest PASS**; layout 7, checksum 3, policy 7, HTTP stubs 3, event harness 2 PASS. Không đổi contract candidate hoặc checksum migrations đã áp dụng.
- [x] CI source kiểm sáu service độc lập, disposable broker/domain tests, immutable image artifact và non-root provider probes cho mọi service; Gateway/frontend job. Chưa remote CI run cho source cuối.
- [x] Full persistent storage/permissions/rollback PASS: Identity22, Catalog31, Trip14, Ingestion13, Intelligence19 tables; Community17 collections V1-V3. Runtime audit mutation and cross-DB credentials denied.
- [x] Peer review fixes verified by agents where recorded; coordinator reviewed destination serialization, SQL repository placement and restricted audit functions. Image của source mới chỉ được ghi PASS sau khi kiểm lại; handoff con người vẫn tách riêng.
- [x] Audit evidence cuối độc lập: đọc Surefire XML của sáu service xác nhận tổng 220 tests, zero failure/error/skip; SHA-256 JAR trong 6/6 image khớp verified JAR local, không dùng image cũ thay source mới.
- [x] P01 user acceptance on 11 October 2026 opens P02; remaining package signature procedure is replaced by this approval. No N1/N2 signatures are claimed.

**Ghi nhận kỹ thuật ngắn (journal tại checklist hiện có):** independent review phát hiện HTTP body không bị giới hạn sau headers và race giữa mutation/deletion. Đã sửa bounded byte/deadline trong client, thêm shared user transaction fences, kiểm projected status và purge/anonymize actor identifiers; tests dùng latch/DB thật kiểm cả thứ tự commit. Intelligence fallback giữ Basic khi checksum/schema/model timeout lỗi và vẫn fail closed khi Catalog visibility không xác minh được. Không sửa checksum lịch sử hoặc phục hồi consent/token đã revoke. Dataset synthetic kiểm cơ chế; production model activation vẫn tắt, chất lượng trên dữ liệu licensed/holdout thật thuộc P03.

**Task mapping:** technical evidence below remains unchanged; user approval replaces the remaining package signature procedure.

| Task | Bằng chứng triển khai/kiểm chứng |
|---|---|
| ID-01–09 | Migrations/seed, auth/preferences/notifications/deletion, 25 provider operations; 58 tests và live SMTP/JWKS/sáu ack PASS |
| CA-01–11 | PostGIS/seed, 66 provider operations, protected-field conflict, actor mutation fence, EXPLAIN index; 26 tests và image PASS |
| CO-01–10 | MongoDB V1–V3/17 collections, 32 provider operations, transaction/rating/private collection/contribution, mutation fence; 27 tests và image PASS |
| TR-01–10 | CRUD/snapshot/route/attribution, 29 provider operations, cross-trip/date/concurrent reorder, Catalog outage/routing timeout, registered destination/place consumers; 39 tests và image rebuild/probe cuối PASS |
| IG-01–10 | Source policy/jobs/canonical hash/quarantine/match/checkpoint, 18 provider operations, stable replay/ack/PARTIAL/revocation; 38 tests với assertions bổ sung và image rebuild/probe cuối PASS |
| IN-01–11 | Basic golden/filter/consent/visibility, dataset/license/checksum/train/activation/rollback/inference fallback; 32 tests và image PASS |

Ingestion chuẩn hóa address trong `normalized_payload` nội bộ; command Catalog chỉ giữ allowlist frozen v1 nên không gửi address. Price numeric-string được đổi thành số, unknown giữ null; NaN/Infinity/âm và malformed connector rows bị quarantine, record tốt vẫn xử lý và job PARTIAL không tiến checkpoint. Derived counts là accounting nội bộ, không tự thêm field vào frozen response. Scanner Catalog/Community dùng giới hạn body 1 MiB và deadline tổng 2 giây; scanner lỗi không duyệt media. Source hiện còn dirty và merge chưa commit; chưa có bằng chứng checkout Git sạch hoặc CI remote của revision cuối.


P01 **ACCEPTED_BY_USER** on 11 October 2026. P02 **COMPLETE**, six services **CONNECTED**: final real core/fault/privacy/transport, Gateway client/browser, manifest and monitor PASS. P03/P04 not started at this P02 checkpoint (current P03: IN_PROGRESS; P04: NOT_STARTED). P00 remains 1.0.0-candidate; freeze and remote CI for latest source remain pending. Source is dirty with exact hashes recorded; no new commit/push or N1/N2 signatures claimed.

### Lịch sử lượt tiếp tục toàn Phase 01 — 10/10/2026

- **Đang làm**, nhánh `feature/backend-phase01-finish` từ `main` fast-forward `a466c6d`; hợp nhất hai commit Identity workflows/transport đã có ở `feature/backend-phase01-completion`, xử lý xung đột bằng cách giữ các phần logic/test bổ sung. Merge chưa commit khi chưa kiểm thử lại. Không push hoặc sửa dữ liệu/worktrees cũ, `.pi-logs/` và process Identity localhost có trước lượt này.
- Ba agent triển khai theo ownership: Catalog/Community, Trip/Ingestion và Intelligence; coordinator phụ trách Identity/platform/progress. Đọc và tận dụng có chọn lọc các draft trong worktrees cũ, không dùng draft thay bằng chứng nghiệm thu.
- Intelligence **Basic-first đã kiểm chứng**: `test-local.py` với pgvector/PostgreSQL16 disposable, migration V1–V4, **7 tests PASS** (4 DB/API/client/golden + 3 JWT/security). Kiểm filters/unknown price/currency/stable rating score/final hidden, client/server dedup, consent stale/revoke/deletion và projection versions độc lập. Pipeline ML đang triển khai tiếp; chưa đóng P01-IN.
- Identity đang bổ sung CLI replay một thao tác, giới hạn operator broker credential, scheduler-disable và giữ failed notification delivery qua retention. Live jar có trước bị Windows lock; runner thêm `--isolated-source` để clean build bản sao temporary, giữ process cũ. Kiểm thử lại transport và live image còn đang chạy; chưa ghi PASS cho thay đổi mới.
- **Gate P01 vẫn IN_PROGRESS**. Không đổi contract candidate/checksum hoặc tự ký owner/reviewer, không mở P02. Các task chỉ được tích sau khi đạt toàn bộ tiêu chí tương ứng và có kết quả kiểm thử.

**Lịch sử M1 ngày 10/10/2026**, nhánh `feature/backend-phase01`, revision nền `main` đã pull fast-forward; evidence local ngày 10/10/2026. Agent triển khai kỹ thuật theo yêu cầu bắt đầu P01, không thay chữ ký N1/N2 hoặc tự freeze candidate `1.0.0-candidate`. Các parent task bên dưới chưa tích vì còn seed/domain/runtime/adapter trong scope.

### P01 M1 — phần đã triển khai và kiểm chứng

- [x] M1.a: Năm Flyway V2 baseline thật + bốn bảng kỹ thuật/service; giữ V1 đã bàn giao, V3 grant runtime, Identity V4 seed ba role. Artifacts: `backend/services/*/src/main/resources/db/migration/`. Số bảng tổng: Identity 18, Catalog 28, Trip 11, Ingestion 10, Intelligence 14. Chưa đủ seed/options/test users/taxonomy/geo/itinerary theo task M1.
- [x] M1.b: Community V1 versioned migration: 16 collections, schema validators, indexes, checksum/drift check/exclusive lock; runtime revision guard + transaction manager snapshot/majority. Artifacts: `backend/services/community-service/**`, `backend/infra/mongo/`. Không dùng SQL/Flyway cho Community; ownership/reference/reorder vẫn thuộc domain code.
- [x] M1.c: Compose P01 riêng project/volumes/ports, PostgreSQL admin/migrator/runtime riêng, MongoDB auth/keyfile/custom runtime role; không chạm dữ liệu P00. Runtime bị chặn DDL/Flyway history/audit mutation và credential DB khác. Lệnh `python backend/infra/p01.py up`, `verify` PASS trên DB thật; PostgreSQL kiểm cả username nguồn và username đích với password nguồn.
- [x] M1.d: `./backend/mvnw -B -f backend/services/pom.xml clean verify`: BUILD SUCCESS, **21 tests**, 0 failures/errors/skips (18 JWT/security + 3 Community revision guard). Build clean xử lý resource migration cũ còn trong target, không xóa source.
- [x] M1.e: `python backend/infra/p01.py smoke`: **6/6** app chạy lần lượt với DB riêng + signed test JWKS, health UP, JWT đúng tới unknown route 404, sai audience/no JWT 401, error/correlation đúng. Identity/Community đã smoke lặp riêng; tất cả relational migration đã validate qua các lần rebuild/restart. Đã dừng toàn bộ P01 dependencies (giữ volumes), chỉ `up --service trip`, smoke/verify Trip PASS khi năm DB/app đối tác không chạy, rồi khởi động lại dependencies P01. Không phải domain API hoặc Identity issuer thật.
- [x] M1.f: `python backend/infra/p01.py verify`: **6/6** PASS. PostgreSQL runtime DML/transaction rollback/inbox unique, canonical email/consent default, PostGIS/rating/overnight hours, cross-trip composite FK/deferrable reorder, active source job/raw dedup, interaction dedup/training-source check. Community kiểm unique/schema/rating bounds/permissions và rollback review+rating+outbox+inbox trong transaction thật. Đây là storage tests, chưa chứng minh domain worker/dedup side effects.
- [x] M1.g: Build **6/6** Docker images `smarttravel-<service>:p01-m1-local` PASS. Chưa container app runtime/deploy/rollback probe.
- [x] M1.h: Thêm CI matrix độc lập từng service và shared-contract checks — `.github/workflows/p01-services.yml`; parse YAML PASS, image CI tag commit SHA + rollback image artifact. P00 workflow bỏ smoke service trên credential/volume cũ, giữ platform tests. **Chưa remote CI run**, dependency scan/domain provider/fault gates còn phải bổ sung.
- [x] M1.i: Runbook setup/secret/migration/rollback — `backend/infra/README.md`; local secret ngẫu nhiên `.env.local` đã ignore. App test/stub/issuer được dừng, DB P01/volumes giữ lại; không DROP/down -v.
- [x] M1.j: Contract **tracked artifacts** giữ nguyên checksum, 183 operations/23 messages PASS trên bản sao temporary chỉ từ `git ls-files backend/contracts`; checksum suite 3 tests PASS. Validator trực tiếp workspace **FAIL manifest** do bốn `text.txt` untracked đã có trước task (không sửa/xóa/refresh manifest của người dùng). Không ghi nhận workspace validator PASS.
- [ ] Review: chưa có reviewer con người ký; không gọi unit/security/storage tests là review N1/N2.

**Ghi chú lịch sử M1:** tại lượt này seed/domain/transport/Gateway/client còn thiếu; đã được triển khai và kiểm lại trong evidence hiện hành ngày 11/10 phía trên. Không mở P02 trước handoff 6/6.

### Identity — [yêu cầu chi tiết](../plan/phases/P01-services/identity.md)

- [x] P01-ID-01: Migration/roles/options và U1/U2/admin/business opt-in seed — V5 + `LocalIdentityFixtures`; DB/API tests thật. Identity hiện 20 bảng (14 domain + 4 technical baseline + 2 operational auth/mail), V1–V4 giữ checksum.
- [x] P01-ID-02: Issuer RS256/JWKS public-only, persistent key rotation, secret injection/guard, health/local Mailpit, image và CI source. Local pass; chưa remote CI hoặc reviewer ký.
- [x] P01-ID-03: Register/verify/login/logout/refresh/forgot/reset/change password; DB rate limit, hash tokens/password, atomic audit/outbox/mail queue và reuse revoke family.
- [x] P01-ID-04: Profile/password/sessions + preferences/options/consent/category HTTP validation + admin users/status/roles và internal batches triển khai; PostgreSQL/API tests, jar/image provider smoke PASS. Category invalidation/transport/provider đã kiểm chứng; ID-10 còn handoff con người.
- [x] P01-ID-05: Inbox/read/IN_APP + EMAIL opt-in/retry và deletion/tombstone/6-ack: DB/broker + live non-root SMTP/transport PASS ngày 11/10/2026.
- [x] P01-ID-06: Category HTTP/invalidation, atomic outbox/inbox/audit, confirms/retry/DLQ/replay/retention: 58 tests và live image PASS.
- [x] P01-ID-07: Provider đủ25 frozen operations, JWT/JWKS/batch/events và runtime guard: local PASS; chưa remote CI revision mới.
- [x] P01-ID-08: Canonical/duplicate email; single-use/expired account tokens; expired refresh idle/absolute session; concurrent refresh một thắng + commit reuse revocation; JWT issuer/audience/expiry/signature/key rotation.
- [x] P01-ID-09: Quyền/ownership/admin/workload, category timeout rollback, duplicate/stale notifications, missing ack và consent default/version: DB tests PASS.
- [x] P01-ID-10: Technical artifacts/image/migrations/contracts/tests/local-run available; user accepted P01 on 11 October 2026 in place of package signatures. N1/N2 signatures not claimed.


#### Identity auth/session — evidence local 10/10/2026

Nhánh `feature/identity-phase01`, nền `main` fast-forward `efc7871`; không sửa/xóa untracked của người dùng, không thay contract candidate/manifest.
Artifacts: `backend/services/identity-service/` (13/25 operation); `backend/infra/compose.p01.yaml` bổ sung Mailpit chỉ bind loopback; CI matrix Identity bổ sung DB tests/image provider smoke.

- `python backend/services/identity-service/test-local.py`: **19 tests PASS**, 0 failure/error/skip; **12** DB/API/domain + **7** unit/security. Container PostgreSQL16 mới do runner sở hữu, V1–V5 migrate thật, không dùng P00/P01 volumes; stop sau test.
- `python backend/services/identity-service/check-local.py`: jar health UP; register → SMTP Mailpit thật → verify → login → me/sessions → refresh → logout; sensitive me JWT cũ 401. JWKS/auth/profile/sessions/error responses + hai outbound event envelopes validate frozen schema PASS; public JWKS không có RSA private fields.
- `python backend/infra/p01.py smoke --service identity` và `verify --service identity`: PASS, **20 bảng**, runtime permissions/storage constraints/rollback. Legacy smoke dùng test issuer chỉ cho security probe, không giả login API.
- `docker build -t smarttravel-identity:p01-auth-local backend/services/identity-service`; `python backend/services/identity-service/check-local.py --image smarttravel-identity:p01-auth-local`: build + **non-root container** health/Flyway/SMTP/auth/provider PASS. Jar/image probe tự dừng, DB/Mailpit/synthetic records giữ lại.
- Secrets local signing/mail/fixture được generate một lần trong ignored `.local/`, không in ra log hoặc đưa vào image. U1 consent true là opt-in fixture; registration default false có DB test.
- Password PBKDF2/refresh+account token SHA-256, idempotency body HMAC; opaque session cursor, strong ETag. Reuse reject sau transaction commit; test concurrency kiểm một thắng và cả family revoke, không rollback theo 401.
- Maven không có DB env sẽ skip 12 DB tests; không ghi skip là PASS. SMTP sandbox mock trong DB tests kiểm bounded retries; live jar/image dùng SMTP sink thật. SMTP send có thể lặp nếu crash trước commit; chưa hứa exactly-once.
- `./backend/mvnw -B -f backend/services/pom.xml verify`: reactor **6/6 BUILD SUCCESS**; ordinary run skip 12 Identity DB tests theo env guard, không thay kết quả disposable DB 19/19 ở trên.
- CI YAML/Python syntax và `git diff --check` PASS; chưa remote CI. Auth provider smoke không thay coverage batch/preferences/notification/deletion, không tự ký N2 hoặc đóng gate.
- Hồi quy `python backend/infra/p01.py verify`: **5 PostgreSQL PASS**, Community bị chặn immutable migration checksum. Điều tra read-only: file Community checkout có 67 CRLF, hash `b5642d9e…`; hash sau LF-normalize `1830d58c…` khớp metadata đã lưu. Không có logical Git diff Community. Không repair checksum/reset/xóa volume; đây là lịch sử blocker trước khi sửa EOL ở mục Community bên dưới. Blocker hiện đã xử lý; không ghi ngược toàn bộ 6/6 storage suite PASS cho lượt Identity cũ.

**Còn thiếu:** P01-ID-05 notification/deletion; P01-ID-06 outbox transport/inbox/category invalidation/audit/idempotency toàn scope; P01-ID-07/09 provider/fault/security toàn scope; P01-ID-10 handoff đầy đủ/reviewer. Xem [Identity local-run/rotation/limits](../backend/services/identity-service/README.md). Chưa READY_FOR_INTEGRATION.

#### Identity preferences/admin/internal batches — evidence local 10/10/2026

Tiếp tục trên nhánh `feature/identity-phase01` có work dở dang; không checkout/pull/stash/reset, không sửa contracts candidate/manifest, không xóa `.pi-logs/`. Chưa commit/push lượt này.

- Artifacts: `backend/services/identity-service/src/main/java/vn/smarttravel/identity/preferences/`, `admin/`, `internal/`; dùng migration additive V6 đã có trong workspace (V1–V5 giữ nguyên). Tổng DB Identity hiện **22 bảng**; category/notification projection tables chuẩn bị cho consumers chưa triển khai.
- **21/25 operations**: preferences GET/PUT, public preference-options, admin users/status/roles, internal status/preferences batch đã bổ sung. Preferences version + consent + selections + audit + outbox + idempotency commit atomic; replay không phát event hai lần, consent_version server-owned. Admin recheck DB role/session, revoke tất cả session family khi status/role đổi; không revive account unverified/deleted/deleting.
- `python backend/services/identity-service/test-local.py`: **31/31 PASS**, 0 failures/errors/skips, **19** DB/API/domain + **12** unit/security/HTTP client tests trên PostgreSQL16 disposable riêng, V1–V6 migrate thật; runner tự stop container. Coverage bổ sung concurrent preference update một thắng, wrong option kind/unknown fields/coercion/money bounds, stale consent/ETag/idempotency, category timeout rollback, admin stale role/revocation, workload principal và items/missing_ids. Category HTTP tests dùng server loopback thật kiểm pagination/active/inactive/missing/malformed/503/repeated cursor/timeout; DB tests mock boundary để kiểm rollback.
- Frozen schema validation kiểm `preferences.changed` full envelope và status-changed admin event; internal batch response schemas PASS ở service-level. Workload HTTP token provisioning/issuer chưa nối thật, không gọi đây là cross-service integration.
- `python backend/services/identity-service/check-local.py`: jar + DB P01 + SMTP Mailpit thật **PASS**, auth/profile/preferences/options/session/JWKS responses, consent/idempotency/revocation và **3** event snapshots khớp candidate schemas. Build image `smarttravel-identity:p01-preferences-local` + `check-local.py --image ...`: non-root container/live provider **PASS**. Chỉ tạo synthetic records/mail, dừng đúng app/image probe; không reset/xóa volumes.
- `python backend/infra/p01.py verify --service identity` và `smoke --service identity`: **PASS**, 22 bảng + quyền runtime/storage rollback và standalone DB/JWKS/security. Không ghi đây là full 6-service storage suite.
- `bash backend/mvnw -B -f backend/services/pom.xml verify`: **6/6 BUILD SUCCESS**, ordinary run skip 19 Identity DB tests theo env guard; không thay evidence 31/31 disposable DB.
- `python backend/platform/test_service_layout.py`: **7 PASS**; `validate_contracts.py`: **183 operations/23 messages + manifest PASS**; `git diff --check` PASS. Không remote CI/reviewer ký lượt này.
- Catalog client cấu hình `CATALOG_BASE_URL`, không fixture fallback: inactive/missing 400, unavailable/timeout/malformed 503. Deadline tổng 5s, per-request 2s, max50 pages; validation chạy trong transaction owner lock nên timeout làm rollback mọi mutation. Category invalidation event và retention/dispatch/inbox vẫn chưa có.
- AMQP dependency dở dang giữ lại; broker health chỉ bật khi `IDENTITY_TRANSPORT_ENABLED=true`, mặc định false vì chưa triển khai transport worker. Không tuyên bố delivery/DLQ hoặc notification/deletion đã xong.
- **Gate vẫn IN_PROGRESS**: còn ID-05/06/07/09/10 và reviewer N2; không mở P02 hoặc tự xác nhận READY_FOR_INTEGRATION.
- Theo yêu cầu push GitHub, kiểm tra pre-push chạy lại **31/31 tests PASS**, 0 skip trên PostgreSQL disposable; service layout 7 PASS, frozen contracts/manifest PASS, diff whitespace PASS. Lần clean đầu bị Windows lock JAR do localhost đang chạy; đã dừng đúng process Identity do agent tạo, kiểm lại thành công và khởi động lại localhost. Không stage `.local/`, `.pi-logs/`, credential hoặc PID/log runtime; chỉ push nhánh làm việc, không main. Chưa có remote CI/reviewer evidence cho commit mới.

#### Sửa CI Pull Request #6 — 10/10/2026

- Logs GitHub Actions `38038783854`/`38038783866`: hai contract jobs thất bại do manifest thiếu bốn ghi chú `text.txt`; Identity DB runner lỗi POSIX `PermissionError` vì `backend/mvnw` có mode `100644`.
- Manifest đã review và bổ sung **chỉ bốn** file ghi chú; toàn bộ checksum có trước, OpenAPI/event schema/fixture/registry và revision candidate giữ nguyên. Không bỏ validator hoặc refresh checksum tự động trong CI.
- Runner dùng `bash mvnw` trên POSIX, `mvnw.cmd` trên Windows. Regression `backend/platform/test_identity_runner.py` chạy **3/3 PASS trên Linux container** (wrapper mode0644, đường dẫn có dấu cách); Windows 2 PASS/1 POSIX-only skip. CI shared-contract job đã thêm regression.
- `validate_contracts.py`: **183 operations/23 messages + manifest PASS**; checksum 3, layout 7, policy 7, HTTP stub 3 và event harness 2 tests PASS.
- `python backend/services/identity-service/test-local.py`: **19/19 PASS**, 0 failures/errors/skips trên PostgreSQL disposable; container test tự dừng. `git diff --check` PASS.
- Revision `55fdc66`: CI remote `38039502691`/`38039502694` đã PASS contracts/verify/frontend và năm service; Identity DB tests đã vượt qua, nhưng bước image smoke lộ lỗi Linux `host.docker.internal:56434` connection refused (DB bind loopback). Không ghi nhận lần chạy này 9/9 PASS.
- Image probe sửa sang Compose DNS `identity-db:5432` + `identity-mail:1025`, tự phát hiện network từ container DB, không mở rộng host port bindings. Regression image config/network **4/4 PASS**; build `smarttravel-identity:pr6-ci-local` và live non-root image + DB/SMTP/JWKS/auth/provider/events **PASS**. Credentials/signing/mail local cũ được tái dùng qua file ignored, không sửa/reset volumes hoặc fixture password.
- Fix thực hiện trong worktree riêng để giữ nguyên phần Identity workflows đang triển khai ở checkout chính. Revision `e1d1ddd`: **GitHub Actions 9/9 PASS**, P01 run [38039822779](https://github.com/24521914-ux/SmartTravel_VN/actions/runs/38039822779) và P00 run [38039822801](https://github.com/24521914-ux/SmartTravel_VN/actions/runs/38039822801). PR [#6](https://github.com/24521914-ux/SmartTravel_VN/pull/6) `CLEAN`/`MERGEABLE`, chưa tự merge. Đây là CI auth/baseline, không đóng gate Identity P01 hoặc thay reviewer ký.

#### Refactor cấu trúc sáu service — 10/10/2026

Theo yêu cầu người dùng: **service → chức năng → tầng**, giữ nhánh hiện tại để không làm mất Identity work chưa commit.

- Identity tách `auth/controller|dto|service|repository`, `profile/controller|dto|service|repository`; JWT/JWKS/current principal về `security`, mail/fixture/technical persistence về `infrastructure`, exception/error/correlation/header helpers về `shared`.
- SQL chuyển vào repository; transaction ở feature service, rate-limit vẫn REQUIRES_NEW; row-lock order và refresh reuse commit-before-401 giữ nguyên. Mỗi top-level class/record một file, không tạo folder rỗng cho nghiệp vụ chưa triển khai.
- Năm service còn lại chuyển SecurityConfiguration sang `security/config`, error/filter sang `shared/web`; Community MongoStorageConfiguration sang `infrastructure/persistence/config`. Bootstrap giữ package gốc để component scan không đổi.
- Main/test packages/imports cập nhật; scaffold sinh layout mới, security template sync chỉ export review proposals (không blind-overwrite P01 Identity security).
- `./backend/mvnw -B -f backend/services/pom.xml clean verify`: **6/6 BUILD SUCCESS**; ordinary run có 12 DB tests skip theo env guard.
- `python backend/services/identity-service/test-local.py`: **19/19 PASS**, gồm 12 PostgreSQL/API integration và 7 unit/security, 0 failure/error/skip sau refactor.
- `python backend/platform/test_service_layout.py`: **6 tests PASS** — package/path, root bootstrap, one type/file, layer database boundary, scaffold/export safety. CI source đã thêm suite này, chưa remote CI evidence.
- Live jar và non-root image `smarttravel-identity:p01-layout-local`: auth/SMTP/provider/event schemas PASS. Legacy runtime smoke Identity/Catalog/Trip/Ingestion/Intelligence **5/5 PASS**. Community build/unit PASS; lúc refactor chưa kiểm lại live runtime do checksum CRLF/LF blocker. Sau đó đã xử lý và kiểm runtime Community PASS tại mục EOL bên dưới, không sửa nội dung migration/metadata.
- Không đổi route/request/response/claims hoặc migration/database; chưa mở thêm nghiệp vụ hoặc đóng gate. Quy ước chi tiết: [services README](../backend/services/README.md).

#### Bổ sung P01 notification/deletion — evidence local 10/10/2026

- Nhánh `feature/backend-phase01-completion` từ `main` fast-forward `0744167`; cherry-pick commit Identity `7737cb4` thành `759b769` để giữ preferences/admin/batches chưa có trên main. Không push hoặc tự merge, giữ `.pi-logs/` và process localhost/volumes đang có.
- [x] Bổ sung 4 route còn lại: list/read notification, create deletion và internal deletion status. Identity hiện **25/25 routes có implementation**; không suy ra provider/fault/transport coverage đầy đủ từ route count.
- [x] `notifications/`: signed cursor/cutoff/owner, read idempotency + version/ETag; consumer ba event Catalog claim/Community review/Trip với frozen schemas + envelope/payload consistency + title allowlist. Inbox/stream watermark/IN_APP delivery atomic; duplicate/stale/missing/inactive recipient và rollback kiểm trên DB thật. Chưa EMAIL delivery/transport.
- [x] `deletion/`: policy validation, revoke mọi session, purge local notification/account mail/tokens/selections, consent false + account tombstone + ba outbox events commit atomic. Sáu ack gồm Identity local; missing/FAILED ack không complete; version per service, duplicate/concurrency/rollback, recovery và terminal completion. Internal status workload-only; revoked requesting session chỉ replay response đã lưu đúng key, không tạo mutation mới.
- [x] Flyway additive **V7** thêm ack source_version; V1–V6 không sửa checksum. Event schemas đóng gói từ artifacts candidate vào JAR qua Maven resources; không đổi contract/manifest. Chưa transport producer authorization hoặc remote ack thật.
- [x] `python backend/services/identity-service/test-local.py` trên bản sao source temporary: **40/40 PASS**, 0 failure/error/skip (**28 DB/API/domain + 12 unit/security/client**), PostgreSQL16 disposable V1–V7. Test trực tiếp checkout ban đầu FAIL vì JAR bị process đang chạy khóa; không dừng process người dùng, kiểm trên bản sao không target/credentials. Container test tự stop, bản sao tự cleanup.
- [x] `mvnw -B -f backend/services/pom.xml verify` trên cùng bản sao: **6/6 BUILD SUCCESS**; ordinary reactor skip 28 DB tests Identity theo env guard, không thay kết quả 40/40 disposable DB.
- [x] `docker build -t smarttravel-identity:p01-workflows-local <temporary>/backend/services/identity-service`: PASS, dùng JAR mới chứa schemas/V7. **Chưa live image/provider smoke mới**, app localhost hiện vẫn JAR cũ.
- [x] `python backend/platform/validate_contracts.py`: **183 operations/23 messages + manifest PASS**; `test_service_layout.py`: **7 PASS**; `git diff --check` PASS.
- Candidate Community review sample có aggregate_id khác payload.review_id: consumer consistency test ban đầu RED; test instance đã align ID, giữ frozen artifact nguyên vẹn. Cần owner review semantic fixture trước handoff; schema validation một mình không phát hiện invariant này.
- **P01 vẫn IN_PROGRESS**: Identity còn EMAIL/retry/category invalidation/outbox transport/DLQ/retention/full provider-security-fault/handoff; Catalog/Community/Trip/Ingestion/Intelligence còn phần domain như checklist. Chưa đạt 6/6 READY_FOR_INTEGRATION; không đóng P01 hoặc mở P02, không giả chữ ký reviewer.

#### Tiếp tục toàn P01 — checkpoint kỹ thuật 10/10/2026

Đây **không phải bàn giao hoàn tất**. Nhánh coordinator `feature/backend-phase01-completion`; commit notification/deletion `00182de` đã lưu. ClaudeKit/Claude CLI không có trong môi trường; sáu Pi agents được giao worktree riêng. Năm agent dừng với lỗi **`Codex error: The usage limit has been reached`**; không mô tả chúng vẫn chạy nền hoặc hoàn thành.

- [x] Identity bổ sung EMAIL notification worker (opt-in, 5 attempts/backoff, inactive recipient fail closed), category invalidation/inbox/version/full snapshot/audit và serialization với category selections.
- [x] Identity RabbitMQ dispatcher persistent publish + confirms + mandatory returns + bounded retry; listener routing/schema/30-day retention-safe window + inbox transaction dedup + retry3/DLQ metric. Local broker ACL chặn runtime giả producer đối tác. Replay publish-confirm-before-ack giữ ID/audit; crash-after-publish rollback được kiểm thật. Local capture queue chỉ tạo trong test/local profiles.
- [x] Identity JSON logs, request-body256KiB/chunked guard, DB acquisition timeout, DB-only readiness/liveness isolation, runtime retention; Catalog production guard không nhận local HTTP stub/credential-bearing origin.
- [x] `test-local.py --transport` trên bản sao temporary source: **52/52 PASS**, 0 failures/errors/skips (**32 DB/API/domain + 5 DB/broker fault + 15 unit/security/client**), PostgreSQL16/RabbitMQ4.1 disposable với credentials/ports riêng. Chạy lại sau giới hạn capture production vẫn 52/52 PASS; runners tự cleanup đúng containers. HTTP provider test gọi và validate đủ **25 frozen operations**.
- [x] Image `smarttravel-identity:p01-transport-local` build PASS từ JAR vừa verify. Chưa live non-root image smoke transport mới hoặc reviewer ký. Contract validator 183/23/manifest PASS; layout7 PASS; runner Windows2 PASS/1 POSIX-only skip; diff whitespace PASS.
- [ ] Catalog worktree `../SmartTravel_VN_P01_catalog`, branch `feature/catalog-phase01-completion`: domain draft và V4 chưa commit, coordinator verify **5 tests PASS**, gồm2 PostGIS repository tests. Chưa full API/provider/fault gate; chưa đưa draft vào nhánh coordinator.
- [ ] Community worktree `../SmartTravel_VN_P01_community`, branch `feature/community-phase01-completion`: commit `ec46125` domain draft; coordinator verify **7 baseline tests PASS**, agent image build PASS. Không có domain MongoDB/runtime/frozen provider evidence, chưa review/integrate hoặc gọi READY.
- [ ] Trip worktree `../SmartTravel_VN_P01_trip`, branch `feature/trip-phase01-completion`: adapters/domain/V4 draft chưa commit; coordinator verify **3 baseline security tests PASS**, không có DB/domain evidence.
- [ ] Ingestion worktree `../SmartTravel_VN_P01_ingestion`, branch `feature/ingestion-phase01-completion`: domain draft chưa commit; coordinator verify **5 tests PASS**, gồm2 PostgreSQL domain tests. Chưa full pipeline/provider/fault gate.
- [ ] Intelligence worktree `../SmartTravel_VN_P01_intelligence`, branch `feature/intelligence-phase01-completion`: Basic/admin/event draft chưa commit; coordinator verify **3 baseline security tests PASS**, chưa chứng minh Basic/ML pipeline.
- [ ] Platform worktree `../SmartTravel_VN_P01_platform`, branch `feature/platform-phase01-completion`: gateway/frontend/client/CI/Compose overlay draft chưa commit, chưa coordinator verify.
- Các worktree/branch được giữ nguyên, không reset/stash/xóa draft, không push. Agent allocation/logs/state nằm trong `.git/p01-agents/` (local-only, không commit). Không đóng parent tasks hoặc P01 gate bằng code draft/build baseline. **P01 IN_PROGRESS**, chưa bàn giao.

### Catalog — [yêu cầu chi tiết](../plan/phases/P01-services/catalog.md)

- [x] P01-CA-01: PostgreSQL/PostGIS, migration, seed và index.
- [x] P01-CA-02: Security và local runtime.
- [x] P01-CA-03: Geo/taxonomy và vòng đời Place.
- [x] P01-CA-04: Search/filter/cursor/distance/rating.
- [x] P01-CA-05: Opening hours/price/media/claim evidence.
- [x] P01-CA-06: Offerings/schedules và các loại địa điểm.
- [x] P01-CA-07: Business/member/verification/claim/change requests.
- [x] P01-CA-08: Rating/import/contribution handlers và transaction.
- [x] P01-CA-09: Publish events, source policy và snapshot/reconciliation.
- [x] P01-CA-10: Test geo/search/time/price và business permissions.
- [x] P01-CA-11: Test concurrency/dedup/protected fields/version/visibility.
- [x] P01-CA-12: Bàn giao artifact, EXPLAIN, test report và hướng dẫn.
  - [x] Technical artifacts: source/image/migrations/contracts/test reports/local-run/runbook.
  - [x] User accepted P01 on 11 October 2026; package signatures replaced by approval, no N1/N2 signatures claimed.

### Community — [yêu cầu chi tiết](../plan/phases/P01-services/community.md)

#### Sửa blocker checksum CRLF/LF — 10/10/2026

- [x] `backend/.gitattributes` giữ LF cho Community migration `.js`; chỉ khôi phục CRLF → LF sau khi kiểm bản LF **trùng từng byte với HEAD**. Không đổi logic V1, không đổi `core.autocrlf` toàn máy, không normalize/bỏ qua raw checksum trong migrator hoặc startup guard.
- [x] Java regression `immutableMigrationResourceRetainsCanonicalLfChecksum`: chạy **RED** trên resource CRLF (1 failure như dự kiến), rồi **GREEN** sau chuẩn hóa. Pin checksum immutable V1 `1830d58c5c42a83ac2de46824c9964aa161f94117e32eb02d7b95ab35fd30e1f`; resource trong JAR mới khớp cùng checksum.
- [x] `./backend/mvnw -B -f backend/services/community-service/pom.xml clean verify`: **7 tests PASS**, 0 failure/error/skip, BUILD SUCCESS.
- [x] `python backend/platform/test_service_layout.py`: **7 tests PASS**, thêm Git checkout filter với `core.autocrlf=true` vẫn giữ nguyên canonical LF. CI path filters bổ sung `backend/.gitattributes`; mới có source, chưa remote CI.
- [x] `python backend/infra/p01.py verify --service community`: checksum + 16 collections/validators/indexes, permissions/unique/rating/schema/transaction rollback PASS. `smoke --service community` chạy **hai lần PASS**, app health UP, real JWT/JWKS/auth/error; không cần reset dữ liệu.
- [x] `python backend/infra/p01.py verify`: hồi quy storage **6/6 PASS**, blocker đã đóng. Read-only snapshot trước/sau kiểm revision `_id/checksum/applied_at` và document count của 16 collections không đổi (fingerprint `1a618269…8494`). Các storage fixture chạy transaction rồi abort/rollback; không sửa metadata/checksum hoặc xóa volumes.
- [x] Build image `smarttravel-community:p01-eol-local` PASS, dùng JAR đã clean build với canonical LF. Chỉ ghi image build; runtime đã kiểm bằng app jar, không tuyên bố container deployment/rollback gate.
- Runbook: `backend/infra/README.md`, `backend/services/community-service/README.md`. Git status không có logical diff migration V1; app/test processes đã dừng, dependencies/volumes giữ nguyên. Không mở thêm Community domain API hoặc đóng gate P01-CO.

- [x] P01-CO-01: MongoDB versioned collections/index/schema validation migration, seed và visibility projection.
- [x] P01-CO-02: App/security/local runtime và harness.
- [x] P01-CO-03: Review/media/report/moderation/audit.
- [x] P01-CO-04: Rating summary/concurrency/reconciliation và favorite.
- [x] P01-CO-05: Collection/privacy/reorder/enrichment.
- [x] P01-CO-06: Contribution và quy trình apply/result.
- [x] P01-CO-07: Catalog client và policy khi không xác minh được place.
- [x] P01-CO-08: Events/commands/consumers và outbox/inbox.
- [x] P01-CO-09: Test rating lifecycle/concurrency/dedup.
- [x] P01-CO-10: Test cross-user/privacy/UGC/ack/conflict.
- [x] P01-CO-11: Bàn giao artifact, test report và runbook.
  - [x] Technical artifacts: source/image/migrations/contracts/test reports/local-run/runbook.
  - [x] User accepted P01 on 11 October 2026; package signatures replaced by approval, no N1/N2 signatures claimed.

### Trip — [yêu cầu chi tiết](../plan/phases/P01-services/trip.md)

- [x] P01-TR-01: Migration, composite FK và seed.
- [x] P01-TR-02: App/security/local runtime và stubs.
- [x] P01-TR-03: Trip/segment/day CRUD, ownership/date/timezone/version.
- [x] P01-TR-04: Items/snapshot/reorder/locked/cost/budget.
- [x] P01-TR-05: Transfer/routes/cache/fallback và refresh snapshot.
- [x] P01-TR-06: Recommendation attribution và visibility handling.
- [x] P01-TR-07: Catalog/routing adapters và events/consumers.
- [x] P01-TR-08: Version/outbox/inbox/audit/privacy/idempotency.
- [x] P01-TR-09: Test cross-trip/date/reorder concurrency.
- [x] P01-TR-10: Test dependency outage/timeout/locked/currency/ownership.
- [x] P01-TR-11: Bàn giao artifact, test report và provider config.
  - [x] Technical artifacts: source/image/migrations/contracts/test reports/local-run/runbook.
  - [x] User accepted P01 on 11 October 2026; package signatures replaced by approval, no N1/N2 signatures claimed.

### Ingestion — [yêu cầu chi tiết](../plan/phases/P01-services/ingestion.md)

- [x] P01-IG-01: Migration, uniqueness, source registry và fixtures.
- [x] P01-IG-02: App/workers/security/local runtime và secret references.
- [x] P01-IG-03: Registry/license/policy/jobs/source locking.
- [x] P01-IG-04: Fetch/cursor/limits/hash/normalize/quarantine.
- [x] P01-IG-05: Match/candidate/manual review và threshold fixtures.
- [x] P01-IG-06: Import command/retry/dedup/counters/checkpoint.
- [x] P01-IG-07: Publish commands/policy và xử lý Catalog results.
- [x] P01-IG-08: HTTP client/broker harness và provider policy APIs.
- [x] P01-IG-09: Test replay/dedup/accounting/missing ack.
- [x] P01-IG-10: Test PARTIAL/retry/revocation/protected-field conflict.
- [x] P01-IG-11: Bàn giao artifact, test report và replay runbook.
  - [x] Technical artifacts: source/image/migrations/contracts/test reports/local-run/runbook.
  - [x] User accepted P01 on 11 October 2026; package signatures replaced by approval, no N1/N2 signatures claimed.

### Intelligence — [yêu cầu chi tiết](../plan/phases/P01-services/intelligence.md)

- [x] P01-IN-01: Migration, lineage và baseline/ML tables.
- [x] P01-IN-02: App/workers/security/local runtime/stubs/storage.
- [x] P01-IN-03: Interaction/history/dedup/retention/consent.
- [x] P01-IN-04: Feature projections, Basic scoring/filter/fallback.
- [x] P01-IN-05: Dataset builder/version/checksum/schema/license/consent.
- [x] P01-IN-06: Training/model validation/activation/rollback/inference.
- [x] P01-IN-07: Revocation/deletion impact và quality gate.
- [x] P01-IN-08: Clients/event handlers/outbox/inbox/deletion ack.
- [x] P01-IN-09: Recommendation contract tests và schema/revocation handling.
- [x] P01-IN-10: Golden scoring/filter/cold-start/consent/visibility tests.
- [x] P01-IN-11: Test dataset/checksum/concurrency/fallback/reproducibility.
- [x] P01-IN-12: Bàn giao artifact, pipeline/test report và runbook.
  - [x] Technical artifacts: source/image/migrations/contracts/test reports/local-run/runbook.
  - [x] User accepted P01 on 11 October 2026; package signatures replaced by approval, no N1/N2 signatures claimed.

- [x] **Gate P01:** 6/6 READY_FOR_INTEGRATION accepted by the user on 11 October 2026; no N1/N2 signatures claimed.


## P02 — Kết nối thật

P01 **ACCEPTED_BY_USER** on 11 October 2026. P02 **COMPLETE**, six services **CONNECTED**: final real core/fault/privacy/transport, Gateway client/browser, manifest and monitor PASS. P03/P04 not started at this P02 checkpoint (current P03: IN_PROGRESS; P04: NOT_STARTED). P00 remains 1.0.0-candidate; freeze and remote CI for latest source remain pending. Source is dirty with exact hashes recorded; no new commit/push or N1/N2 signatures claimed. Branch `feature/backend-phase02-integration`. [Runbook](../backend/infra/P02_README.md).

- [x] P02-00: Đối chiếu revision/contract/migration/test của sáu gói.
- [x] P02-01: Môi trường integration với DB riêng, broker/storage/secrets/observability.
- [x] P02-02: Auth và Gateway.
- [x] P02-03: Catalog reads cho các service.
- [x] P02-04: Community ↔ Catalog.
- [x] P02-05: Ingestion ↔ Catalog.
- [x] P02-06: Intelligence inputs.
- [x] P02-07: Recommendation ↔ Trip.
- [x] P02-08: Notification và deletion/ack.
- [x] P02-09: Real Gateway client/browser smoke PASS; Mailpit and synthetic licensed source sandbox, routing fallback and media provider limits recorded in runbook.
- [x] P02-10: Gateway routing/cache/auth/trace/service credentials.
- [x] P02-11: Bootstrap snapshot/watermark/delta/dedup.
- [x] P02-12: Transport outbox/inbox/retry/DLQ/replay và fault tests.
- [x] P02-13: No stubs between the six services; persisted issuer, real workload credentials and transport; no p01_fixture/capture. External sandbox/fallback coverage recorded explicitly.
- [x] P02-14: Kiểm schema evolution và xử lý mismatch đúng owner.
- [x] **Gate P02:** 6/6 CONNECTED, không còn stub liên service, core flows/frontend smoke có evidence.


### P02 evidence checkpoint - 11 October 2026

- [x] `python backend/infra/p02.py smoke`: real HTTP/broker core flows PASS, frozen response validation, SMTP verification/notification and all six deletion acknowledgements. Correlation IDs/assertions are in ignored `backend/infra/.local/p02/smoke-report.json`.
- [x] `npm --prefix frontend run test:gateway` and `npm --prefix frontend run test:browser`: PASS through the real Gateway and `/app`, without inter-service stubs.
- [x] Runbook/config/CI source: `p02.py`, topic matrix, `P02_AUTH.md`, real frontend UI, `p02-integration.yml`. Secrets/keys/generated configuration and reports stay ignored; P00/P01 volumes retained.
- [x] `python backend/infra/p02_faults.py`: connected contribution/duplicate/stale/restart, concurrent snapshot/delta and pending deletion with missing Trip acknowledgement PASS.
- [x] `python backend/infra/p02_privacy_test.py`: latest consent/source revocation and privacy regression PASS; Identity61, Intelligence38 and Trip41 full transport regressions, Gateway14 and frontend7/build PASS.
- [x] Final Catalog27 full transport tests and rebuilt image PASS; `python backend/infra/p02_transport_test.py` PASS exit0, scoped confirmed replay preserves original policy/version, audit count increases and DLQ drains.

**Journal:** real integration needs per-destination Gateway token exchange and live session validation for revocation. Bootstrap preserves source versions and deduplicates snapshot/live deltas. The source sandbox requires a synthetic DNG bounding box for spatial matching; it is not a real administrative boundary. Production provider coverage, dataset/model quality, load and restore remain P03 work.

### Final P02 gate evidence

- [x] Final-image core and fault reruns PASS. Snapshot/delta helper retries the explicit `400 SNAPSHOT_WATERMARK_CHANGED` response; unrelated HTTP errors remain failures.
- [x] Latest full independent transport suites: Identity61, Catalog27, Trip41, Intelligence38 PASS with no skips; Gateway14, frontend7/build, frozen183/23/checksum PASS. Community27/Ingestion38 remain their last recorded P01 full-suite results; no fresh six-suite aggregate count is claimed.
- [x] `python backend/infra/p02.py manifest`: running image IDs match verified image tags for six services and Gateway; exact source/image/JAR hashes and dirty Git state recorded accurately.
- [x] `python backend/infra/p02.py monitor`: seven apps ready; all six inboxes have one consumer; pending/unacknowledged service-inbox messages and DLQ counts zero; `alarms=[]`.
- [x] Six services CONNECTED: Identity, Catalog, Community, Trip, Ingestion, Intelligence. Core/fault/privacy/transport/client/browser evidence complete; P02 COMPLETE. P03/P04 not started at this P02 checkpoint (current P03: IN_PROGRESS; P04: NOT_STARTED); P00 candidate freeze and remote CI pending, no new commit/push or N1/N2 signatures claimed.

**Final journal:** Catalog replay now terminates the application context/process explicitly so the operator command returns exit0 after audit and confirmed publish. Audit assertions compare before/after counts. Root `.gitignore` precisely ignores existing `.local/` and `.pi-logs/`; existing logs, credentials, worktrees and volumes were preserved. No destructive cleanup or contract/migration checksum rewrite was used to close the gate.


Final additional P02-05 acceptance: temporarily withhold the Catalog import acknowledgement after its DB commit, redeliver the original Ingestion command, verify unchanged place count/version, restore ACL and await job SUCCEEDED. PASS exit0: Catalog DB commit while outbound acknowledgement publishing is denied leaves the job pending; redelivery of the original command preserves inbox count1, place count and version. Restoring ACL in finally allows durable ack retry and job SUCCEEDED. P02-05 and final gate are complete. Earlier test results above remain valid.

- [x] `python backend/infra/p02_import_ack_test.py`: actual missing-import-ack recovery PASS exit0 on final images; ignored import-ack report and CI evidence accompany the existing core/fault/privacy/transport reports.

- [x] Final monitor rerun after missing-import-ack recovery PASS: seven ready apps, six inboxes each consumer1/ready0/unacked0, DLQ0 and `alarms=[]`. Final review/static compilation/diff checks PASS.


Monitor scope note: zero backlog applies to the six service inboxes and their DLQs. The bounded `platform.audit` sink intentionally retains 288 audit messages without a consumer; it is not claimed empty. Actual monitor status field is `alarms=[]`.

## P03 — Kiểm thử hệ thống

Trạng thái: **IN_PROGRESS**, full gate **NO_GO**; đã có frozen-contract/security/read-load probes và offline quality/gate tooling, chưa đủ system E2E/full load/application DR/real ML quality evidence. Nguồn: [checklist P03](../plan/phases/P03-system-verification.md), [runbook](../backend/infra/P03_README.md).

- [ ] P03-01: Contract compatibility giữa producer/consumer/frontend.
- [ ] P03-02: E2E core flows và business/import/ML.
- [ ] P03-03: Outage/crash/retry/dedup/DLQ/reconciliation.
- [ ] P03-04: Authorization/security/upload/rate limit/secret và PII.
- [ ] P03-05: Load/EXPLAIN/index/pool/timeout/backpressure.
- [ ] P03-06: Backup/restore/rebuild/retention/deletion/revocation.
- [x] P03-07: Frontend responsive/accessibility/loading/error/async state.
- [ ] P03-08: Release evidence/findings/dashboards/runbook/owner vận hành.
- [ ] P03-09: Dữ liệu thực hợp lệ và ML holdout evaluation.
- [ ] P03-10: So model với Basic; giữ Basic nếu quality gate chưa đạt.
- [ ] P03-11: Ghi provider coverage và SYSTEM_VERIFIED theo evidence.
- [ ] **Gate P03:** core E2E/restore đạt, không còn critical/high về quyền hoặc mất dữ liệu, đủ evidence và quyết định release.

## P04 — Phát hành

Trạng thái: **NOT_STARTED**, phụ thuộc P03 SYSTEM_VERIFIED; chưa release/deploy production. Nguồn: [checklist P04](../plan/phases/P04-migration-release.md).

- [ ] P04-01: Chọn triển khai mới hoặc chuyển dữ liệu.
- [ ] P04-02: Nếu migration: backfill/mapping/quarantine/checksum/delta một writer.
- [ ] P04-03: Rehearsal staging và quyết định go/no-go.
- [ ] P04-04: Freeze/drain/watermark/switch writer và traffic theo nhánh áp dụng.
- [ ] P04-05: Rollback/reverse-sync/forward-fix xử lý write mới.
- [ ] P04-06: Stability window/DLQ/quarantine/decommission/archive.
- [ ] P04-07: Bàn giao deployment/cost/metrics/backup/access/backlog.
- [ ] **Gate P04:** smoke và operational gates đạt, rollback được diễn tập, bàn giao RELEASED.

Task không áp dụng phải ghi `N/A` kèm lý do và quyết định scope, không tự tích hoàn thành.


## P03 evidence update - 11 October 2026

Current status: **IN_PROGRESS / NO_GO**; P04 **NOT_STARTED**, dependent on SYSTEM_VERIFIED. Earlier P02 checkpoint statements retain their historical scope. P03-07 complete in measured browser scope; other full P03/P04 tasks and phase gates remain pending. Runbook: [P03_README](../backend/infra/P03_README.md).

- Local tooling: 45 P03 tests pass; release gate requires explicit matching release_id on every report, fresh aware timestamps, current source hashes and reviewed operations linkage. Missing identity/evidence returns NO_GO. Remote P03 tooling CI has not run.
- Frozen validator: 183 HTTP operations/23 event examples and exact canonical manifest pass. Security: 504 negative guest/malformed/USER/BUSINESS admin/internal checks pass; 22 anonymous operations skipped, full_role_matrix_pass=false.
- Read load: 600 requests, zero errors, about19.972rps, p95 157.983ms, 50 virtual users/peak4 inflight. Optional full-mix snapshot: 600 requests/30.103s, zero errors/dropped slots, 19.932rps, 50 virtual users but ONE authenticated fixture, peak5 inflight. Class p95 catalog167.016ms/Basic476.551ms/trip78.329ms/write65.654ms. Original fixture display name restored in finally; recommendation request records persist.
- Read-only dataset diagnostic snapshot: places20/users13/reviews11/trips12/interactions6; required deficits9980/1987/19989/988/49994. Actual unfiltered Catalog page query EXPLAIN ANALYZE BUFFERS execution10.492ms/planning0.873ms on small dataset. Full P00 load gate remains false; no bulk seed or claim of realistic-user contention.
- Fresh P02 core/fault evidence remains scoped, not F01?F11 certification. Covers contribution/dedup/visibility/crash-after-commit/snapshot-delta/missing-Trip-ack; monitor sevenready/six service inbox consumer1 ready0unacked0DLQ0/alarms[], separate audit sink321 retained.
- Outstanding: complete role/BOLA/upload/rate-limit security, all E2E/compatibility/reconciliation, full scale/mix/distinct-user load and hot-query/pool/backpressure, application DR/projection-watermark recovery, real licensed data/holdout quality, complete frontend/provider scope and reviewed operational owners/release linkage. Storage restore and browser results are tracked separately by exercise scope; these probes do not establish SYSTEM_VERIFIED.

Private evidence stays under ignored backend/infra/.local/p03. No new commit/push, production deployment or model activation is claimed.

Browser checkpoint: frontend53 checks PASS, zero failures/gaps; 36 responsive cases cover user map, business and admin review at320/390/768/1280. Real OSM response200 and MapLibre zoom; verification/claim pending, moderation, import QUEUED with refresh, labels/keyboard focus/loading/error/empty states observed. P03-07 complete for this measured scope/basic accessibility; no broad WCAG certification claimed. Evidence release_id p03-local-20261011-a466c6d, timestamp2026-10-11T11:19:38.038Z, five current source hashes. Frontend build37 modules and contracts7 checks PASS. Full P03 gate remains NO_GO.

Subsequent concurrent probe checkpoint: mixed load overlapping isolated restore measured600 requests with3 Basic errors (Basic120 requests), 19.8969rps. Class p95 Catalog218.593ms/Basic679.993ms/Trip99.270ms/write92.942ms. Older600/zero-error snapshots above remain historical; they precede this concurrent run; the final sequential candidate snapshot is recorded below. HTTP error codes were not captured in that older report and cause is unresolved. Sequential rerun and final restore evidence are recorded below; do not infer a release pass.

Final isolated storage checkpoint: restore-report.json PASS exit0, release p03-local-20261011-a466c6d, UTC2026-10-11T11:26:51.630878+00:00. Restore125.301558s, checkpoint age678.592985s; source hashes unchanged during run. Six DB row/document counts, Mongo options/indexes and full PostgreSQL schema against same-engine archive-only reference MATCH. Fifteen backup artifacts pass integrity validation;17 restore safety tests PASS. Six object volumes each contain0 files: nonempty object recovery remains unverified. All exercise-owned containers/volumes removed; original seven apps ready. Application DR, Mongo auth roles/topology, PostgreSQL ownership/ACL, encryption/offsite backup and production RPO/RTO remain unverified; P03-06 remains unchecked.

Final sequential candidate checkpoint:45 P03 tooling unit tests PASS and independent review APPROVE for scoped local tooling, no high/critical findings in that review scope. Frozen contracts183 HTTP operations/23 messages PASS; security504 checks PASS (full role matrix still incomplete). Final isolated mixed run600/600 HTTP200 over30.1706s,19.8869rps, zero errors/dropped slots, aggregate p95472.484ms/max591.568ms, peak6 inflight,50 virtual users sharing ONE principal. Class counts/p95: Catalog300/178.435ms, Basic120/554.207ms, Trip90/81.913ms, writes90/62.305ms. Fixture profile recovered. Source hashes match current candidate; previous3-Basic-error report retained in private raw archive with concurrency context, cause unproven. Local mixed latency passes; frozen dataset/distinct-principal load acceptance remains false. P03 remains IN_PROGRESS / NO_GO; P04 NOT_STARTED.

Final gate/monitor checkpoint: actual release gate NO_GO, p04_authorized=false and release_linkage_review_required=true; operations review and full acceptance criteria remain missing. Seven original applications ready; all six service inboxes consumer1/ready0/unacked0/DLQ0, alarms empty. Audit sink retained383 messages intentionally; earlier321 is historical. Final local manifest verification PASS exit0: source/image/JAR/running image exact match for all seven packages; Git dirty state preserved accurately. This does not authorize production release. Backups remain ignored and no exercise-owned restore containers remain.
