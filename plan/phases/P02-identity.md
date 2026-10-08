# P02 Identity Service và tài khoản

Trạng thái: **Chưa triển khai**. Dependency: P01. Chức năng: F01, notification và nền tảng consent/role.

## Công việc

- [ ] P02-01: Migration [Identity](../database/identity.md), seed role/options; canonical email UNIQUE, password hashing, không lộ email tồn tại qua reset/login response.
- [ ] P02-02: Register/verify/login/JWT bằng framework, JWKS rotation; API đăng ký không nhận ADMIN do client chỉ định.
- [ ] P02-03: Session/refresh rotation/reuse detection; logout/reset password revoke family; rate limit; hash token lưu DB.
- [ ] P02-04: Profile/password/preferences và bảng nhiều giá trị; update atomic cùng profile.version/consent_version. Category validation tích hợp Catalog khi P03 sẵn sàng.
- [ ] P02-05: Admin user status/roles, ownership/security/audit; BUSINESS role chỉ cấp entry UI, không cấp quyền mọi place.
- [ ] P02-06: Notification inbox/read/email retry; dedup source event/recipient/type; payload theo template allowlist.
- [ ] P02-07: Deletion request + 6 ack, disable login ngay; chỉ hoàn tất khi đủ phản hồi và artifact policy thực thi.

## Contract và dữ liệu

14 bảng domain + 4 kỹ thuật. Auth register/login/refresh/logout/verify/reset; me/profile/preferences/sessions/notifications; admin users/status/roles; JWKS và internal status/preferences batch. Publish user.registered/status-changed/preferences.changed/deletion-requested; consume domain notification/deletion ack. Không gửi password/token lên bus.

Frontend: màn auth, profile/preferences, session list, notification inbox, admin user management; route guard không thay quyền server.

## Kiểm nhận

- [ ] Hai refresh đồng thời chỉ một thành công; reuse token revoke đúng family; reset/logout đúng session policy.
- [ ] Token expiry/key rotation/audience sai bị từ chối; USER không tự cấp ADMIN hoặc đọc user khác.
- [ ] Notification duplicate không sinh hai inbox; lỗi email không rollback nghiệp vụ nguồn.
- [ ] Consent mặc định false; event opt-out không bị bỏ khi broker lỗi; deletion đủ ack có truy vết.
- [ ] F01 E2E pass; ghi rõ revocation JWT có thể trễ tối đa TTL, các tác vụ nhạy cảm kiểm status hiện hành.

Đầu ra: migration/API/schema event, ma trận role, tests, auth examples, key rotation/incident runbook và UI. Rollback binary tương thích schema, không khôi phục token đã revoke; giữ public key cũ tới khi token tương ứng hết hạn.
