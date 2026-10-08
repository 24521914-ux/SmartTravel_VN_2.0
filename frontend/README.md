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
