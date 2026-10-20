# Lịch sử evidence P01 đến 10/10/2026

Nội dung bên dưới được chuyển **nguyên văn** từ `progress/PHASE_TASK_CHECKLIST.md` ngày 20/10/2026 để checklist chính gọn hơn. Đây là evidence lịch sử, không phải trạng thái hiện hành. Trạng thái hiện hành xem [PHASE_TASK_CHECKLIST.md](../PHASE_TASK_CHECKLIST.md). Các link tương đối cũ dạng `../plan/...` và `../backend/...` nay cần thêm một cấp `../`.

## P01 M1 storage/runtime

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


## Identity: mục task và evidence ngày 10/10/2026


- [x] P01-ID-01: Migration/roles/options và U1/U2/admin/business opt-in seed — V5 + `LocalIdentityFixtures`; DB/API tests thật. Identity hiện 20 bảng (14 domain + 4 technical baseline + 2 operational auth/mail), V1–V4 giữ checksum.
- [x] P01-ID-02: Issuer RS256/JWKS public-only, persistent key rotation, secret injection/guard, health/local Mailpit, image và CI source. Local pass; chưa remote CI hoặc reviewer ký.
- [x] P01-ID-03: Register/verify/login/logout/refresh/forgot/reset/change password; DB rate limit, hash tokens/password, atomic audit/outbox/mail queue và reuse revoke family.
- [x] P01-ID-04: Profile/password/sessions + preferences/options/consent/category HTTP validation + admin users/status/roles và internal batches triển khai; PostgreSQL/API tests, jar/image provider smoke PASS. Category invalidation/transport và full-scope gate vẫn thuộc ID-06/07/09/10 còn mở.
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

**Còn thiếu:** P01-ID-05 notification/deletion; P01-ID-06 outbox transport/inbox/category invalidation/audit/idempotency toàn scope; P01-ID-07/09 provider/fault/security toàn scope; P01-ID-10 handoff đầy đủ/reviewer. Xem [Identity local-run/rotation/limits](../../backend/services/identity-service/README.md). Chưa READY_FOR_INTEGRATION.

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
- Không đổi route/request/response/claims hoặc migration/database; chưa mở thêm nghiệp vụ hoặc đóng gate. Quy ước chi tiết: [services README](../../backend/services/README.md).


## Community: sửa blocker checksum CRLF/LF ngày 10/10/2026


- [x] `backend/.gitattributes` giữ LF cho Community migration `.js`; chỉ khôi phục CRLF → LF sau khi kiểm bản LF **trùng từng byte với HEAD**. Không đổi logic V1, không đổi `core.autocrlf` toàn máy, không normalize/bỏ qua raw checksum trong migrator hoặc startup guard.
- [x] Java regression `immutableMigrationResourceRetainsCanonicalLfChecksum`: chạy **RED** trên resource CRLF (1 failure như dự kiến), rồi **GREEN** sau chuẩn hóa. Pin checksum immutable V1 `1830d58c5c42a83ac2de46824c9964aa161f94117e32eb02d7b95ab35fd30e1f`; resource trong JAR mới khớp cùng checksum.
- [x] `./backend/mvnw -B -f backend/services/community-service/pom.xml clean verify`: **7 tests PASS**, 0 failure/error/skip, BUILD SUCCESS.
- [x] `python backend/platform/test_service_layout.py`: **7 tests PASS**, thêm Git checkout filter với `core.autocrlf=true` vẫn giữ nguyên canonical LF. CI path filters bổ sung `backend/.gitattributes`; mới có source, chưa remote CI.
- [x] `python backend/infra/p01.py verify --service community`: checksum + 16 collections/validators/indexes, permissions/unique/rating/schema/transaction rollback PASS. `smoke --service community` chạy **hai lần PASS**, app health UP, real JWT/JWKS/auth/error; không cần reset dữ liệu.
- [x] `python backend/infra/p01.py verify`: hồi quy storage **6/6 PASS**, blocker đã đóng. Read-only snapshot trước/sau kiểm revision `_id/checksum/applied_at` và document count của 16 collections không đổi (fingerprint `1a618269…8494`). Các storage fixture chạy transaction rồi abort/rollback; không sửa metadata/checksum hoặc xóa volumes.
- [x] Build image `smarttravel-community:p01-eol-local` PASS, dùng JAR đã clean build với canonical LF. Chỉ ghi image build; runtime đã kiểm bằng app jar, không tuyên bố container deployment/rollback gate.
- Runbook: `backend/infra/README.md`, `backend/services/community-service/README.md`. Git status không có logical diff migration V1; app/test processes đã dừng, dependencies/volumes giữ nguyên. Không mở thêm Community domain API hoặc đóng gate P01-CO.
