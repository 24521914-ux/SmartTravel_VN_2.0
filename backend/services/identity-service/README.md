# Identity — P01 M1 + auth/session

Owner N1; reviewer N2. **IN_PROGRESS**, chưa READY_FOR_INTEGRATION.
Tiến độ/evidence chung: [checklist](../../../progress/PHASE_TASK_CHECKLIST.md).
Contract candidate giữ nguyên: [OpenAPI](../../contracts/openapi/identity.yaml), revision `1.0.0-candidate`.

## Cấu trúc source

Áp dụng [service → chức năng → tầng](../README.md): `auth/` và `profile/` có controller/dto/service/repository;
`security/` chứa JWT/JWKS/current principal; `infrastructure/` chứa mail/persistence/fixture;
`shared/` chứa exception và web helpers. SQL chỉ nằm trong repository, mỗi top-level type/file riêng.
API, claims, schema và transaction semantics giữ nguyên sau refactor.

## Đã triển khai

13/25 operation: register/verify/login/refresh/logout/forgot/reset, GET/PATCH me,
change password, list/revoke sessions và public JWKS. Không trả token verify/reset trong API.
- PostgreSQL thật, Flyway V1–V5, runtime/migrator riêng. 14 domain + 4 baseline technical + 2 operational tables (`auth_rate_limits`, `account_mail_jobs`). V1–V4 không sửa checksum.
- Register atomic user/USER/preferences/verify-token/mail-job/outbox/audit; consent mặc định false. Duplicate email trả cùng cấu trúc 202; idempotency 24h, khác body 409. Request hash dùng HMAC để không làm giảm độ an toàn password hashing.
- PBKDF2 SHA-256 Spring Security v5.8 defaults (salt 16 bytes, 310.000 iterations); refresh/account token random 256 bit, chỉ lưu SHA-256 hash.
- RS256, issuer/audience/exp/iat/sub validation. Access 600s, session absolute 30 ngày, mỗi refresh idle 7 ngày, reset 30 phút, verify 24 giờ. JWT có UUID sub/jti/sid, roles và scopes. User issuer không cấp internal workload scopes.
- Refresh khóa theo thứ tự user → session → token; consume + token con trong một transaction. Reuse commit revoke family **trước** 401. Hai refresh đồng thời chỉ một thành công; reuse từ request còn lại cũng revoke token mới.
- Logout, reset, change password và revoke session chặn ngay các API me nhờ kiểm DB session/status; fail closed khi không đọc được DB. Consumer JWT offline còn chấp nhận đến TTL + clock skew validator (mặc định 60s), tối đa khoảng 11 phút. Không hứa logout revoke tức thời JWT offline.
- Strong ETag/If-Match cho profile: thiếu 428, malformed 400, stale 409. Sessions cursor opaque, default20/max100, lọc owner tại DB.
- Durable account/client rate limits: 10 attempts/account/action/minute, 60/client/action/minute; retry-after 60s. Không tin X-Forwarded-For do client tự gửi. Cấu hình trusted proxy trước triển khai.
- Mail queue AES-256-GCM, poll5s, SELECT FOR UPDATE SKIP LOCKED, bounded exponential retry tối đa 8 lần. Không gửi token expired/consumed/superseded; không ghi log provider error chứa PII/credential. SMTP có thể gửi lặp nếu crash sau send trước commit; không tuyên bố exactly-once.
- Hai outbox event full envelope `user.registered` và `user.status-changed` (verify); chưa dispatch broker. Audit không chứa email/password/token.

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
# 19 tests, gồm 12 DB/API/domain cases trên container PostgreSQL disposable riêng
python backend/services/identity-service/test-local.py
# App jar + DB P01 + SMTP thật; validate response/event bằng schema candidate
python backend/services/identity-service/check-local.py
python backend/infra/p01.py smoke --service identity
python backend/infra/p01.py verify --service identity
# Non-root image chạy lại auth/mail/provider smoke
docker build -t smarttravel-identity:p01-auth-local backend/services/identity-service
python backend/services/identity-service/check-local.py --image smarttravel-identity:p01-auth-local
```

`test-local.py` tự stop container test, không gắn P00/P01 volumes. Maven thường chạy 7 unit/security
tests và **skip 12 DB tests** khi chưa inject `IDENTITY_DB_TESTS=true`; không coi skip là DB PASS.
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
- Rollback dùng image tương thích V5; không chạy Flyway down/drop, không rollback session revocation.
  Image M1 cũ không có auth nghiệp vụ nên không phải rollback functional auth hợp lệ.

## Còn thiếu để hoàn thành Identity P01

Preferences/options/category/consent API; admin status/roles/users; internal workload batches;
notification inbox/delivery consumers; deletion request/6-ack state machine/tombstone;
category HTTP stub + fault tests; outbox dispatch/inbox handlers/retry/DLQ/retention và idempotency các mutation còn lại.
Cần provider tests đủ 25 operation/events, security/fault regression toàn scope và handoff reviewer N2.
Không mở P02 hoặc đóng gate dựa trên auth smoke. Frontend/provider production chưa triển khai trong lượt này.
