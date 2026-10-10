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

**Đang làm M1**, nhánh `feature/backend-phase01`, revision nền `main` đã pull fast-forward; evidence local ngày 10/10/2026. Agent triển khai kỹ thuật theo yêu cầu bắt đầu P01, không thay chữ ký N1/N2 hoặc tự freeze candidate `1.0.0-candidate`. Các parent task bên dưới chưa tích vì còn seed/domain/runtime/adapter trong scope.

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

**Tiếp theo:** hoàn thiện seed/local dependencies/auth issuer của M1, rồi API/rules/security M2; transport/clients/contracts/fault M3 và gate M4 của cả sáu. Broker/object storage/Redis use cases/gateway/frontend client chưa triển khai ở lượt này. Chưa có service READY_FOR_INTEGRATION; chưa mở P02.

### Identity — [yêu cầu chi tiết](../plan/phases/P01-services/identity.md)

- [x] P01-ID-01: Migration/roles/options và U1/U2/admin/business opt-in seed — V5 + `LocalIdentityFixtures`; DB/API tests thật. Identity hiện 20 bảng (14 domain + 4 technical baseline + 2 operational auth/mail), V1–V4 giữ checksum.
- [x] P01-ID-02: Issuer RS256/JWKS public-only, persistent key rotation, secret injection/guard, health/local Mailpit, image và CI source. Local pass; chưa remote CI hoặc reviewer ký.
- [x] P01-ID-03: Register/verify/login/logout/refresh/forgot/reset/change password; DB rate limit, hash tokens/password, atomic audit/outbox/mail queue và reuse revoke family.
- [ ] P01-ID-04: **Đang làm** — profile ETag, password/session owner/revocation/cursor đã có; còn preferences/consent/category/options và admin APIs.
- [ ] P01-ID-05: Notification và quy trình deletion/ack.
- [ ] P01-ID-06: Category client, events, outbox/inbox và audit.
- [ ] P01-ID-07: Contract/provider tests và bảo vệ cấu hình test.
- [x] P01-ID-08: Canonical/duplicate email; single-use/expired account tokens; expired refresh idle/absolute session; concurrent refresh một thắng + commit reuse revocation; JWT issuer/audience/expiry/signature/key rotation.
- [ ] P01-ID-09: Test phân quyền, timeout, duplicate và consent.
- [ ] P01-ID-10: Có auth image/runtime/test/rotation runbook; chưa bàn giao đủ Identity scope hoặc N2 review.

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

**Còn thiếu:** P01-ID-04 preferences/options/category/consent/admin/internal batches; P01-ID-05 notification/deletion; P01-ID-06 outbox transport/inbox/category client/audit/idempotency toàn scope; P01-ID-07/09 provider/fault/security toàn scope; P01-ID-10 handoff đầy đủ/reviewer. Xem [Identity local-run/rotation/limits](../backend/services/identity-service/README.md). Chưa READY_FOR_INTEGRATION.

#### Sửa CI Pull Request #6 — 10/10/2026

- Logs GitHub Actions `38038783854`/`38038783866`: hai contract jobs thất bại do manifest thiếu bốn ghi chú `text.txt`; Identity DB runner lỗi POSIX `PermissionError` vì `backend/mvnw` có mode `100644`.
- Manifest đã review và bổ sung **chỉ bốn** file ghi chú; toàn bộ checksum có trước, OpenAPI/event schema/fixture/registry và revision candidate giữ nguyên. Không bỏ validator hoặc refresh checksum tự động trong CI.
- Runner dùng `bash mvnw` trên POSIX, `mvnw.cmd` trên Windows. Regression `backend/platform/test_identity_runner.py` chạy **3/3 PASS trên Linux container** (wrapper mode0644, đường dẫn có dấu cách); Windows 2 PASS/1 POSIX-only skip. CI shared-contract job đã thêm regression.
- `validate_contracts.py`: **183 operations/23 messages + manifest PASS**; checksum 3, layout 7, policy 7, HTTP stub 3 và event harness 2 tests PASS.
- `python backend/services/identity-service/test-local.py`: **19/19 PASS**, 0 failures/errors/skips trên PostgreSQL disposable; container test tự dừng. `git diff --check` PASS.
- Revision `55fdc66`: CI remote `38039502691`/`38039502694` đã PASS contracts/verify/frontend và năm service; Identity DB tests đã vượt qua, nhưng bước image smoke lộ lỗi Linux `host.docker.internal:56434` connection refused (DB bind loopback). Không ghi nhận lần chạy này 9/9 PASS.
- Image probe sửa sang Compose DNS `identity-db:5432` + `identity-mail:1025`, tự phát hiện network từ container DB, không mở rộng host port bindings. Regression image config/network **4/4 PASS**; build `smarttravel-identity:pr6-ci-local` và live non-root image + DB/SMTP/JWKS/auth/provider/events **PASS**. Credentials/signing/mail local cũ được tái dùng qua file ignored, không sửa/reset volumes hoặc fixture password.
- Fix thực hiện trong worktree riêng để giữ nguyên phần Identity workflows đang triển khai ở checkout chính. **Chờ CI remote của revision network sửa**, không coi local pass là remote pass hoặc đóng gate Identity P01.

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

#### Sửa blocker checksum CRLF/LF — 10/10/2026

- [x] `backend/.gitattributes` giữ LF cho Community migration `.js`; chỉ khôi phục CRLF → LF sau khi kiểm bản LF **trùng từng byte với HEAD**. Không đổi logic V1, không đổi `core.autocrlf` toàn máy, không normalize/bỏ qua raw checksum trong migrator hoặc startup guard.
- [x] Java regression `immutableMigrationResourceRetainsCanonicalLfChecksum`: chạy **RED** trên resource CRLF (1 failure như dự kiến), rồi **GREEN** sau chuẩn hóa. Pin checksum immutable V1 `1830d58c5c42a83ac2de46824c9964aa161f94117e32eb02d7b95ab35fd30e1f`; resource trong JAR mới khớp cùng checksum.
- [x] `./backend/mvnw -B -f backend/services/community-service/pom.xml clean verify`: **7 tests PASS**, 0 failure/error/skip, BUILD SUCCESS.
- [x] `python backend/platform/test_service_layout.py`: **7 tests PASS**, thêm Git checkout filter với `core.autocrlf=true` vẫn giữ nguyên canonical LF. CI path filters bổ sung `backend/.gitattributes`; mới có source, chưa remote CI.
- [x] `python backend/infra/p01.py verify --service community`: checksum + 16 collections/validators/indexes, permissions/unique/rating/schema/transaction rollback PASS. `smoke --service community` chạy **hai lần PASS**, app health UP, real JWT/JWKS/auth/error; không cần reset dữ liệu.
- [x] `python backend/infra/p01.py verify`: hồi quy storage **6/6 PASS**, blocker đã đóng. Read-only snapshot trước/sau kiểm revision `_id/checksum/applied_at` và document count của 16 collections không đổi (fingerprint `1a618269…8494`). Các storage fixture chạy transaction rồi abort/rollback; không sửa metadata/checksum hoặc xóa volumes.
- [x] Build image `smarttravel-community:p01-eol-local` PASS, dùng JAR đã clean build với canonical LF. Chỉ ghi image build; runtime đã kiểm bằng app jar, không tuyên bố container deployment/rollback gate.
- Runbook: `backend/infra/README.md`, `backend/services/community-service/README.md`. Git status không có logical diff migration V1; app/test processes đã dừng, dependencies/volumes giữ nguyên. Không mở thêm Community domain API hoặc đóng gate P01-CO.

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
