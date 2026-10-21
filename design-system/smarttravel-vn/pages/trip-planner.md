# Trip Planner & Discovery Studio — Page UI/UX Specification

> **Context:** Màn hình trọng tâm cốt lõi của SmartTravel VN.
> **Core Loop:** Khám phá (Explorer) ➔ Chi tiết địa điểm (Place Detail) ➔ Thêm vào chuyến đi (Quick Modal) ➔ Biên tập lịch trình (Trip Studio).

---

## 1. Split-View Explorer (Khám phá & Bản đồ)

- **Grid/Layout:**
  - Desktop (>= 1024px): 2 cột cân bằng. Cột trái `45%` (Search & Results card grid 1-col), Cột phải `55%` sticky full-height OpenStreetMap view.
  - Tablet/Mobile (< 1024px): Mặc định hiển thị danh sách; có nút Toggle nổi (Floating Pill) chuyển đổi nhanh: `[ Danh sách ]` ⟷ `[ Bản đồ ]`.
- **Card Design:**
  - Thumbnail ảnh tỉ lệ 16:9, bo góc 12px (`var(--radius-lg)`), hiệu ứng lazy loading mờ dần (fade-in 200ms).
  - Badge giá tham khảo và tag danh mục đặt gọn gàng góc trên ảnh với nền `rgba(15, 23, 42, 0.75)` mờ kính, chữ trắng chuẩn a11y.
  - Nút tim Yêu thích (Favorite) nổi góc phải trên ảnh, kích thước tối thiểu 44x44px touch target, hiệu ứng tim nảy nhẹ khi click.
- **Search & Filter:**
  - Ô tìm kiếm có debounce 300ms, hiển thị icon kính lúp SVG bên trái, icon nút 'Xóa nhanh' bên phải khi có text.
  - Chip filters (Bộ lọc nhanh theo vùng miền & danh mục): cuộn ngang mượt mà trên mobile, chip đang chọn có nền cam `var(--color-primary)` và chữ trắng nổi bật.

---

## 2. Place Detail Modal / Sheet (Chi tiết địa điểm)

- **Hiển thị:** Mở dạng Slide-over Drawer (ngăn trượt bên phải) hoặc Modal tập trung để giữ nguyên vị trí bản đồ phía dưới.
- **Header:** Bộ sưu tập ảnh (Cover carousel hoặc mosaic grid), nút đóng [X] rõ ràng ở góc phải trên cùng (hỗ trợ phím `Esc`).
- **Nội dung:**
  - Thông tin địa chỉ có link mở Google Maps / OpenStreetMap bên ngoài.
  - Bảng giờ mở cửa trong tuần: Đánh dấu rõ ngày hôm nay, gắn nhãn xanh `Đang mở cửa` hoặc đỏ nhạt `Đã đóng cửa`.
  - Tab Tiện ích (Amenities): Lưới icon SVG kèm nhãn chữ (Wifi tốc độ cao, Bãi đỗ xe, Thanh toán thẻ, Chỗ ngồi ngoài trời...).
  - Tab Đánh giá (Reviews): Tóm tắt điểm trung bình, danh sách review phân trang, nút "Viết đánh giá" (yêu cầu đăng nhập).
- **Thanh cố định cuối trang (Sticky Bottom Action Bar):**
  - Hiển thị mức giá tham khảo.
  - Nút Primary CTA: `Thêm vào chuyến đi` (Mở Quick Add Dialog).

---

## 3. Quick Add to Trip Dialog (Hộp thoại thêm nhanh vào chuyến đi)

- **Mục tiêu:** Cho phép người dùng thêm địa điểm vào lịch trình chỉ trong **2 cú click chuột**.
- **Luồng thao tác:**
  1. Dropdown chọn Chuyến đi hiện có (hoặc nút bấm nhanh `+ Tạo chuyến đi mới`).
  2. Radio chọn Ngày tham quan cụ thể (Ngày 1, Ngày 2, Ngày 3...).
  3. Chọn thời lượng dự kiến (Mặc định 60 phút, có các chip chọn nhanh: 30p, 1h, 2h, Nửa ngày).
  4. Nút bấm `Xác nhận thêm vào ngày X` (Gửi mutation kèm idempotency key, toast thông báo thành công và giữ người dùng ở lại trang khám phá để tiếp tục chọn điểm tiếp theo).

---

## 4. Trip Planner Studio (Biên tập lịch trình chuyên sâu)

- **Bố cục 3 Cột (Studio 3-Column Layout):**
  - **Cột 1 (Sidebar trái - Ngày đi):** Danh sách các ngày của chuyến đi (Ngày 1: 24/10, Ngày 2: 25/10...). Nút `+ Thêm ngày`. Nút chỉnh sửa tên chuyến đi & ngân sách.
  - **Cột 2 (Vùng giữa - Timeline ngày được chọn):**
    - Hiển thị danh sách các điểm dừng chân theo thứ tự thời gian.
    - Mỗi điểm đến có: Thời gian dự kiến, Tên địa điểm, Ghi chú riêng, Nút khóa/mở khóa (`[🔒 Đã khóa]` / `[🔓 Tự do sắp xếp]`).
    - Giữa 2 điểm đến liên tiếp: Dòng hiển thị **Chặng di chuyển (Route estimation)** — khoảng cách km, thời gian đi xe/đi bộ ước tính.
  - **Cột 3 (Panel phải - Bản đồ lộ trình & Drawer gợi ý AI):**
    - Bản đồ hiển thị polyline lộ trình nối các điểm trong ngày được chọn.
    - Tab Gợi ý thông minh (khi bật AI): Danh sách các địa điểm phù hợp trong khu vực còn trống giờ, có nút `[+ Chèn vào lịch trình]` tiện lợi.
