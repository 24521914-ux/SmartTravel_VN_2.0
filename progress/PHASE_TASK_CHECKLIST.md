# Checklist tiến độ các phase

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

### Identity — [yêu cầu chi tiết](../plan/phases/P01-services/identity.md)

- [ ] P01-ID-01: Migration, seed và dữ liệu kiểm thử.
- [ ] P01-ID-02: App/security/JWT/JWKS/key rotation và local runtime.
- [ ] P01-ID-03: Register/verify/login/logout/refresh/password và rate limit.
- [ ] P01-ID-04: Profile/preferences/consent/admin và quản lý session.
- [ ] P01-ID-05: Notification và quy trình deletion/ack.
- [ ] P01-ID-06: Category client, events, outbox/inbox và audit.
- [ ] P01-ID-07: Contract/provider tests và bảo vệ cấu hình test.
- [ ] P01-ID-08: Test token/email/refresh đồng thời/JWT.
- [ ] P01-ID-09: Test phân quyền, timeout, duplicate và consent.
- [ ] P01-ID-10: Bàn giao artifact, test report và runbook.

### Catalog — [yêu cầu chi tiết](../plan/phases/P01-services/catalog.md)

- [ ] P01-CA-01: PostgreSQL/PostGIS, migration, seed và index.
- [ ] P01-CA-02: Security và local runtime.
- [ ] P01-CA-03: Geo/taxonomy và vòng đời Place.
- [ ] P01-CA-04: Search/filter/cursor/distance/rating.
- [ ] P01-CA-05: Opening hours/price/media/claim evidence.
- [ ] P01-CA-06: Offerings/schedules và các loại địa điểm.
- [ ] P01-CA-07: Business/member/verification/claim/change requests.
- [ ] P01-CA-08: Rating/import/contribution handlers và transaction.
- [ ] P01-CA-09: Publish events, source policy và snapshot/reconciliation.
- [ ] P01-CA-10: Test geo/search/time/price và business permissions.
- [ ] P01-CA-11: Test concurrency/dedup/protected fields/version/visibility.
- [ ] P01-CA-12: Bàn giao artifact, EXPLAIN, test report và hướng dẫn.

### Community — [yêu cầu chi tiết](../plan/phases/P01-services/community.md)

- [ ] P01-CO-01: MongoDB versioned collections/index/schema validation migration, seed và visibility projection.
- [ ] P01-CO-02: App/security/local runtime và harness.
- [ ] P01-CO-03: Review/media/report/moderation/audit.
- [ ] P01-CO-04: Rating summary/concurrency/reconciliation và favorite.
- [ ] P01-CO-05: Collection/privacy/reorder/enrichment.
- [ ] P01-CO-06: Contribution và quy trình apply/result.
- [ ] P01-CO-07: Catalog client và policy khi không xác minh được place.
- [ ] P01-CO-08: Events/commands/consumers và outbox/inbox.
- [ ] P01-CO-09: Test rating lifecycle/concurrency/dedup.
- [ ] P01-CO-10: Test cross-user/privacy/UGC/ack/conflict.
- [ ] P01-CO-11: Bàn giao artifact, test report và runbook.

### Trip — [yêu cầu chi tiết](../plan/phases/P01-services/trip.md)

- [ ] P01-TR-01: Migration, composite FK và seed.
- [ ] P01-TR-02: App/security/local runtime và stubs.
- [ ] P01-TR-03: Trip/segment/day CRUD, ownership/date/timezone/version.
- [ ] P01-TR-04: Items/snapshot/reorder/locked/cost/budget.
- [ ] P01-TR-05: Transfer/routes/cache/fallback và refresh snapshot.
- [ ] P01-TR-06: Recommendation attribution và visibility handling.
- [ ] P01-TR-07: Catalog/routing adapters và events/consumers.
- [ ] P01-TR-08: Version/outbox/inbox/audit/privacy/idempotency.
- [ ] P01-TR-09: Test cross-trip/date/reorder concurrency.
- [ ] P01-TR-10: Test dependency outage/timeout/locked/currency/ownership.
- [ ] P01-TR-11: Bàn giao artifact, test report và provider config.

### Ingestion — [yêu cầu chi tiết](../plan/phases/P01-services/ingestion.md)

- [ ] P01-IG-01: Migration, uniqueness, source registry và fixtures.
- [ ] P01-IG-02: App/workers/security/local runtime và secret references.
- [ ] P01-IG-03: Registry/license/policy/jobs/source locking.
- [ ] P01-IG-04: Fetch/cursor/limits/hash/normalize/quarantine.
- [ ] P01-IG-05: Match/candidate/manual review và threshold fixtures.
- [ ] P01-IG-06: Import command/retry/dedup/counters/checkpoint.
- [ ] P01-IG-07: Publish commands/policy và xử lý Catalog results.
- [ ] P01-IG-08: HTTP client/broker harness và provider policy APIs.
- [ ] P01-IG-09: Test replay/dedup/accounting/missing ack.
- [ ] P01-IG-10: Test PARTIAL/retry/revocation/protected-field conflict.
- [ ] P01-IG-11: Bàn giao artifact, test report và replay runbook.

### Intelligence — [yêu cầu chi tiết](../plan/phases/P01-services/intelligence.md)

- [ ] P01-IN-01: Migration, lineage và baseline/ML tables.
- [ ] P01-IN-02: App/workers/security/local runtime/stubs/storage.
- [ ] P01-IN-03: Interaction/history/dedup/retention/consent.
- [ ] P01-IN-04: Feature projections, Basic scoring/filter/fallback.
- [ ] P01-IN-05: Dataset builder/version/checksum/schema/license/consent.
- [ ] P01-IN-06: Training/model validation/activation/rollback/inference.
- [ ] P01-IN-07: Revocation/deletion impact và quality gate.
- [ ] P01-IN-08: Clients/event handlers/outbox/inbox/deletion ack.
- [ ] P01-IN-09: Recommendation contract tests và schema/revocation handling.
- [ ] P01-IN-10: Golden scoring/filter/cold-start/consent/visibility tests.
- [ ] P01-IN-11: Test dataset/checksum/concurrency/fallback/reproducibility.
- [ ] P01-IN-12: Bàn giao artifact, pipeline/test report và runbook.

- [ ] **Gate P01:** 6/6 service READY_FOR_INTEGRATION, có test evidence và owner/reviewer xác nhận.

## P02 — Kết nối thật

Nguồn: [checklist P02](../plan/phases/P02-service-integration.md).

- [ ] P02-00: Đối chiếu revision/contract/migration/test của sáu gói.
- [ ] P02-01: Môi trường integration với DB riêng, broker/storage/secrets/observability.
- [ ] P02-02: Auth và Gateway.
- [ ] P02-03: Catalog reads cho các service.
- [ ] P02-04: Community ↔ Catalog.
- [ ] P02-05: Ingestion ↔ Catalog.
- [ ] P02-06: Intelligence inputs.
- [ ] P02-07: Recommendation ↔ Trip.
- [ ] P02-08: Notification và deletion/ack.
- [ ] P02-09: Frontend/provider.
- [ ] P02-10: Gateway routing/cache/auth/trace/service credentials.
- [ ] P02-11: Bootstrap snapshot/watermark/delta/dedup.
- [ ] P02-12: Transport outbox/inbox/retry/DLQ/replay và fault tests.
- [ ] P02-13: Loại cấu hình stub/test khỏi integration; ghi provider sandbox/blocked.
- [ ] P02-14: Kiểm schema evolution và xử lý mismatch đúng owner.
- [ ] **Gate P02:** 6/6 CONNECTED, không còn stub liên service, core flows/frontend smoke có evidence.

## P03 — Kiểm thử hệ thống

Nguồn: [checklist P03](../plan/phases/P03-system-verification.md).

- [ ] P03-01: Contract compatibility giữa producer/consumer/frontend.
- [ ] P03-02: E2E core flows và business/import/ML.
- [ ] P03-03: Outage/crash/retry/dedup/DLQ/reconciliation.
- [ ] P03-04: Authorization/security/upload/rate limit/secret và PII.
- [ ] P03-05: Load/EXPLAIN/index/pool/timeout/backpressure.
- [ ] P03-06: Backup/restore/rebuild/retention/deletion/revocation.
- [ ] P03-07: Frontend responsive/accessibility/loading/error/async state.
- [ ] P03-08: Release evidence/findings/dashboards/runbook/owner vận hành.
- [ ] P03-09: Dữ liệu thực hợp lệ và ML holdout evaluation.
- [ ] P03-10: So model với Basic; giữ Basic nếu quality gate chưa đạt.
- [ ] P03-11: Ghi provider coverage và SYSTEM_VERIFIED theo evidence.
- [ ] **Gate P03:** core E2E/restore đạt, không còn critical/high về quyền hoặc mất dữ liệu, đủ evidence và quyết định release.

## P04 — Phát hành

Nguồn: [checklist P04](../plan/phases/P04-migration-release.md).

- [ ] P04-01: Chọn triển khai mới hoặc chuyển dữ liệu.
- [ ] P04-02: Nếu migration: backfill/mapping/quarantine/checksum/delta một writer.
- [ ] P04-03: Rehearsal staging và quyết định go/no-go.
- [ ] P04-04: Freeze/drain/watermark/switch writer và traffic theo nhánh áp dụng.
- [ ] P04-05: Rollback/reverse-sync/forward-fix xử lý write mới.
- [ ] P04-06: Stability window/DLQ/quarantine/decommission/archive.
- [ ] P04-07: Bàn giao deployment/cost/metrics/backup/access/backlog.
- [ ] **Gate P04:** smoke và operational gates đạt, rollback được diễn tập, bàn giao RELEASED.

Task không áp dụng phải ghi `N/A` kèm lý do và quyết định scope, không tự tích hoàn thành.
