# Frontend P00 scaffold

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
