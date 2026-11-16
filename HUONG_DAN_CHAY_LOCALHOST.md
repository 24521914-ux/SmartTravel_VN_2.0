# Hướng dẫn chạy SmartTravel trên localhost

Frontend React/Vite chạy tại `http://127.0.0.1:5173`; backend nhận yêu cầu qua Gateway tại `http://127.0.0.1:58080`.

## 1. Chuẩn bị

- Cài Node.js và npm, Python, Docker Desktop có Docker Compose.
- Mở Docker Desktop và chờ Docker sẵn sàng.
- Mở thư mục dự án trong VS Code và tạo hai terminal PowerShell.
- Chuẩn bị file `.env` ở thư mục gốc theo mẫu `.env.example`, với cấu hình Neon và MongoDB Atlas hợp lệ.
- Cho phép IP của máy chạy Docker trong MongoDB Atlas Network Access.

**Lưu ý:** cấu hình mặc định chạy ứng dụng trên máy nhưng dùng database cloud Neon và MongoDB Atlas. Khi khởi động, backend có thể áp dụng migration lên các database này. Không chia sẻ nội dung `.env`, mật khẩu hoặc token.

Chi tiết cấu hình database: [Hướng dẫn cloud](backend/platform/cloud/README.md).

## 2. Terminal thứ nhất: chạy backend

Chuyển đến thư mục gốc dự án. Thay đường dẫn dưới đây nếu bạn lưu dự án ở nơi khác:

```powershell
cd "D:\ĐỒ ÁN TN UIT\SmartTravel_VN_2.0"
```

Kiểm tra cấu hình `.env` và kết nối database:

```powershell
python backend/platform/cloud/manage.py check
```

Nếu kiểm tra thành công, build và chạy backend:

```powershell
docker compose up -d --build --wait
```

Lần đầu cần thời gian tải image và build source. Backend chạy nền sau khi lệnh hoàn tất; không cần cài Java trên máy vì build thực hiện trong Docker.

Kiểm tra trạng thái container:

```powershell
docker compose ps
```

## 3. Terminal thứ hai: chạy frontend

```powershell
cd "D:\ĐỒ ÁN TN UIT\SmartTravel_VN_2.0\frontend"
npm ci
npm run dev
```

`npm ci` cài dependency theo lockfile; cần chạy ở lần đầu hoặc khi dependency thay đổi. Các lần chạy sau có thể dùng ngay `npm run dev` nếu đã cài đủ dependency.

Giữ terminal frontend chạy và mở:

**[http://127.0.0.1:5173/kham-pha](http://127.0.0.1:5173/kham-pha)**

Frontend tự chuyển yêu cầu `/api` tới Gateway ở `http://127.0.0.1:58080` theo cấu hình Vite. File `.env` ở gốc dùng cho backend; không sao chép secret backend vào biến `VITE_*` vì các biến này được đưa vào trình duyệt.

Nếu chỉ muốn xem giao diện, có thể chạy riêng bước 3. Các chức năng cần backend như đăng nhập, tìm kiếm và lưu dữ liệu sẽ chưa hoạt động.

## 4. Xử lý lỗi thường gặp

| Hiện tượng | Cách kiểm tra |
|---|---|
| Docker báo không kết nối được | Kiểm tra Docker Desktop đã chạy và engine đã sẵn sàng. |
| Lệnh `check` thất bại | Kiểm tra cấu hình Neon/Atlas trong `.env`, quyền database và IP được phép trên Atlas. |
| Giao diện mở nhưng không tải dữ liệu | Kiểm tra backend và log Gateway bằng các lệnh bên dưới. |
| Cổng 5173 đã được sử dụng | Dừng phiên frontend cũ bằng `Ctrl+C` trong terminal đang chạy phiên đó, rồi chạy lại `npm run dev`. |

Chạy các lệnh sau tại thư mục gốc dự án:

```powershell
docker compose ps
docker compose logs --tail=80 gateway
```

Nếu một service cụ thể gặp lỗi, xem log của service đó, ví dụ:

```powershell
docker compose logs --tail=80 catalog
```

Che mật khẩu, token và thông tin nhạy cảm trước khi chia sẻ log để nhờ hỗ trợ.

## 5. Dừng ứng dụng

Trong terminal frontend, nhấn `Ctrl+C`.

Tại thư mục gốc dự án, dừng backend:

```powershell
docker compose down
```

Lệnh này không xóa dữ liệu database cloud.

## Tài liệu liên quan

- [Hướng dẫn frontend](frontend/README.md).
- [Cấu hình backend cloud](backend/platform/cloud/README.md).
- Trạng thái backend và kết nối API: [progress_be.md](progress_be.md).
- Trạng thái frontend: [progress_fe.md](progress_fe.md).
