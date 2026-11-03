# P01-ID Identity Service — nhóm A

Trạng thái (03/11/2026): **9/10 task LOCAL_VERIFIED; ID-10 (handoff/reviewer N2) còn PARTIAL; finding F-01 (thiếu consumer contribution/model.deployed); luồng xác minh/khôi phục đã kiểm local, SMTP Gmail P02 chờ cấu hình người dùng (F-34)**. Code đã merge vào `main` (PR #5–#9, merge `a9ab23a`); người dùng chấp nhận P01 ngày 11/10/2026, chưa có chữ ký reviewer. Evidence chính thức tại [progress](../../../progress_be.md); checkbox trong file này là yêu cầu, không phải trạng thái. Dependency: P00, không chờ service khác. Scope: F01, auth/session/role/preferences/consent/notification/deletion. Reviewer: B.

Đọc [database Identity](../../database/identity.md), [DDL](../../database/sql/identity.sql), [contract](../../04-api-events.md) và [gate chung](README.md). Owner sửa `backend/services/identity-service/**` khi triển khai.

## Dependency được giả lập

| Đối tác | Thay thế ở P01 | Tình huống kiểm |
|---|---|---|
| Catalog category validation | HTTP stub `/categories`/internal lookup theo contract | Active/inactive/404/timeout |
| Event từ Catalog/Community/Trip | Fixture qua consumer harness | Notification hợp lệ/trùng/sai recipient |
| Deletion ack từ 5 service | Fixture đủ/thiếu/lặp/FAILED | Chỉ complete khi đủ 6 ack kể cả Identity |
| Email | Local mail sink/provider sandbox | Success/retry/provider timeout |

Identity tự implement issuer/JWKS/session thật của mình; không giả response login. Recipient/principal và category IDs lấy từ fixture đã chốt P00.

## M1 Database và local runtime

- [x] P01-ID-01: Flyway cho 14 bảng domain + 4 kỹ thuật baseline (V5 thêm 2 operational auth/mail); role/options seed, canonical email UNIQUE, auth session/token hash và dữ liệu U1/U2/admin/business test.
- [x] P01-ID-02: App/security/JWT issuer/JWKS/key rotation local, secret injection/log redact, health/CI/local compose; không có credential DB service khác.

## M2 Nghiệp vụ

- [x] P01-ID-03: Register/verify/login/logout/refresh/password reset/change, rate limit; đăng ký không cho tự gán ADMIN, error không lộ tài khoản tồn tại.
- [x] P01-ID-04: Profile/preferences/options/category HTTP validation/consent, update atomic và version; admin user/status/roles; xử lý session family khi logout/reset/reuse. DB/API/provider tests PASS; category invalidation consumer vẫn thuộc ID-06.
- [ ] P01-ID-05: Notification inbox/read/delivery/retry; deletion request/ack/state machine; account disable ngay, không complete sớm.

API: auth register/login/refresh/logout/verify/reset, me/profile/password/preferences/sessions/notifications/deletion, admin users/status/roles và internal user-status/preferences batch. Đủ request/response/error examples cho frontend, không cần frontend mới kiểm được chức năng.

## M3 Biên giao tiếp

- [ ] P01-ID-06: Client validation category trỏ stub; outbox user.registered/status-changed/preferences.changed/deletion-requested; consumers notification/deletion ack dùng fixture thật qua handler. Idempotency/transaction/audit hoàn chỉnh.
- [ ] P01-ID-07: Contract/provider tests cho JWKS/token claims, batch status/preferences và event snapshots; config stub/profile chỉ cho test/dev, không lọt môi trường thật.

## M4 Kiểm nhận và bàn giao

- [x] P01-ID-08: Email duplicate, token consumed/expired/reused; hai refresh đồng thời chỉ một thắng; JWT expiry/audience/key rotation đúng.
- [ ] P01-ID-09: USER không cấp ADMIN/đọc user khác; category timeout đúng policy; duplicate notification không gửi hai lần; missing ack không complete; consent mặc định false.
- [ ] P01-ID-10: Bàn giao image/migrations/OpenAPI/event samples/test report/local-run, key rotation/revoke runbook và config nối thật.

**Gate:** mọi đường nghiệp vụ chạy với DB Identity thật và đối tác stub; không còn TODO trong scope; A/B xác nhận READY_FOR_INTEGRATION. Độ trễ revocation JWT theo TTL được mô tả, tác vụ nhạy cảm kiểm status hiện hành.

## Chỉ làm sau gate 6/6 tại P02

Đưa issuer/JWKS thật cho năm consumer, nối Catalog category/status, domain notifications và deletion ack thật. Chạy lại cross-service auth/revocation/deletion; chưa coi mock đủ chứng minh hệ thống đã kết nối.

Rollback cục bộ: image/config tương thích schema; không phục hồi token đã revoke. UI bàn giao: schema/form/error examples auth/profile/preferences/notifications/admin, không bắt buộc A sở hữu toàn frontend.
