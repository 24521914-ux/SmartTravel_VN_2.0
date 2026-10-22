# Frontend P00 scaffold

Tiến độ frontend: [progress_fe.md](../progress_fe.md). Trạng thái kết nối từng API với backend: [progress_be.md mục 9](../progress_be.md#9-kết-nối-be--fe).

React/TypeScript/Vite. Owner cấu hình chung N2, reviewer N1; màn theo phân công service.

```bash
# Từ root repo, terminal 1
python backend/platform/contract_stub.py --service catalog --port 18082
# Terminal 2
cd frontend
npm ci
npm run dev
```

Mở `http://127.0.0.1:5173`, nút kiểm tra gọi Catalog fixture qua Vite dev proxy. Không cần service nghiệp vụ thật. Build: `npm run build`.

Proxy chỉ dành cho dev; deploy thật cần Gateway route/same-origin configuration và auth flow trong P01/P02. Không có token production ở scaffold. Build TypeScript không đồng nghĩa đã kiểm browser/E2E hoặc chức năng frontend nghiệp vụ.
# API/auth client P01

`src/api/` cung cấp client cho sáu service qua prefix `/api/<service>`, body/response giữ
tên snake_case của contract. Default token store là memory; browserTokenStore chỉ dùng
khi caller chủ động chọn. IdentityClient login/refresh/logout; refresh đồng thời dùng
chung một promise để không reuse token một lần. Login/refresh bỏ bearer cũ; refresh
thất bại xóa session hiện tại, kết quả refresh muộn không ghi đè một login mới.

Client giữ If-Match/Idempotency-Key/trace, xử lý204, domain error/version conflict, timeout
và malformed provider response. Không tự retry mutation hoặc âm thầm đổi optimistic version.

```text
npm --prefix frontend run test:contracts
npm --prefix frontend run build
```

Tests thực thi client với fetch partner mock và sáu frozen fixture sets, không chỉ dò text source.
Client nền tảng này chưa phải màn nghiệp vụ hoặc bằng chứng kết nối runtime P02.

## Ứng dụng tích hợp P02

Mở `http://127.0.0.1:5173/app` sau khi khởi động stack P02 và `npm run dev`.
Vite chuyển `/api` tới Gateway thật `http://127.0.0.1:58080`; thay bằng biến
`P02_GATEWAY_TARGET` khi Gateway dùng địa chỉ khác. Landing `/` được giữ nguyên.
`P00_STUB_TARGET` chỉ dành cho chạy fixture P00 chủ động; không đặt trong P02.

Màn ứng dụng có đăng nhập/đăng ký/xác minh email, tìm kiếm và chi tiết địa điểm,
review/yêu thích, gợi ý, bộ sưu tập, chuyến đi/ngày/địa điểm/khóa lịch trình,
thông báo, hồ sơ/consent, yêu cầu xóa tài khoản và trang quản trị nguồn/model.
Job nhập có thao tác khởi chạy và tải lại trạng thái; quyền quản trị do Gateway/service
kiểm tra. Gợi ý giữ `request_id` cho mục lịch trình. Mọi mutation gửi idempotency key;
update gửi phiên bản hiện tại và hiển thị conflict/error để người dùng tải lại.
Phiên ứng dụng được lưu ở browserTokenStore; nút gia hạn gọi refresh token rotation.
Các provider email/nguồn ngoài vẫn theo cấu hình sandbox của stack tích hợp.

```text
npm run build
npm run test:contracts
npm run test:gateway
npx playwright install chromium
npm run test:browser
```

Hai smoke cuối gọi Gateway thật; cần user fixture đã được khởi tạo và mật khẩu từ
file ignored `backend/infra/.local/p02/secrets.json`. Có thể override bằng
`P02_SECRETS_FILE`, `P02_USER_EMAIL`, `P02_USER_PASSWORD`, `P02_GATEWAY_TARGET`
và `P02_FRONTEND_URL`. Không in token/password. Browser smoke tạo tài nguyên được
đặt tên `Browser smoke`/`Browser journey` trên dữ liệu kiểm thử, lưu ảnh trong
`backend/infra/.local/p02/frontend-browser/`. Các smoke không kiểm production provider.


## P03 non-AI acceptance — 20 October 2026

AI is disabled unless `VITE_AI_ENABLED=true`; Gateway also requires its independent `AI_ENABLED=true` flag. Recommendation, model admin and AI consent opt-in are hidden while deferred. Existing consent revocation remains available. `npm run test:browser` runs the non-AI real-Gateway browser suite; the older AI suite is retained as `test:browser:ai` for later work. Browser output is now `backend/infra/.local/p03/frontend-browser/`. Current acceptance: 8 groups, 36 responsive cases, zero AI HTTP requests/page errors. See [P03 non-AI handoff](../docs/P03_NON_AI_ACCEPTANCE.md); older browser checkpoints below/above remain historical.
