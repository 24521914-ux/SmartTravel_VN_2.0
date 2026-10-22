# Thiết kế lại frontend claymorphism — 22/10/2026

Cập nhật lần cuối: **22/10/2026** · Revision: `cfd121d91960bb95b63034a7f047f4222a15becd` (checkout dirty) · Người cập nhật: coding agent theo yêu cầu người dùng · Nhánh: `feature/frontend-core-ui`.

## Phạm vi và trạng thái

P03-07: **PARTIAL**. Thiết kế theo ảnh và prompt tham chiếu của người dùng, dùng ui-ux-pro-max và design-taste-frontend. Trang khám phá áp dụng Taste; biểu mẫu và màn vận hành áp dụng hướng dẫn UI UX Pro Max.

Artifact:

- `frontend/src/clay.css`: màu, khối clay, biểu mẫu, desktop/mobile, trạng thái, chi tiết lịch trình và doanh nghiệp.
- `ScreenGuide.tsx`: hướng dẫn từng khu vực và trạng thái trống/lỗi.
- `LiquidGlassNav.tsx`: giữ giao diện props, thay phần hiển thị bằng menu clay; menu Thêm, mobile, Escape.
- `Icon.tsx`: Phosphor, không tự vẽ đường dẫn icon.
- `TravelApp.tsx`: bố cục, chuyển đăng nhập về tài khoản, danh sách nguồn quản trị, giao diện gợi ý theo feature flag, giữ luồng domain API.
- `frontend/scripts/clay-ui-check.mjs`: kiểm tra trình duyệt có dữ liệu giả lập, chụp từng màn; `npm run test:ui`.
- Hai runner tích hợp hiện hữu được điều chỉnh cách mở menu và chuyển đến màn tài khoản. Chưa chạy lại hai runner này với backend thật.
- [Quy cách hình thức và bản đồ màn hình](../../design-system/smarttravel-vn/CLAY_INTERFACE.md).

Không checkout/pull main hoặc tạo nhánh mới vì đầu lượt đã có thay đổi frontend chưa commit trên nhánh đang làm. Giữ thay đổi có sẵn; không reset/stash. Chưa commit/push/PR.

## Môi trường

- Ngày: 22/10/2026, Asia/Ho_Chi_Minh.
- Windows, Node v24.21.0, Python 3.14.2; React 19.2.0, Vite 7.3.7.
- Chromium qua Playwright.
- Backend/DB/broker/Docker không dùng trong kiểm tra UI này. Không có kết luận về môi trường Docker hoặc chất lượng runtime Java.
- API UI được trả fixture tổng hợp trong runner; tài khoản và token đều tổng hợp. Ảnh cảm hứng dùng nguồn ảnh bên ngoài.

## Lệnh và kết quả

Chạy tại `frontend/`:

1. `npm run build`: PASS, TypeScript kiểm tra và Vite xuất bundle; không phải suite test nên số tests không áp dụng.
2. `npm run test:contracts`: tests run **7**, failed **0**, errors **0**, skipped **0**. Kiểm tra client, auth rotation/concurrency, lỗi JSON và headers; không kiểm backend thật.
3. `npm run dev -- --port 5175`: máy chủ cục bộ phục vụ kiểm tra.
4. `npm run test:ui`: checks run **52**, failed **0**, browser errors **0**, skipped **0**, dùng API giả lập.

Các lệnh chạy trên checkout dirty từ revision ở đầu; không dùng để đóng gate.

## Phạm vi 52 kiểm tra UI

- 3 màn khách: trang chủ desktop/mobile, biểu mẫu đăng nhập desktop.
- 27 tổ hợp: 9 màn × 375/768/1440px. Các màn: Khám phá, Bản đồ, Bộ sưu tập, Chuyến đi, Thông báo, Tài khoản, Doanh nghiệp, Kiểm duyệt, Quản trị. Mỗi tổ hợp kiểm không tràn ngang và chụp ảnh.
- 1 màn biên tập chuyến đi desktop.
- 16 màn con: chi tiết địa điểm, bộ sưu tập, ngày lịch trình, vị trí bản đồ và 4 tab doanh nghiệp; mỗi màn ở 375/1440px.
- 1 màn tạo job nhập dữ liệu.
- 1 trạng thái thông báo trống.
- 1 trạng thái lỗi tải chuyến đi.
- 1 kiểm reduced motion: scroll behavior chuyển về auto.
- 1 kiểm không có lỗi JavaScript trình duyệt.
- Runner còn kiểm nút lưu địa điểm chuyển aria-pressed và tên hành động; nhập liệu trên biểu mẫu đăng nhập.

Ảnh và JSON runtime nằm trong `backend/infra/.local/clay-ui/` (ignored); kết quả đã lọc được ghi tại đây. Đã xem trực tiếp ảnh trang chủ desktop, tài khoản mobile và lịch trình desktop/mobile để kiểm chữ, khối, khoảng cách và biểu mẫu.

## Lịch sử chạy và giới hạn

- Lần UI đầu FAIL do matcher `**/api/**` bắt nhầm module `/src/api/`, dẫn tới không tải ứng dụng và timeout menu. Đây là lỗi thiết lập test; đã sửa thành pathname bắt đầu `/api/`. Giữ lần lỗi trong lịch sử.
- Sau sửa runner, chạy bộ 36 kiểm tra hai lần: mỗi lần 36 PASS, 0 failed, 0 skipped. Lần thứ hai sau thay đổi menu/chi tiết.
- Mở rộng lên 52 kiểm tra: PASS trước lượt cuối; chạy lại sau điều chỉnh source để xác minh checkout dirty cuối.
- Một script chỉnh runner dừng do assertion tìm chuỗi không khớp; chuyển sang truyền UTF-8 rõ ràng và kiểm nội dung trước khi chạy lại.
- Build và contract chạy lại khi đổi code; mỗi lần contract 7/7, 0 failure/error/skip.
- Chưa E2E với Gateway, DB, broker, SMTP thật; chưa có CI run ID cho thay đổi này.
- Chưa kiểm ma trận accessibility đầy đủ, screen reader, mọi trạng thái bất đồng bộ và phân quyền server.
- AI giữ feature flag mặc định tắt, chưa kiểm runtime AI. Không kiểm dịch vụ OpenStreetMap thực.
- Lịch trình/chi phí/câu chuyện mẫu là minh họa. Không thêm thanh toán hoặc đặt tour. Đề xuất trong tài liệu thiết kế cũ không tự trở thành chức năng đã triển khai.
- Không nâng CI_VERIFIED, không đóng gate, không ký nghiệm thu.
