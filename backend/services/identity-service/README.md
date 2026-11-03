# Identity — P01 independent service

Owner N1; reviewer N2. **Kiểm chứng kỹ thuật local hoàn tất; chờ review và xác nhận bàn giao N2**.
Tiến độ/evidence chung: [checklist](../../../progress_be.md).
Contract candidate giữ nguyên: [OpenAPI](../../contracts/openapi/identity.yaml), revision `1.0.0-candidate`.

## Cấu trúc source

Áp dụng [service → chức năng → tầng](../README.md): `auth/`, `profile/`, `preferences/`, `admin/`, `internal/` tách controller/dto/service/repository theo nhu cầu; `preferences/client/` là HTTP adapter Catalog;
`security/` chứa JWT/JWKS/current principal; `infrastructure/` chứa mail/persistence/fixture;
`shared/` chứa exception và web helpers. SQL chỉ nằm trong repository, mỗi top-level type/file riêng.
API, claims, schema và transaction semantics giữ nguyên sau refactor.

## Đã triển khai

25/25 operation: auth/profile/password/sessions/JWKS, GET/PUT preferences, public options,
admin users/status/roles, internal batches, notification list/read và deletion request/status.
Không trả token verify/reset trong API.
- PostgreSQL thật, Flyway V1–V7, runtime/migrator riêng. 22 bảng: 14 domain + 4 baseline technical + 2 auth/mail operational + 2 workflow projections. V1–V6 giữ checksum; V7 thêm ack version.
- Register atomic user/USER/preferences/verify-token/mail-job/outbox/audit; consent mặc định false. Duplicate email trả cùng cấu trúc 202; idempotency 24h, khác body 409. Request hash dùng HMAC để không làm giảm độ an toàn password hashing.
- PBKDF2 SHA-256 Spring Security v5.8 defaults (salt 16 bytes, 310.000 iterations); refresh/account token random 256 bit, chỉ lưu SHA-256 hash.
- RS256, issuer/audience/exp/iat/sub validation. Access 600s, session absolute 30 ngày, mỗi refresh idle 7 ngày, reset 30 phút, verify 24 giờ. JWT có UUID sub/jti/sid, roles và scopes. User issuer không cấp internal workload scopes.
- Refresh khóa theo thứ tự user → session → token; consume + token con trong một transaction. Reuse commit revoke family **trước** 401. Hai refresh đồng thời chỉ một thành công; reuse từ request còn lại cũng revoke token mới.
- Logout, reset, change password và revoke session chặn ngay các API me nhờ kiểm DB session/status; fail closed khi không đọc được DB. Consumer JWT offline còn chấp nhận đến TTL + clock skew validator (mặc định 60s), tối đa khoảng 11 phút. Không hứa logout revoke tức thời JWT offline.
- Strong ETag/If-Match cho profile: thiếu 428, malformed 400, stale 409. Sessions cursor opaque, default20/max100, lọc owner tại DB.
- Durable account/client rate limits: 10 attempts/account/action/minute, 60/client/action/minute; retry-after 60s. Không tin X-Forwarded-For do client tự gửi. Cấu hình trusted proxy trước triển khai.
- Mail queue AES-256-GCM, poll5s, SELECT FOR UPDATE SKIP LOCKED, bounded exponential retry tối đa 8 lần. Không gửi token expired/consumed/superseded; không ghi log provider error chứa PII/credential. SMTP có thể gửi lặp nếu crash sau send trước commit; không tuyên bố exactly-once.
- Outbox full envelope `user.registered`, `user.status-changed` (verify/admin status), `preferences.changed` full snapshot và deletion-requested; broker confirms/retry như runbook bên dưới. Audit không chứa email/password/token.
- Preferences PUT partial theo frozen contract: absent giữ nguyên, explicit null chỉ cho budget bounds; CUSTOM cần cả min/max, VND, tối đa 100 ID mỗi danh sách; duplicate/wrong-kind/inactive option bị 400. Strong ETag/If-Match + Idempotency-Key bắt buộc; replay 24h không phát lại event. Server quản lý consent_version, chỉ tăng khi opt-in/out thay đổi; client cung cấp version cũ để chống stale consent.
- Category validation gọi public Catalog `/api/v1/categories?limit=100` qua HTTP, theo cursor, kiểm active cho toàn bộ selection; inactive/missing 400, timeout/malformed/outage 503 và rollback toàn bộ. Không có fallback fixture trong runtime. Cấu hình `CATALOG_BASE_URL` tới stub P00 trong local/test hoặc Catalog thật khi integration; bỏ trống vẫn dùng preferences không category, nhưng category mới fail closed. Deadline tổng 5s, mỗi request tối đa 2s, tối đa 50 pages. Category invalidation handler dùng frozen event/inbox/version như mô tả bên dưới.
- Admin recheck role ADMIN + live session ở DB, không chỉ tin claim; lock actor/target theo UUID trước session. Status/roles cập nhật version/audit atomic và revoke mọi session family; không tự sửa quyền/status, không revive unverified/deleted/deleting account. Role change không có event type riêng trong candidate; tác vụ nhạy cảm dùng trạng thái hiện hành.
- Internal batches yêu cầu workload `client_id`, không `sid`, và route scope tương ứng; giới hạn 1–100 unique IDs. Read-only repeatable-read trả items/missing_ids tường minh; preference của account không ACTIVE vào missing_ids, không lộ tombstone preferences. User issuer không cấp workload token.
- Workload token: `POST /internal/v1/security/workload-token` (OAuth 2.0 client-credentials, form `grant_type=client_credentials&audience=<service>&scope=<tùy chọn>`, client xác thực HTTP Basic). Danh sách client và scope được cấp nằm trong code `WorkloadClients`; secret từng client đặt qua `<CLIENT>_WORKLOAD_SECRET` (≥32 ký tự, để trống thì tắt client). Token 600 giây, `aud` một service, không `sid`, `roles=[SERVICE]`. Service gọi lấy token bằng `WorkloadTokens` (`WORKLOAD_TOKEN_URI`, `WORKLOAD_CLIENT_ID`, `WORKLOAD_CLIENT_SECRET`), cache và gia hạn trước hạn 60 giây; property token tĩnh cũ vẫn được ưu tiên cho test. Gateway không expose `/internal`.

## Chạy local độc lập

Java21, Docker, Python và dependencies validation:

```bash
python -m pip install -r backend/platform/requirements-validation.txt
./backend/mvnw -B -f backend/services/identity-service/pom.xml clean verify
python backend/infra/p01.py up --service identity
python backend/services/identity-service/run-local.py --fixtures
```

Chỉ cần DB Identity + Mailpit, không cần app/DB năm đối tác. API `http://localhost:8101`,
JWKS `/.well-known/jwks.json`, Mailpit UI `http://localhost:58025` (SMTP51025).
`--fixtures` là opt-in: U1/U2/admin/business đúng UUID chung, địa chỉ
`fixture-u1@example.invalid`, `fixture-u2@example.invalid`, `fixture-admin@example.invalid`,
`fixture-business@example.invalid`. Password ngẫu nhiên nằm trong `.local/config.json`
(cùng field `fixture_password`), **không in ra log**. U1 consent true là fixture opt-in; user đăng ký mới vẫn false.

Runner tạo lần đầu `.local/keys.json` (private JWK) và `.local/config.json` (mail key/password),
ignore Git và Docker context. Giữ file để token/mail pending không mất hiệu lực khi restart;
không upload/commit cả thư mục. Trên Windows cần ACL riêng cho thư mục nếu máy có nhiều user.
Seed không reset/re-enable/reassign account đã tồn tại. Nếu password fixture không còn phù hợp,
không xóa/reset DB của người khác: dùng password hiện hành hoặc DB test disposable.
Local/test profile không được kết hợp prod/production; default profile yêu cầu signing keys/mail key được inject.

Ví dụ registration (password trong ví dụ chỉ là synthetic, không dùng production):

```http
POST /api/v1/auth/register
Content-Type: application/json
Idempotency-Key: local-demo-1

{"email":"demo@example.invalid","password":"synthetic-password-123","display_name":"Demo"}
```

202 trả `request_id/status/version`; mở Mailpit lấy token rồi POST verify-email.
Login trả `access_token/refresh_token/token_type/expires_in`. Gửi bearer khi gọi me/logout.
Unknown fields (kể cả roles/user_id) bị 400; error JSON không chứa body/secret.

## Kiểm thử và image

```bash
# 31 tests, gồm 19 DB/API/domain cases trên container PostgreSQL disposable riêng
python backend/services/identity-service/test-local.py
# App jar + DB P01 + SMTP thật; validate response/event bằng schema candidate
python backend/services/identity-service/check-local.py
python backend/infra/p01.py smoke --service identity
python backend/infra/p01.py verify --service identity
# Non-root image chạy lại auth/mail/provider smoke
docker build -t smarttravel-identity:p01-auth-local backend/services/identity-service
python backend/services/identity-service/check-local.py --image smarttravel-identity:p01-auth-local
```

`test-local.py` tự stop container test, không gắn P00/P01 volumes. Maven thường chạy 12 unit/security/client
tests và **skip 28 DB tests** khi chưa inject `IDENTITY_DB_TESTS=true`; không coi skip là DB PASS.
Live smoke tạo synthetic account/audit/mail trong DB/Mailpit P01 và dừng đúng process/container của mình.
CI source chạy DB tests + live image smoke; chưa có evidence GitHub Actions remote.

## Signing key rotation/revoke và config thật

- Inject `IDENTITY_KEYS_FILE` là JSON JWKSet có private RSA active (>=2048 bit) và public keys cũ;
  `IDENTITY_ACTIVE_KID` chọn key ký. JWKS chỉ trả public n/e/kid/kty/use/alg.
- Overlap: rollout verification JWKS có public key mới trước; sau đó đổi active kid trên issuer.
  Giữ public key cũ ít nhất access TTL + skew + cache60s (>=12 phút từ lần ký cuối), rồi bỏ key cũ.
  Phải phối hợp rollout để mọi instance cùng JWKS set; không đổi kid nhưng giữ key khác.
- Revoke family bằng logout/revoke session; reset/change password revoke tất cả family user.
  Emergency compromised key: dừng ký, thay key, bỏ public key bị compromise và phối hợp flush decoder caches;
  không đảm bảo token offline bị revoke ngay chỉ bằng thay DB session. Không phục hồi token đã revoke.
- Inject `JWT_ISSUER` theo domain thật, `JWT_JWKS_URI` tới JWKS issuer, `JWT_AUDIENCE=identity`;
  `IDENTITY_MAIL_KEY` base64 đúng 32 bytes, giữ ổn định qua restart và idempotency TTL.
  Rotate mail encryption key cần drain/migrate queue có key version trước (chưa có tự động key-ring).
- DB_URL/DB_USER/DB_PASSWORD chỉ Identity runtime; DB_MIGRATION_USER/PASSWORD riêng.
  Có thể migrate bằng job rồi set DB_MIGRATION_ENABLED=false để app không giữ migrator credentials.
- SMTP: MAIL_HOST/PORT/USERNAME/PASSWORD, MAIL_AUTH=true, MAIL_TLS_REQUIRED=true với provider thật,
  IDENTITY_MAIL_FROM được provider xác minh. Không bật fixture hoặc mount `.local` lên production.
- Mail retry hết hạn ghi failed_at; vận hành kiểm backlog bằng count pending/failed trên DB (không xuất ciphertext/token).
  Requeue failed job chỉ sau kiểm token còn valid; expired token cần phát mới, không gia hạn token cũ.
- Rollback dùng image tương thích V7; không chạy Flyway down/drop, không rollback session revocation.
  Image M1 cũ không có auth nghiệp vụ nên không phải rollback functional auth hợp lệ.

## Notification và deletion handlers P01

- Notification GET/list + PATCH/read kiểm current session/owner, cursor có chữ ký/cutoff,
  idempotency và version/ETag. `NotificationConsumer.accept(JsonNode)` kiểm ba frozen schemas:
  Catalog claim reviewed, Community review changed, Trip changed; title allowlist và object UUID,
  không sao chép arbitrary text/profile. Inbox + stream watermark + notification + IN_APP delivery
  commit cùng transaction; duplicate/stale events không lặp side effect. Missing/inactive recipients bỏ qua.
- Deletion POST kiểm `policy_version` (mặc định 1), khóa user, revoke mọi session,
  xóa account mail/tokens/notifications/selections, reset consent và tombstone account trong cùng transaction.
  Phát ba event preferences/status/deletion-requested; giữ audit và lịch sử auth đã revoke theo policy baseline.
  Request có sáu ack, Identity complete local; request chưa complete cho tới đủ năm ack đối tác.
- Replay POST cùng key chỉ trả response đã lưu cho JWT còn hợp lệ của session yêu cầu;
  session revoked không được tạo mutation mới. JWT hết hạn vẫn 401.
- `DeletionAckConsumer.accept(JsonNode)` kiểm schema/producer-service/aggregate, transaction inbox,
  version mỗi service, duplicate/stale/FAILED/recovery. Completion terminal; unknown request bị reject
  để caller retry/DLQ, không lưu inbox thành công giả. Internal status chỉ nhận workload principal + scope.
  Frozen HTTP enum không có FAILED nên HTTP trả PENDING; kiểm DB state/error_summary khi vận hành.
- Handler dùng chung giữa harness local và broker listener bên dưới.
  Không đưa handler ra public HTTP. Producer authorization do broker ACL đảm nhiệm.
  Thay đổi code không tự cập nhật JAR/app localhost đang chạy.
- Kiểm chứng: 40 tests (28 DB/API/domain + 12 unit/security/client) PASS trên PostgreSQL disposable,
  V1–V7; đây là evidence lịch sử trước transport. Evidence hiện hành ở mục gate bên dưới.

## Transport, email và category invalidation

`python backend/services/identity-service/test-local.py --transport` tạo PostgreSQL16 và RabbitMQ4.1
riêng, random credential/port, không dùng volume P01. Test run 10/10/2026: **52 tests PASS, 0 skip**,
gồm 32 DB/API/domain, 5 DB+broker fault tests và 15 unit/security/client tests.
Provider suite gọi HTTP thật và validate response schemas của **25/25 frozen operations**.

- `IDENTITY_NOTIFICATION_EMAIL_ENABLED=true` bật notification EMAIL worker; mặc định opt-out.
  Queue EMAIL cùng transaction IN_APP; max5 attempts, backoff 1/2/4/8 phút, FAILED giữ evidence.
  Khóa user trước delivery chống race với deletion. SMTP send trước commit là at-least-once khi crash;
  không hứa exactly-once mail. Duplicate event không tạo thêm delivery.
- Category invalidation kiểm frozen schema, inbox/version và advisory selection lock trước user lock.
  Inactive category bị xóa khỏi selections, tăng preferences version + full snapshot outbox + system audit.
  Stale event không đảo trạng thái; reactivation không tự khôi phục lựa chọn đã xóa.
- `IDENTITY_TRANSPORT_ENABLED=true` bật listener/dispatcher; inject BROKER_HOST/PORT/USERNAME/PASSWORD/VHOST.
  Runtime broker user `identity_runtime`, vhost `smarttravel`; không có DB credential của service khác.
  Durable `identity.events`, `identity.inbound`, `identity.inbox`, `identity.deadletters`, `identity.dlq`.
  Local/test-only `identity.p01.capture` không được tạo ở production.
- Dispatcher SKIP LOCKED, persistent publish + publisher confirms + mandatory-return validation;
  đánh published sau confirm trong transaction DB. Crash sau publish trước commit có thể gửi lặp,
  inbox dedup ngăn side effect lặp. Max8 failures chuyển failed_at, metric outbox.retry.
- Listener retry3 lần, poison/unknown request -> DLQ + metric `identity.inbox.dlq`.
  Routing key phải khớp event_type; event quá30 ngày hoặc lệch tương lai5 phút bị reject để reconciliation.
  Producer identity phải được platform xác minh bằng broker ACL; payload producer không phải chứng thực.
  Local fixture publisher là tài khoản riêng không có DB credential, không deploy nó ở production.
- Bootstrap `backend/infra/rabbit/bootstrap-broker.sh`: runtime không publish vào inbound;
  fixture không publish outbound. Admin bootstrap chỉ dùng setup, không inject vào Java runtime.
- `DeadLetterReplay` là operator Java entrypoint, không public route: dùng operator RabbitTemplate,
  `replayOne()` publish-confirm trước ack DLQ, giữ original event ID và append system audit.
  Poison không được sửa ngầm: replay vẫn quay DLQ; sửa dependency/handler trước replay.
  `replayFailedOutbox(UUID)` chỉ requeue failed unpublished event, không đổi ID/payload.
- Runtime retention giữ pending/failed outbox, xóa published/inbox sau90 ngày, mail/token hết hạn sau7 ngày,
  notification hơn90 ngày chỉ khi không còn pending hoặc failed delivery. Session reuse evidence giữ đến expiry+7 ngày.
  Audit/deletion requests không xóa bởi runtime. Replay ngoài cửa sổ30 ngày cần reconciliation.
- JSON structured logs/correlation; bounded request body256KiB kể cả chunked; DB pool acquisition2s.
  Liveness không gắn mail/broker; readiness kiểm DB. Catalog HTTP stub/credential-bearing origins
  bị chặn ngoài explicit test/local profiles; production endpoint HTTPS.

## CLI vận hành và live transport probe

`python backend/services/identity-service/check-local.py --transport --image <image>`
chạy image non-root với DB/broker/SMTP riêng của Identity, gửi synthetic partner events qua broker,
kiểm notification/read/EMAIL và request deletion chỉ complete khi đủ sáu ack.
Chạy `python backend/infra/p01.py up --service identity` trước probe.

Operator CLI (một thao tác rồi đóng context) dùng DB runtime credentials và signing/mail secrets
được inject như app; không chạy migration, fixtures, scheduled workers hoặc listener:

```text
python backend/services/identity-service/identity-ops.py replay-outbox --event-id <uuid>
python backend/services/identity-service/identity-ops.py replay-dlq
```

`replay-outbox` chỉ requeue event failed và chưa published, giữ ID/payload, audit cùng transaction.
`replay-dlq` yêu cầu thêm `BROKER_OPERATOR_PASSWORD` và mặc định user `identity_operator`.
Bootstrap tạo user này với read chỉ `identity.dlq`, write chỉ `identity.inbound`; normal runtime
không nhận operator password. Cấu hình host/port/vhost của broker giống app, inject password
qua secret environment, không truyền password trên command line. CLI bind HTTP loopback/port tạm
trong lúc khởi động; không có maintenance route. Message thiếu original x-death/routing metadata
giữ trong DLQ để operator điều tra, không publish ngầm sang routing key khác.

Audit và deletion state chỉ giữ bởi runtime; legal/operational retention của chúng cần job có
quyền riêng và phê duyệt policy trước production. Chạy lại probe sau thay image/config;
không gọi fixture producer hoặc synthetic dataset là dữ liệu production.

## Gate Identity P01

Ngày 11/10/2026, source trên `feature/backend-phase01-finish`:

```text
python backend/services/identity-service/test-local.py --transport --isolated-source
python backend/platform/build_service_image.py identity --tag smarttravel-identity:p01-finish-local --jar backend/services/identity-service/.local/verified-build/identity-service-0.0.1-SNAPSHOT.jar
python backend/services/identity-service/check-local.py --transport --image smarttravel-identity:p01-finish-local --jar backend/services/identity-service/.local/verified-build/identity-service-0.0.1-SNAPSHOT.jar
```

58/58 tests PASS, 0 failure/error/skip; image build và live non-root SMTP/broker probe PASS.
Provider tests kiểm đủ25 frozen operations; image kiểm notification EMAIL SENT/read,
tombstone/revocation, thiếu ack còn pending và đủ6 ack mới complete; sáu outbound envelopes
được validate. Verified JAR/reports ở `.local/verified-build` ignored; không thay JAR đang chạy.
Category client chặn response trên1MB khi streaming và giới hạn toàn request/body2s, tổng pagination5s; hai regression chunked/slow-body PASS. Key rotation, replay, retention và limits được mô tả trong runbook này.
Chờ independent code review và N2 xác nhận nhận gói; DB/broker tests không thay chữ ký con người.
Remote CI revision mới và P02 real partner integration chưa chạy.
