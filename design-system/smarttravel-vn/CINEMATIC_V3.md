# Cinematic Vietnam V3

Hướng thiết kế: landing du lịch Việt Nam cho người muốn khám phá và tự lập lịch trình; cinematic landscape, editorial, luxury minimalism. Taste Skill: DESIGN_VARIANCE 7 / MOTION_INTENSITY 6 / VISUAL_DENSITY 3.

- Tham chiếu: https://floria-landing-page.vercel.app/ — học nhịp ảnh, khoảng trống và header hòa nền; không sao chép nội dung hay nhận diện.
- UI/UX Pro Max: đã chạy `scripts/search.py "travel cinematic landscape editorial" --design-system -p SmartTravel` và `"navigation" --stack react`. Kết quả hệ thống tự động thiên Swiss và hồng không phù hợp brief; chọn palette rừng tối theo yêu cầu. Truy vấn React animation ban đầu không có kết quả, đã tìm lại navigation.
- Typography: Be Vietnam Pro tự host, đủ dấu tiếng Việt; headline 400 với italic cùng họ, UI 400–600. Display desktop tối đa 120px, mobile 48–74px.
- Màu: deep #0b1411, forest #14231d, elevated #1c2c25; chữ #f6f4ee/#c6ccc5; accent sage #b4c5a3. Vùng lịch trình dùng màu sáng để đổi nhịp.
- Hình dạng: ảnh gần vuông góc 3px; form 8px; điều hướng và CTA capsule. Không dùng card bao hero.
- Motion: hero zoom 1–1.04 trong 24s; entrance trễ 120ms từng lớp; reveal một lần bằng Web Animations + IntersectionObserver; parallax CSS nếu browser hỗ trợ. Không cập nhật state mỗi frame. Reduced motion hủy chuyển động.
- Header: fixed, trong suốt ở đầu landing; IntersectionObserver theo marker 80px đổi capsule. Trang chức năng luôn có nền đọc được và khoảng trống phía trên.
- Ảnh biên tập có attribution trong footer và `frontend/public/images/editorial/credits.json`. Không gán ảnh biên tập làm ảnh Catalog. Showcase lấy image_url/cover_image từ Catalog.
- Community: đọc review theo điểm đến, chỉ hiển thị content từ API; chưa có API liệt kê toàn bộ collection public nên dẫn tới màn collection hiện có.
- Phạm vi hiện tại A/B/C. Business/Admin giữ luồng và ưu tiên đọc dữ liệu, chưa triển khai lại ở giai đoạn D.
