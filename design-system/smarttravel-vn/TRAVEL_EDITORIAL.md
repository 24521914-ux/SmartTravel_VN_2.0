# Định hướng travel editorial

Ngày: 22/10/2026. Phạm vi: nền tảng giao diện, navbar và landing page (Phase 1–2 của brief redesign).

## Audit trước khi sửa

- React 19, Vite 7, CSS thuần, Phosphor có sẵn; giữ cấu trúc feature và API client hiện tại.
- Giữ màu thương hiệu teal `#087E8B`, Be Vietnam Pro, nhãn điều hướng và hash route.
- Hero cũ là khối nền nhạt thiếu ảnh. Dropdown vẫn hiển thị vì CSS ghi đè thuộc tính hidden.
- Card cũ tự thêm rating 4.8/42, lặp ảnh đường phố Nhật; bộ lọc chỉ đổi trạng thái giao diện, cursor chưa gửi đến API.
- Gateway đang trả về tên fixture P02/P03. Giữ dữ liệu gốc, không đổi tên thành địa danh thật.
- SEO: giữ title, description, ngôn ngữ vi và route hiện tại; không tạo slug mới.

## Quyết định thiết kế

`design-taste-frontend`: redesign overhaul cho lớp hình ảnh, bảo toàn điều hướng và API. DESIGN_VARIANCE 7 (editorial lệch nhịp), MOTION_INTENSITY 3 (phản hồi hover/điều hướng), VISUAL_DENSITY 3. Be Vietnam Pro tự host, nền off-white, teal thương hiệu, sand chỉ cho khối kế hoạch. Một hệ bo góc: ảnh 16px, khối lớn 18–22px, nút pill. Container 1440px, lề desktop 40px, mobile 16px. Có theme tối theo hệ thống và giảm chuyển động.

Hero dùng ảnh Tam Cốc thật, headline hai dòng bên trái, CTA rõ; search nối hero. Kết quả API có danh mục thật, skeleton/empty/error, cursor. Bản ghi có tiền tố kiểm thử nằm trong disclosure có cảnh báo, tên giữ nguyên. Nội dung biên tập gồm Ninh Bình/Hội An/Hạ Long, tách khỏi danh mục API; không thêm rating, lượt review, thống kê hoặc collection công khai giả.

## Skill và tham khảo

- Đã đọc bản local `C:/Users/ASUS/.codex/skills/taste-skill/SKILL.md`; bản này không có scripts hay bộ art-direction mới trên upstream. Dùng audit/pre-flight trực tiếp, Playwright để xem screenshot.
- `ui-ux-pro-max`: truy vấn design-system đầu tiên trả Aurora UI không hợp brief; không lưu kết quả này. Truy vấn lại domain style cho Minimalism & Swiss Style, chỉ dùng nguyên tắc grid/hierarchy. Domain ux trả Keyboard Navigation/Focus States phù hợp web.
- Tham khảo [Vietnam Tourism](https://vietnam.travel/things-to-do/10-must-do-activities-ninh-binh): dùng điểm đến và ảnh phong cảnh làm trung tâm; không sao chép layout hoặc asset của website.
- Ảnh lấy từ Wikimedia Commons, kiểm metadata giấy phép và xem từng ảnh trước khi đưa vào. Không dùng ảnh AI vì brief yêu cầu ảnh du lịch thật. Manifest: `frontend/public/images/editorial/credits.json`; footer ghi tác giả/nguồn/giấy phép/chỉnh sửa.

## Giới hạn

Chưa redesign detail, planner, account, business/admin và AI. Backend contract danh sách place có media_keys nhưng không có URL ảnh/rating/address; card dùng placeholder trung tính khi thiếu dữ liệu. Không coi build hoặc screenshot là bằng chứng đóng gate. Evidence và trạng thái chính thức xem [progress](../../progress/README.md).
