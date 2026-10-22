# Frontend cinematic V3 — giai đoạn A/B/C

Cập nhật lần cuối: **22/10/2026** · Revision: `cfd121d` (dirty, nhánh `feature/frontend-travel-editorial`) · Người cập nhật: coding agent.

## Phạm vi và trạng thái

P03-07 giữ **PARTIAL**. Đã triển khai header trong suốt → capsule theo cuộn, hero full-bleed, palette cinematic, entrance/zoom/reveal dùng chung, showcase Catalog, review cộng đồng, CTA cuối và responsive. Không thay backend/contract, AI mặc định tắt. Thay đổi có sẵn trong checkout được giữ lại; không checkout main/pull vì checkout dirty, không commit/push. Giai đoạn D chưa làm; chưa đóng gate hay ký nghiệm thu.

Thiết kế: [CINEMATIC_V3.md](../../design-system/smarttravel-vn/CINEMATIC_V3.md). Đọc Taste Skill và UI/UX Pro Max thực tế, chạy tìm design system và React navigation, đọc reference Floria và chụp browser. Font Be Vietnam Pro tự host có subset tiếng Việt.

## Môi trường và kết quả

Windows, Node v24.21.0, Python 3.14.2, React 19.2.0, Vite 7.3.7. Kiểm thử frontend không yêu cầu Java; không dùng kết quả này đóng gate Java/backend. Dependency: browser Chromium Playwright; frontend dev tại 127.0.0.1:5173 proxy Gateway thật 127.0.0.1:58080; Docker không kiểm tra độc lập trong lượt này. Không chạy DB/broker suite.

Các lệnh sau chạy từ `frontend/`, checkout dirty trên revision nêu trên:

| Lệnh | Kết quả | Run / failed / errors / skipped |
|---|---|---|
| `npm run build` | PASS, TypeScript và Vite production | Không phải test suite |
| `npm run test:contracts` | PASS, API/client/auth synthetic | 8 / 0 / 0 / 0 |
| `node scripts/cinematic-ui-check.mjs` | PASS, header/fullbleed/overflow 375/768/1440/1920; menu, Escape, reduced motion; showcase chọn ảnh và tên từ fixture | 22 / 0 / 0 / 0 |
| `node scripts/editorial-ui-check.mjs` | PASS, Gateway read-only và fixture search/category/cursor/auth/favorite/error/loading | 32 / 0 / 0 / 0 |

Browser cinematic: ảnh chụp lúc mở, sau cuộn 150px, giữa trang và hover ảnh, menu mobile, showcase fixture. Đã xem ảnh chụp desktop toàn trang, mobile toàn trang và trạng thái header. Không thấy tràn ngang trong các viewport đã chạy. Nội dung review/showcase trên Gateway đang thiếu dữ liệu du lịch thật; test showcase dùng API tổng hợp chỉ trong browser, không ghi dữ liệu vào backend.

## Lịch sử lỗi và cách xử lý

- Lệnh build đầu tiên chạy nhầm thư mục gốc: ENOENT package.json; chuyển đúng `frontend/`, build PASS hai lần, lần cuối sau sửa headline.
- Cinematic run đầu fail kiểm tra header trong suốt do chuỗi tiếng Việt bị mã hóa sai trong điều kiện; sửa source. Run sau qua viewport nhưng timeout showcase vì route fixture `**/api/**` bắt nhầm module Vite `/src/shared/api/`; đổi predicate chỉ bắt pathname bắt đầu `/api/`. Run cuối 22/22 PASS. Đây là lỗi source/test harness đã sửa, không coi các run fail trước là PASS.
- Bộ editorial đổi assertion màu nền dark từ thiết kế trước sang token mới #0b1411, run 32/32 PASS. Không thay assertion nghiệp vụ.

## Artifact và giới hạn

Ảnh runtime ở `backend/infra/.local/cinematic-v3/`: `before.png`, `landing-{375,768,1440,1920}.png`, `scrolled-*.png`, `mobile-menu.png`, `middle-hover.png`, `showcase-fixture.png`, `floria-reference.png`; report 22 checks tại `report.json`. File bị ignore chỉ là artifact đối chiếu; bảng trên là evidence đã lọc chính thức.

F-14 dữ liệu Catalog thật và F-15 hiệu năng vẫn OPEN. Chưa đo lại Lighthouse/CLS/LCP, chưa kiểm screen reader/contrast tự động toàn bộ app, chưa chạy E2E Business/Admin hay CI remote. Nền hero dùng ảnh panorama sẵn có, crop mobile mạnh; nên bổ sung ảnh dọc có giấy phép khi chuẩn bị nghiệm thu. Public collection không có endpoint liệt kê toàn bộ nên không tự bịa feed. Không nâng LOCAL_VERIFIED toàn task P03-07.

Phần giao diện landing trong evidence [travel editorial](2026-10-22-frontend-travel-editorial.md) được thay thế bởi V3 ngày 22/10/2026; lịch sử kiểm thử cũ được giữ nguyên.
