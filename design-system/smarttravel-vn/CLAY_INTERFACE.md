# Giao diện claymorphism cho SmartTravel VN

Thiết kế theo mẫu người dùng cung cấp ngày 22/10/2026: nền kem, cam đào, khối bo tròn, viền sáng và bóng đổ mềm. Đây là hướng thẩm mỹ triển khai bằng CSS, không phải một thư viện giao diện chính thức.

## Quy tắc hiển thị

- Bộ màu: nền #FDF9F5, chữ #293234, nút cam #EFA460 với chữ nâu #482A18, xanh bạc hà cho nội dung khám phá và hồ sơ, tím nhạt cho dữ liệu.
- Font giữ theo dự án: Nunito cho tiêu đề, Be Vietnam Pro cho nội dung và tiếng Việt.
- Bo góc: 13–17px cho điều khiển, 23–28px cho thẻ, 34px cho ảnh hero.
- Claymorphism tập trung ở nút, thẻ, biểu tượng và khung ảnh. Biểu mẫu dùng nền sáng và viền rõ.
- Dùng Phosphor qua lớp Icon chung. Chuyển động 150–200ms phản hồi thao tác; tắt khi người dùng chọn reduced motion.
- Desktop có bốn mục điều hướng chính và menu Thêm. Mobile dùng menu mở rộng; Escape trả focus về nút mở.
- Các màn không thay URL hiện có. API, optimistic concurrency và feature flag AI được giữ theo ứng dụng.
- Ảnh và lịch trình biên tập chỉ dùng làm cảm hứng; chi phí mẫu không phải báo giá hay dịch vụ đặt tour.

## Bản đồ màn hình

| Khu vực | Màn hình và nội dung |
|---|---|
| Khám phá | Hero du lịch, giá trị sản phẩm, tìm địa điểm, vùng miền, danh sách địa điểm, lưu yêu thích, lịch trình mẫu, thư viện ảnh, lập kế hoạch thử, câu chuyện minh họa |
| Chi tiết địa điểm | Thông tin có nhãn, đánh giá, biểu mẫu gửi đánh giá, lưu yêu thích |
| Bản đồ | Tìm địa điểm, danh sách, tọa độ, liên kết OpenStreetMap, tải bản đồ khi người dùng chọn xem |
| Bộ sưu tập | Tạo tên và quyền hiển thị, danh sách, nội dung bộ sưu tập, trạng thái chưa có địa điểm |
| Chuyến đi | Tạo tên, ngày đi, ngân sách; danh sách chuyến đi; chọn ngày; thêm địa điểm; ghi chú; thời lượng; khóa/mở khóa |
| Tài khoản | Đăng nhập, đăng ký, hồ sơ, quyền cá nhân hóa theo feature flag, yêu cầu xóa tài khoản |
| Thông báo | Nội dung cập nhật, đánh dấu đã đọc, trạng thái trống |
| Doanh nghiệp | Tạo hồ sơ; quản lý hồ sơ, thành viên, xác minh KYC, yêu cầu sở hữu địa điểm |
| Kiểm duyệt | Chọn hàng đợi, xử lý đánh giá/địa điểm, lý do quyết định, biểu mẫu kiểm tra KYC |
| Quản trị | Chọn nguồn nhập dữ liệu, danh sách nguồn, chọn nguồn, chạy thử, theo dõi job nhập dữ liệu |
| Gợi ý | Danh sách và giải thích, xem chi tiết, chuyển sang lịch trình khi VITE_AI_ENABLED=true |

## Bố cục và trạng thái

Desktop dùng vùng nội dung tối đa 1280px. Tablet thu menu về nút mở rộng. Mobile chuyển lưới và nhóm trường ngày thành một cột; nút tối thiểu 44px. Các màn thao tác có khối giới thiệu, nội dung chính và trạng thái loading/error/empty riêng.

Các chi tiết dạng panel trong luồng trang để giữ cấu trúc ứng dụng hiện tại. Không biến panel thành modal nếu chưa triển khai quản lý focus tương ứng.

Định nghĩa hình thức hiện hành nằm tại frontend/src/clay.css và các thành phần ScreenGuide, LiquidGlassNav, Icon. Tài liệu này bổ sung hướng thẩm mỹ theo yêu cầu mới; các đề xuất tính năng trong MASTER.md, FRONTEND_DESIGN_SPECIFICATION.md và pages/trip-planner.md vẫn cần được đối chiếu với API trước khi triển khai. Các đề xuất như kéo thả tối ưu tuyến, bản đồ polyline và quản trị mô hình đầy đủ không được coi là chức năng đã có chỉ vì xuất hiện trong tài liệu thiết kế.

Trạng thái và bằng chứng kiểm thử chỉ ghi tại [progress](../../progress/PHASE_TASK_CHECKLIST.md).
