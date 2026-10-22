# Frontend travel editorial, Phase 1–2 của brief redesign

Cập nhật lần cuối: 22/10/2026 · Revision: `cfd121d` (dirty, nhánh `feature/frontend-travel-editorial`) · Người cập nhật: coding agent.

## Phạm vi và trạng thái

P03-07 giữ **PARTIAL**. Đã triển khai nền tảng giao diện, navbar và landing page theo brief người dùng ngày 22/10/2026. Chưa có CI trên revision cuối, chữ ký owner/reviewer hoặc kiểm thử đầy đủ các màn user/business/admin. Không đóng gate, không mở P04.

Checkout đầu phiên đã dirty trên `feature/frontend-core-ui`, có thay đổi frontend/progress và các module chưa được theo dõi. Tạo nhánh `feature/frontend-travel-editorial` tại HEAD để bảo toàn toàn bộ công việc; không checkout/pull main vì các thay đổi chưa commit này. Không stash/reset, không commit hoặc push. Evidence cũ về claymorphism giữ nguyên; phần hình thức navbar/landing được thay thế bởi lượt này.

## Thay đổi có thể kiểm lại

- Đã đọc đầy đủ Taste Skill local, audit giao diện thật và chụp ảnh trước. Bản local chỉ có SKILL.md; không có scripts tìm ảnh/chọn art direction/inspection của upstream mới. Không tuyên bố chạy script không tồn tại. Dùng Playwright Chromium để chụp và xem screenshot.
- `ui-ux-pro-max`: truy vấn design-system ban đầu trả Aurora UI, không phù hợp brief nên không áp dụng; truy vấn style/ux riêng lấy nguyên tắc grid, hierarchy, keyboard/focus. [Định hướng thiết kế](../../design-system/smarttravel-vn/TRAVEL_EDITORIAL.md).
- Hero Tam Cốc thật, search nối hero, màu teal/off-white/sand, Be Vietnam Pro tự host; theme tối theo hệ thống, reduced motion/transparency, skip link và focus ring.
- Navbar giữ nhãn/hash route, indicator theo route, menu theo trạng thái/role thực tế; sửa CSS ghi đè hidden, bố cục menu mobile, Escape và trả focus. Đây chỉ là điều hướng; authorization vẫn do backend thực hiện.
- Card bỏ fallback ảnh đường phố Nhật và rating 4.8/42 giả. Thiếu ảnh dùng placeholder trung tính, thiếu rating không tự thêm. Detail chỉ sửa rating/mô tả giả để không mâu thuẫn khi đi từ card, chưa redesign toàn màn.
- Search gửi `q`, `categoryId`, `cursor`, `limit` đúng contract Catalog. Danh mục lấy từ API. Có chống response cũ ghi đè truy vấn mới, skeleton, empty/error/retry. Favorite chỉ đổi trạng thái sau ack, báo lỗi khi thất bại, khách được đưa đến tài khoản.
- Nội dung biên tập Ninh Bình/Hội An/Hạ Long tách riêng khỏi kết quả API. Ảnh WebP local có tác giả, giấy phép, liên kết nguồn và chỉnh sửa trong footer/manifest. Không dùng ảnh AI làm ảnh địa điểm thực.
- Contract Community không có endpoint duyệt danh sách collection công khai; landing dẫn đến công cụ collection hiện có, không bịa collection/review công khai.
- Tách tải các màn ngoài landing bằng React.lazy/Suspense; thêm preload hero, favicon, robots.txt. Giữ metadata và route hiện có.

## Môi trường

Các file sửa/thêm trong lượt này:

- `frontend/src/features/places/ExploreSection.tsx`, `PlaceCard.tsx`, `PlaceDetailPage.tsx`.
- `frontend/src/app/App.tsx`, `frontend/src/app/layouts/LayoutShell.tsx`, `frontend/src/shared/ui/LiquidGlassNav.tsx`.
- `frontend/src/shared/styles/editorial.css`, `frontend/src/shared/styles/tokens.css`, `frontend/src/main.tsx`.
- `frontend/src/api/travel.ts`, `frontend/scripts/mock-contract-test.mjs`, `frontend/scripts/editorial-ui-check.mjs`, `frontend/scripts/source-editorial.py`.
- `frontend/package.json`, `frontend/package-lock.json`, `frontend/index.html`, `frontend/public/robots.txt`, `frontend/public/images/editorial/` (ba ảnh và manifest).
- `design-system/smarttravel-vn/TRAVEL_EDITORIAL.md`, ba file mục lục/checklist trong `progress/` và evidence này.

Các thay đổi dirty khác trong `git status` đã có từ đầu phiên, không nhận là sản phẩm của lượt này.

Windows, Node `v24.21.0`, Python `3.14.2`, Docker CLI `29.4.0`. Frontend React `19.2.0`, Vite `7.3.7`, TypeScript `5.9.3`; Chromium từ Playwright. Không chạy Java/Maven trong lượt frontend này. Gateway thật đang nghe `127.0.0.1:58080`, dev frontend `127.0.0.1:5173`; preview production `127.0.0.1:5176`.

Ảnh thực tải qua Wikimedia API bằng `python frontend/scripts/source-editorial.py --download` (cần Pillow); manifest [credits.json](../../frontend/public/images/editorial/credits.json). Tải ảnh có một lần HTTP 429 trước khi tải thành công; không liên quan kết quả test.

## Lệnh và kết quả

Chạy tại `frontend/`, revision `cfd121d`, checkout dirty:

| Lệnh | Kết quả | Dependency/giới hạn |
|---|---|---|
| `npm run build` | PASS, TypeScript và Vite exit 0 | Build production; không phải nghiệm thu nghiệp vụ |
| `npm run test:contracts` | 8 chạy, 8 pass, 0 failure/error/skip | Fetch tổng hợp; test mới kiểm Unicode, category, opaque cursor và query rỗng |
| `npm run test:ui:editorial` | 32 kiểm tra, 0 failure/error/skip ở lượt cuối | Screenshot đọc Gateway thật; kiểm thử chức năng dùng API tổng hợp, không mutation database thật |

JavaScript entry production giảm từ 374.00 kB (gzip 104.57 kB) xuống 326.43 kB (gzip 95.78 kB), các màn khác tải theo nhu cầu.

### Kiểm tra giao diện

- 375, 430, 768, 1366, 1920px: không tràn ngang; hero tải được. Xem screenshot desktop, mobile và dark mode; menu mobile xếp dọc, Escape đóng và trả focus. Chụp thêm laptop 1366×768 và mobile 375×900 để kiểm first screen/CTA.
- Kiểm riêng guest/admin menu, dropdown ẩn mặc định, thiếu ảnh/rating, fixture giữ tên gốc và không được giới thiệu như địa điểm thật, search/category/cursor append, favorite thành công/thất bại, guest chuyển tài khoản, loading/empty/error/retry, reduced motion. Không có `pageerror` ở lượt cuối.
- Không coi screenshot live là test đầy đủ E2E backend hoặc bằng chứng role/security của toàn hệ thống.

Giữ lịch sử chạy: 6 lượt UI, 4 lượt fail và 2 lượt pass. Lượt 1 phát hiện Escape khi focus ở nút mở menu; đã sửa xử lý ở header. Lượt 2 harness chặn nhầm module `/src/api/`, sửa predicate chỉ chặn pathname `/api/`. Lượt 3 harness đổi localStorage nhưng chỉ điều hướng hash, sửa reload để nạp session. Lượt 4 PASS 30/30. Lượt 5 sau khi thêm fixture gặp selector nhiều phần tử, sửa selector. Lượt 6 PASS 32/32 sau các sửa source cuối. Đây là các lỗi xác định đã sửa, không retry không đổi code để chọn kết quả đẹp; không xóa lịch sử fail.

### Visual inspection và điều chỉnh

Ảnh trước: `backend/infra/.local/travel-before.png`. Vòng đầu: `backend/infra/.local/travel-round1.png`. Các vấn đề lớn đã sửa: thanh search che tên địa danh, indicator navbar vuông, empty state quá lớn. Sau đó sửa nhãn đăng nhập xuống dòng ở mobile. Bộ ảnh cuối tại `backend/infra/.local/travel-editorial/`: `live-375.png`, `live-430.png`, `live-768.png`, `live-1366.png`, `live-1920.png`, `live-dark.png`, `mobile-menu.png`, `synthetic-cards.png`, `empty.png`, `error.png`, `mobile-first-screen.png`, `laptop-first-screen.png`. Đây là artifact local bị ignore; nội dung đã lọc ở evidence này mới là bản trạng thái chính thức.

### Lighthouse local

Lệnh PowerShell tại `frontend/`:

```powershell
$env:CHROME_PATH='C:\Users\ASUS\AppData\Local\ms-playwright\chromium-1248\chrome-win64\chrome.exe'
npx --yes lighthouse http://127.0.0.1:5176 --output=json --output-path=../backend/infra/.local/travel-editorial/lighthouse-final.json --chrome-flags="--headless --no-sandbox" --only-categories=performance,accessibility,best-practices,seo --quiet
```

Lighthouse `13.5.0`, mobile/throttling mặc định, preview production local. Hai lượt: đầu 69/98/96/92, cuối Performance **80**, Accessibility **100**, Best Practices **100**, SEO **100**. LCP 4.0s, TBT 180ms, CLS 0. Không còn binary audit fail. Chưa đạt mục tiêu LCP <2.5s; **không** tuyên bố performance đạt gate hay WCAG 2.2 AA đầy đủ. Một phép đo cuối không đại diện production hoặc INP người dùng thật. Giữ báo cáo đầu và cuối trong `.local/travel-editorial/`.

## Findings và việc tiếp theo

- F-14: Gateway thật trả tên P02/P03 trong danh mục public; giữ tên gốc trong disclosure được ghi rõ là dữ liệu kiểm thử (nhận diện theo tiền tố quan sát được). Cần owner Catalog chuẩn bị/kiểm dữ liệu du lịch thật và URL media được cấp phép; frontend không sửa database hoặc tự đổi tên.
- F-15: LCP local còn 4.0s trên mobile giả lập. Cần đo lại và tối ưu trước nghiệm thu performance; không suy từ điểm accessibility 100 ra chứng nhận WCAG.
- Phase tiếp theo của redesign: Explore & Place Detail, sau đó Trip Planner, rồi user/business/admin. AI vẫn deferred. Các luồng mutation khác trong module cũ chưa được kiểm lại trong lượt này.
- Chưa chạy lại các harness clay/non-AI cũ: chúng giả định guest lưu yêu thích thành công và mọi role đều có menu quản trị, khác hành vi được yêu cầu lần này. Chưa kiểm toàn bộ endpoint trên backend thật hoặc CI remote.
