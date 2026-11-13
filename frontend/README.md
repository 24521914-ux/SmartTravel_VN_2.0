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

## Đường dẫn màn hình

Điều hướng dùng History API với slug không dấu. Tên menu tiếng Việt không đổi.
`/` và `/app` chuyển về `/kham-pha`; bookmark cũ dạng `/app#/Khám%20phá`
được chuyển sang path mới bằng `replaceState`, không tạo thêm bước Back.

| Màn hình | Path |
|---|---|
| Khám phá | `/kham-pha` |
| Bản đồ | `/ban-do` |
| Bộ sưu tập | `/bo-suu-tap` |
| Chuyến đi | `/chuyen-di` |
| Thông báo | `/thong-bao` |
| Tài khoản | `/tai-khoan` |
| Doanh nghiệp | `/doanh-nghiep` |
| Kiểm duyệt | `/kiem-duyet` |
| Quản trị | `/quan-tri` |
| Đóng góp | `/dong-gop` |

Vite dev/preview hỗ trợ SPA fallback khi mở trực tiếp hoặc tải lại các path.
Khi triển khai `dist/`, hosting phải trả `index.html` cho các đường dẫn giao diện;
giữ route `/api/` đến Gateway và phục vụ asset tĩnh trước fallback. Ví dụ Nginx:

```nginx
location /api/ {
    proxy_pass http://gateway:8080;
}
location /assets/ {
    try_files $uri =404;
}
location / {
    try_files $uri $uri/ /index.html;
}
```

Path không có trong bảng hiển thị trang không tìm thấy ở phía client.
Kiểm tra điều hướng: `npm run test:browser:routing` (cần dev server và Gateway).
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

Backend mặc định dùng database cloud Neon/Atlas: `.env` ở gốc repo là file riêng tư,
theo mẫu `.env.example`; xem [hướng dẫn cloud](../backend/platform/cloud/README.md).
Chạy `python backend/platform/cloud/manage.py check`, rồi
`docker compose up -d --build --wait`. Máy chạy backend phải được cho phép IP trong
Atlas Network Access. Ảnh/tệp vẫn nằm trong volume của từng máy chạy backend.
Trạng thái kết nối API xem [`progress_be.md`](../progress_be.md), màn hình xem
[`progress_fe.md`](../progress_fe.md).

Mở `http://127.0.0.1:5173/kham-pha` sau khi khởi động stack P02 và `npm run dev`.
Vite chuyển `/api` tới Gateway thật `http://127.0.0.1:58080`; thay bằng biến
`P02_GATEWAY_TARGET` khi Gateway dùng địa chỉ khác. Landing dùng `/kham-pha`; `/` chuyển về landing.
`P00_STUB_TARGET` chỉ dành cho chạy fixture P00 chủ động; không đặt trong P02.

Màn ứng dụng có đăng nhập/đăng ký/xác minh email, tìm kiếm và chi tiết địa điểm,
review/yêu thích, gợi ý, bộ sưu tập, chuyến đi/ngày/địa điểm/khóa lịch trình,
thông báo, hồ sơ/consent, yêu cầu xóa tài khoản và trang quản trị nguồn/model.
Job nhập có thao tác khởi chạy và tải lại trạng thái; quyền quản trị do Gateway/service
kiểm tra. Gợi ý giữ `request_id` cho mục lịch trình. Mọi mutation gửi idempotency key;
update gửi phiên bản hiện tại và hiển thị conflict/error để người dùng tải lại.
Phiên ứng dụng được lưu ở browserTokenStore; nút gia hạn gọi refresh token rotation.
Provider email/nguồn ngoài phụ thuộc cấu hình backend; sandbox chỉ có khi chọn local rõ ràng.

```text
npm run build
npm run test:contracts
npm run test:gateway
npx playwright install chromium
npm run test:browser
```

Hai smoke cuối gọi Gateway thật và ghi dữ liệu; chạy trên môi trường kiểm thử riêng,
không dùng database cloud chung. Khởi tạo bằng `python backend/platform/init_env.py --mode local`,
rồi `docker compose --env-file .env.local -f docker-compose.yml -f docker-compose.local.yml up -d --build --wait`.
Cần user fixture đã được khởi tạo và mật khẩu từ file ignored `.env.local` ở gốc repo;
đặt `P02_ENV_FILE=.env.local` khi chạy smoke (PowerShell: `$env:P02_ENV_FILE = '.env.local'`;
xem `scripts/p02-secrets.mjs`). `P02_SECRETS_FILE` chỉ dành cho file credential **JSON**,
không dùng cho file dotenv. Có thể override bằng `P02_USER_EMAIL`, `P02_USER_PASSWORD`, `P02_GATEWAY_TARGET`
và `P02_FRONTEND_URL`. Không in token/password. Browser smoke tạo tài nguyên được
đặt tên `Browser smoke`/`Browser journey` trên dữ liệu kiểm thử, lưu ảnh trong
`backend/infra/.local/p02/frontend-browser/`. Các smoke không kiểm production provider.


## P03 non-AI acceptance — 20 October 2026

AI is disabled unless `VITE_AI_ENABLED=true`; Gateway also requires its independent `AI_ENABLED=true` flag. Recommendation, model admin and AI consent opt-in are hidden while deferred. Existing consent revocation remains available. `npm run test:browser` runs the non-AI real-Gateway browser suite; the older AI suite is retained as `test:browser:ai` for later work. Browser output is now `backend/infra/.local/p03/frontend-browser/`. Current acceptance: 8 groups, 36 responsive cases, zero AI HTTP requests/page errors. See [P03 non-AI handoff](../docs/P03_NON_AI_ACCEPTANCE.md); older browser checkpoints below/above remain historical.

## Bản đồ và địa chỉ

Trang `/ban-do` dùng Leaflet, hiển thị ghim từ tọa độ Catalog đã lưu. Nút `Tìm`
tìm tên/địa chỉ trong Catalog; `Tra địa chỉ trên bản đồ` tìm trực tiếp qua Photon
và chỉ xem trước kết quả, không tạo hoặc sửa địa điểm.

Ở `/quan-tri` → quản lý danh mục → địa điểm → sửa: tra tên kèm tỉnh/thành,
chọn kết quả, kiểm tra địa chỉ và ghim, bấm bản đồ để chỉnh lối vào rồi lưu.
`Tra từ tọa độ hiện tại` gợi ý địa chỉ gần ghim; cần kiểm tra trước khi chọn.
Các địa chỉ cũ bằng tên địa điểm vẫn cần quản trị viên bổ sung, không tự ghi đè.

Photon demo không cần key, chỉ gọi khi bấm tìm; có cache trong phiên và hàng đợi
giãn cách yêu cầu. Máy chủ demo không có cam kết sẵn sàng; dùng endpoint riêng
khi có nhiều người dùng. Cấu hình công khai ở `.env.example`: `VITE_PHOTON_URL`,
`VITE_MAP_TILE_URL`, `VITE_MAP_ATTRIBUTION`. Không đặt secret trong biến `VITE_*`.
Localhost dùng nền Stadia Maps không cần key; domain triển khai mặc định dùng OSM.
Nếu dùng Stadia trên domain triển khai, cần đăng ký domain hoặc key giới hạn domain.
Khi đổi nguồn nền phải cấu hình attribution đúng nhà cung cấp.

Tài liệu dịch vụ: [Photon](https://github.com/komoot/photon),
[Stadia authentication](https://docs.stadiamaps.com/authentication/),
[OSM tile policy](https://operations.osmfoundation.org/policies/tiles/).
Migration Catalog `V9__place_address_search.sql` cập nhật chỉ mục tên + địa chỉ,
hỗ trợ tìm không dấu và đồng bộ khi sửa tên/địa chỉ. Chạy kiểm tra bản đồ bằng
`npm run test:browser:map` khi P02 và Vite sẵn sàng.
Trạng thái và bằng chứng nằm tại [progress_fe.md](../progress_fe.md) và
[progress_be.md](../progress_be.md).
