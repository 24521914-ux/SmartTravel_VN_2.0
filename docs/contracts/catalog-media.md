# Contract mở rộng media Catalog

Phần mở rộng này mô tả API đã triển khai để khắc phục luồng ảnh. Không thay đổi trạng thái freeze của bộ contract `1.0.0-candidate`; cần owner/reviewer quyết định đưa các operation mới vào phiên bản contract tiếp theo. Trạng thái và bằng chứng kiểm thử xem [progress_be.md](../../progress_be.md).

Mọi đường dẫn bên dưới có prefix Gateway `/api/catalog`.

| Method và đường dẫn | Quyền | Request | Response |
|---|---|---|---|
| `POST /api/v1/admin/media` | ADMIN | `multipart/form-data`, một trường `file` PNG/JPEG, chữ ký MIME khớp, 4 byte–10 MB | `201`, metadata ảnh với `media_id`, `object_key`, `mime_type`, `byte_size`, `checksum`, `moderation_status=PENDING` |
| `POST /api/v1/media` | Người dùng đăng nhập, `catalog:write` | Cùng định dạng upload admin; ảnh nằm trong quarantine, chưa công khai | `201`, metadata ảnh `PENDING`, dùng `object_key` trong `media_keys` của đánh giá |
| `GET /api/v1/admin/media/{id}` | ADMIN | UUID ảnh | `200`, metadata ảnh hiện tại; `404` khi không tồn tại |
| `GET /api/v1/media/{id}` | Công khai | UUID ảnh | `200`, binary với `Content-Type: image/png` hoặc `image/jpeg`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`; `404` với ảnh không được duyệt, ảnh private hoặc file không còn tồn tại |

`POST /api/v1/admin/media/{id}/review` giữ response accepted của contract hiện tại. Body gồm `action` (`APPROVE`, `REJECT`, `REVOKE`) và `reason` không rỗng. `APPROVE` chỉ thành công khi scanner cấu hình trả `clean=true`; lỗi/timeout/scanner từ chối không cập nhật ảnh thành `APPROVED`. `REVOKE` chuyển ảnh về `REJECTED`, do đó mọi lần đọc mới trả `404`.

Frontend gửi Bearer và `Idempotency-Key` cho upload/review. Backend upload hiện chưa hỗ trợ replay theo idempotency key; người dùng cần kiểm tra kết quả trước khi gửi lại khi mất kết nối. Backend media chưa có trường version/kiểm tra `If-Match`; đây là khác biệt đã tồn tại giữa implementation review và candidate contract, cần owner giải quyết khi cập nhật contract.

Không có scanner tự động chấp thuận trong môi trường tích hợp. `catalog.media.scanner-url` phải trỏ đến dịch vụ quét thật, truy cập được object storage theo `object_key` và kiểm tra đúng `checksum`. Không đưa ảnh vào `APPROVED` bằng fixture hoặc cập nhật DB để thay thế kiểm thử scanner.
