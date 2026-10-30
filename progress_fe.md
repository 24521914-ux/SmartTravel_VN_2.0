# Tiến độ Frontend (FE) — SmartTravel VN

Cập nhật: **30/10/2026 21:16** (GMT+7)

Progress gồm **hai file**: file này (`progress_fe.md`) cho frontend web; [`progress_be.md`](progress_be.md) cho backend và **trạng thái kết nối BE ↔ FE từng API** (mục 9 của file đó). Quy ước trạng thái, tiêu chuẩn PASS và cách cập nhật dùng chung: `progress_be.md` mục 2.

Phạm vi FE hiện tại: **chỉ web** (React). Ứng dụng di động chưa thuộc scope (vấn đề F-17).

## Mục lục

1. [Đọc nhanh](#1-đọc-nhanh)
2. [Cấu trúc frontend](#2-cấu-trúc-frontend)
3. [Màn hình và trạng thái kết nối](#3-màn-hình-và-trạng-thái-kết-nối)
4. [P00 — Khung frontend](#4-p00--khung-frontend)
5. [P01 — API client](#5-p01--api-client)
6. [P02 — Gọi Gateway thật](#6-p02--gọi-gateway-thật)
7. [P03 — Kiểm thử và thiết kế lại giao diện](#7-p03--kiểm-thử-và-thiết-kế-lại-giao-diện)
8. [P04 — Triển khai](#8-p04--triển-khai)
9. [Việc FE còn phải làm](#9-việc-fe-còn-phải-làm)
10. [Vấn đề đang mở liên quan FE](#10-vấn-đề-đang-mở-liên-quan-fe)
11. [Lệnh chạy và kiểm thử](#11-lệnh-chạy-và-kiểm-thử)
12. [Lịch sử cập nhật](#12-lịch-sử-cập-nhật)

---

## 1. Đọc nhanh

| Phase FE | Mục tiêu | Trạng thái | Đã kiểm ở mức | Việc tiếp theo |
|---|---|---|---|---|
| **P00** Khung | React/TS/Vite chạy, dev proxy | `LOCAL_VERIFIED` | Local + CI P00 frontend PASS | — |
| **P01** API client | Client 6 service, auth, refresh xoay vòng, If-Match, Idempotency-Key | `LOCAL_VERIFIED` | `test:contracts` 8/8 (23/10/2026, merge `eed140a`) | Owner N2 nhờ N1 review |
| **P02** Gọi Gateway | Màn nghiệp vụ gọi Gateway thật, lỗi hiện rõ | `PARTIAL` (hạ 23/10/2026) | UI cũ: `test:gateway`, `test:browser` PASS; UI mới: chưa chạy | Sửa F-22, F-23; chạy lại test với Gateway |
| **P03** Kiểm thử + giao diện mới | Responsive, bàn phím, loading/error/empty; thiết kế editorial | `PARTIAL` (hạ 23/10/2026) | UI mới: test giả lập API trên checkout dirty | Cập nhật `browser-nonai.mjs` theo UI mới; tối ưu LCP (F-21) |
| **P04** Triển khai | Build production, hosting, same-origin với Gateway | `NOT_STARTED` | — | Chờ gate P03 |

**Kết nối BE ↔ FE (chi tiết `progress_be.md` mục 9):** 0 ✅ · 27 🟡 đã nối, chưa kiểm · 9 ❌ lỗi · 121 ⚪ chưa thực hiện · 14 ⏸️ hoãn (AI) · 1 ➖.

**Tóm tắt một dòng:** giao diện đã được thiết kế lại hoàn toàn (editorial, header kính nổi, module `features/*`), build và contract test PASS. Tuy nhiên UI mới gửi sai contract ở 5 API, có 4 form chỉ báo thành công mà không gọi API, và nhiều màn tự tạo dữ liệu giả khi API lỗi. Vì vậy **chưa dùng được với backend thật** cho các thao tác ghi (F-22, F-23).

**Người phụ trách:** N2 sở hữu cấu hình chung và màn Community/Trip/Intelligence; N1 làm màn auth/tìm kiếm/doanh nghiệp/admin ingestion. Review chéo.

---

## 2. Cấu trúc frontend

| Thành phần | Nội dung |
|---|---|
| Stack | React 19.2, TypeScript 5.9, Vite 7.3; font Be Vietnam Pro (`@fontsource`) + Playfair Display; icon `@phosphor-icons/react`; Playwright cho test trình duyệt |
| Chạy dev | `http://127.0.0.1:5173`; Vite proxy `/api` → Gateway (`P02_GATEWAY_TARGET`, mặc định `http://127.0.0.1:58080`) |
| `src/main.tsx` → `src/app/App.tsx` | Entry. App tải các màn bằng `React.lazy`, điều hướng theo hash route |
| `src/app/providers/` | `AuthProvider` (login, refresh, logout, tải `/me`), `ToastProvider` (thông báo) |
| `src/app/layouts/LayoutShell.tsx` | Header trong suốt → kính nổi khi cuộn > 60 px, menu theo vai trò (Thông báo khi đăng nhập; Doanh nghiệp cho BUSINESS/ADMIN; Kiểm duyệt, Quản trị cho ADMIN), footer |
| `src/features/*` | `places` (Khám phá, chi tiết, bản đồ, card, section landing), `collections`, `trips` (TripPlanner), `notifications`, `account`, `businesses`, `moderation`, `ingestion` |
| `src/shared/` | `api` (re-export `src/api/*`), `ui` (Button, Input, Modal, Badge, RatingStars, EmptyState, ErrorState, LiquidGlassNav, Icon), `styles` (tokens, liquid-glass, app, editorial, cinematic), `motion`, `config/features.ts` |
| `src/api/` | Client giữ nguyên: Bearer, `If-Match`, `Idempotency-Key`, correlation ID, refresh dùng chung một request; `places()` thêm tham số `categoryId`, `cursor`, `limit` |
| `public/images/editorial/` | Ảnh Ninh Bình, Hội An, Hạ Long (WebP) kèm tác giả/giấy phép trong `credits.json` |
| `design-system/smarttravel-vn/` | Tài liệu thiết kế (MASTER, FRONTEND_DESIGN_SPECIFICATION, TRAVEL_EDITORIAL, CINEMATIC_V3, CLAY_INTERFACE, trip-planner) |
| Code cũ không còn dùng | `TravelApp.tsx`, `OperationalPanels.tsx`, `TripEditor.tsx`, `ScreenGuide.tsx`, `LiquidGlassNav.tsx`/`Icon.tsx` ở gốc `src`, `clay.css`, `travel.css`, `styles.css`, `tokens.css` ở gốc `src` (F-24) |

> **Lưu ý:** token access + refresh lưu trong `localStorage` (`browserTokenStore`, khóa `smarttravel.auth`) để giữ phiên khi tải lại trang. Cần đánh giá rủi ro XSS trước P04. Cờ `VITE_AI_ENABLED=false` ẩn mọi phần AI.

---

## 3. Màn hình và trạng thái kết nối

| Màn hình | Đã làm được | Kết nối | Còn thiếu / lỗi |
|---|---|---|---|
| Trang chủ (landing) | Hero full-bleed, ô tìm kiếm, khối editorial bất đối xứng, showcase đánh giá, CTA | 🟡 `GET /places`, `GET /places/{id}/reviews` | Dữ liệu catalog chỉ có bản ghi kiểm thử (F-20); LCP 4,0 s (F-21) |
| Khám phá | Tìm theo từ khóa + danh mục, phân trang cursor, skeleton/empty/error/retry, lưu/bỏ yêu thích | 🟡 `GET /places`, `GET /categories`, `PUT/DELETE /me/favorites` | Lọc vùng/giá/rating/bán kính; ảnh (❌ F-14) |
| Chi tiết địa điểm | Thông tin, đánh giá, dịch vụ (offering), viết đánh giá, lưu yêu thích, thêm vào chuyến đi | 🟡 reviews, offerings, `POST reviews`, favorites | Favorite ở đây đảo trạng thái + báo thành công khi API lỗi (F-23); địa chỉ thiếu thì hiện "Việt Nam" |
| Bản đồ | Tìm địa điểm, xem vị trí | 🟡 `GET /places` | Nhiều marker, vẽ tuyến |
| Bộ sưu tập | Danh sách, tạo, xem địa điểm trong collection | 🟡 | Tạo lỗi vẫn báo thành công (F-23); **mất** thêm địa điểm vào collection, xem chi tiết collection |
| Chuyến đi (TripPlanner) | Danh sách, tạo, thêm ngày, thêm địa điểm vào ngày | 🟡 danh sách/ngày/item; ❌ tạo trip, thêm item | Tạo trip và thêm item gửi sai body → 400, UI tạo bản ghi giả (F-22, F-23); **mất** khóa/mở khóa item, xem chi tiết trip |
| Thông báo | Danh sách, đánh dấu đã đọc | 🟡 | — |
| Tài khoản | Đăng nhập, đăng xuất, hồ sơ, tab Bảo mật, tab Sở thích | 🟡 login/refresh/logout/`/me`; ❌ đổi mật khẩu | Form đổi mật khẩu báo thành công nhưng không gọi API (F-22); tab Sở thích là danh sách tag cứng, không lưu; **mất** đăng ký, xác minh email, đổi tên, yêu cầu xóa dữ liệu |
| Doanh nghiệp | Danh sách, tạo, thành viên, tab xác minh, tab claim | 🟡 danh sách/thành viên; ❌ tạo, xác minh, claim | Tạo gửi field ngoài schema → 400, UI tạo bản ghi giả; xác minh và claim chỉ báo thành công, không gọi API (F-22, F-23) |
| Kiểm duyệt (admin) | Danh sách review/địa điểm, duyệt review, đổi trạng thái địa điểm, form xét duyệt KYC | 🟡 review/địa điểm; ❌ KYC | Lỗi API vẫn báo thành công và xóa dòng khỏi danh sách (F-23); form KYC không gọi API (F-22); thiếu API hàng chờ (F-16) |
| Quản trị (admin) | Danh sách nguồn dữ liệu, tạo import job | 🟡 nguồn; ❌ import job | Gọi `.../jobs` với `run_mode`/`dry_run` thay vì `.../import-jobs` với `mode`; UI tạo job giả (F-22, F-23); **mất** theo dõi trạng thái job |
| Gợi ý | Ẩn khi AI tắt | ⏸️ | Bật khi tiếp tục phần AI |

---

## 4. P00 — Khung frontend

- [x] FE-P00-01: Khung React/TypeScript/Vite, build, dev proxy — **LOCAL_VERIFIED** · `npm run build` PASS, `npm audit` 0 lỗ hổng (08/10/2026) · CI P00 frontend PASS run 39540804336.
- [x] FE-P00-02: Landing page đầu tiên — **LOCAL_VERIFIED** · PR #3. Thay thế bởi landing editorial (mục 7).

## 5. P01 — API client

- [x] FE-P01-01: Client 6 service theo prefix Gateway; giữ tên field snake_case của contract — **LOCAL_VERIFIED** · `npm run test:contracts` 8/8, 0 fail/skip (23/10/2026, merge `eed140a`, Node 24.15.0) · PR #15.
- [x] FE-P01-02: Bearer, `If-Match`, `Idempotency-Key`, trace; xử lý 204, lỗi domain, xung đột version, timeout, JSON hỏng — **LOCAL_VERIFIED** · test "requests preserve bearer, version, idempotency, trace and JSON fields", "204 and domain errors preserve status and trace".
- [x] FE-P01-03: Refresh xoay vòng dùng chung một request; refresh muộn không ghi đè login mới; logout chờ refresh xong — **LOCAL_VERIFIED** · 4 test refresh/logout trong `mock-contract-test.mjs`.
- [x] FE-P01-04: Tìm kiếm giữ Unicode, `categoryId`, cursor qua nhiều trang — **LOCAL_VERIFIED** · test "catalog search preserves Unicode, category and opaque cursor across pages".
- [ ] Review FE P01 (N1) — **NOT_STARTED**.

## 6. P02 — Gọi Gateway thật

- [ ] FE-P02-01: Màn nghiệp vụ gọi Gateway thật; lỗi và trạng thái chờ hiện rõ — **PARTIAL** (hạ từ `LOCAL_VERIFIED` ngày 23/10/2026) · Bằng chứng cũ: `test:gateway` PASS 11/10/2026 và CI `connected` run 39540804333 trên UI cũ · Lý do hạ: UI mới báo thành công khi API lỗi (F-23) và gọi sai contract (F-22) · Tương ứng P02-09 bên BE.
- [ ] FE-P02-02: Hiển thị trạng thái chờ ack (xác minh doanh nghiệp, import job) — **PARTIAL** (hạ 23/10/2026) · UI mới báo "đã gửi"/"đã tiếp nhận" mà không gọi API hoặc khi API lỗi.
- [ ] FE-P02-03: Nối đủ API không AI của backend — **PARTIAL** · UI mới gọi 36/157 API (27 🟡, 9 ❌); 12 API UI cũ từng dùng nay bị mất · Next: mục 9.
- [ ] FE-P02-04: Bỏ fallback dữ liệu giả, hiện lỗi thật, sửa body/path theo contract — **IN_PROGRESS** · Người làm: Codex, nhánh `fix/frontend-backend-integration` · Đang sửa F-22/F-23, khôi phục chức năng mất và kiểm thử trình duyệt qua Gateway thật; chưa đóng gate.

## 7. P03 — Kiểm thử và thiết kế lại giao diện

**Bằng chứng giao diện mới** (theo ghi chép nhánh FE, checkout dirty `cfd121d` → `544dd08`, Windows, Node 24.21.0, Chromium Playwright):
- `npm run test:ui` (`clay-ui-check.mjs`): 52 kiểm tra, 0 fail, API giả lập; 9 màn × 375/768/1440 px, màn con, trạng thái rỗng/lỗi, reduced motion.
- `npm run test:ui:editorial` (`editorial-ui-check.mjs`): 32 kiểm tra, 0 fail; 375/430/768/1366/1920 px, menu, Escape, tìm kiếm/danh mục/cursor, favorite thành công/thất bại, loading/empty/error. Chức năng dùng API giả lập; ảnh chụp đọc Gateway thật.
- `cinematic-ui-check.mjs`: 22 kiểm tra, 0 fail; header, hero, menu, reduced motion.
- Lighthouse (preview production local, mobile): Performance 80, Accessibility 100, Best Practices 100, SEO 100; LCP 4,0 s, TBT 180 ms, CLS 0.
- Lịch sử lỗi đã sửa: matcher `**/api/**` bắt nhầm module `/src/api/`; Escape khi focus nút menu; selector trùng.

**Kiểm lại ngày 23/10/2026 trên merge `eed140a`** (Windows, Node 24.15.0): `npm ci` OK, `npm run build` PASS, `npm run test:contracts` 8/8. Không chạy được test trình duyệt (máy chưa cài Chromium Playwright) và test Gateway (không có Python/Docker).

- [ ] FE-P03-01 (P03-07): Test trình duyệt phạm vi không AI qua Gateway thật — **PARTIAL** (hạ từ `LOCAL_VERIFIED` ngày 23/10/2026) · Bằng chứng cũ: `browser-nonai.mjs` 8 nhóm, 36 case responsive, CI run 39540804333 trên UI cũ · Thiếu: cập nhật script theo UI mới và chạy lại.
- [x] FE-P03-02: Tắt AI mặc định (`VITE_AI_ENABLED=false`) — **LOCAL_VERIFIED** · UI mới vẫn ẩn Gợi ý, model admin · PR #20.
- [ ] FE-P03-03: Thiết kế lại giao diện (editorial, header kính nổi, typography, responsive) — **PARTIAL** · test giả lập 52 + 32 + 22 PASS (dirty) · Thiếu: CI run, kiểm với Gateway, LCP < 2,5 s (F-21), dữ liệu thật (F-20).
- [ ] FE-P03-04: Kiểm thử accessibility đầy đủ (WCAG, screen reader) — **NOT_STARTED** · Hiện có Lighthouse Accessibility 100, focus/Escape, reduced motion.
- [ ] FE-P03-05: Test UI phần AI (`test:browser:ai`) — **DEFERRED** (người dùng, 20/10/2026).
- [ ] FE-P03-06: Dọn code cũ và cập nhật script test cũ theo UI mới — **NOT_STARTED** · F-24.

## 8. P04 — Triển khai

- [ ] FE-P04-01: Build production và hosting cùng domain với Gateway (không dùng Vite proxy) — **NOT_STARTED**.
- [ ] FE-P04-02: Cấu hình CORS/origin production ở Gateway (`CORS_ALLOWED_ORIGINS`) — **NOT_STARTED**.
- [ ] FE-P04-03: Smoke sau triển khai user/admin/business/trip/map — **NOT_STARTED**.

---

## 9. Việc FE còn phải làm

| Ưu tiên | Việc | API backend đã sẵn | Phụ thuộc |
|---|---|---|---|
| 1 | Bỏ fallback dữ liệu giả; khi API lỗi hiện lỗi thật và giữ nguyên trạng thái | — | F-23 |
| 2 | Sửa lời gọi sai: `POST /businesses` chỉ gửi `name`; `POST /me/trips` gửi `timezone`, `currency`, `budget`; `POST .../items` gửi `locked`, `recommendation_request_id`, bỏ `start_time`; import dùng `POST /admin/data-sources/{id}/import-jobs` với `mode` | Có | F-22 |
| 3 | Nối 4 form đang giả: đổi mật khẩu, gửi xác minh, claim, xét duyệt KYC | `PUT /me/password`, `POST .../verification`, `POST .../claims`, `POST /admin/business-verifications/{id}/review` | F-22 |
| 4 | Cập nhật `browser-nonai.mjs` theo UI mới, chạy `test:browser` và `test:gateway` với stack P02 | — | Python, Docker, Chromium |
| 5 | Khôi phục chức năng bị mất: đăng ký, xác minh email, đổi tên, preferences thật, yêu cầu xóa dữ liệu, thêm địa điểm vào collection, khóa item trip, theo dõi import job | Có | — |
| 6 | Hiển thị ảnh địa điểm/review | Cần sửa backend trước | F-14 |
| 7 | Bộ lọc vùng/destination/giá/rating/bán kính; quên/đặt lại mật khẩu; quản lý phiên | Có | F-15 |
| 8 | Favorite, review, collection, trip đầy đủ (sửa/xóa/sắp xếp, chặng, di chuyển, ước tính tuyến) | Có | — |
| 9 | Đóng góp dữ liệu; admin Catalog, user, report, ingestion chi tiết | Có | F-16 |
| 10 | Tối ưu LCP; dọn code cũ | — | F-21, F-24 |

---

## 10. Vấn đề đang mở liên quan FE

Danh sách đầy đủ và trạng thái: `progress_be.md` mục 10.

| ID | Mức | Ảnh hưởng tới FE |
|---|---|---|
| F-22 | Cao | 5 API gọi sai body/path, 4 form chỉ báo thành công mà không gọi API |
| F-23 | Cao | Khi API lỗi, UI tạo bản ghi giả và báo thành công; người dùng tưởng đã lưu |
| F-14 | Cao | Không upload được ảnh; ảnh cần JWT nên `<img>` không tải được |
| F-15 | Trung bình | Contract Place thiếu `address`, `description`, `rating_avg`, `review_count`, `media` |
| F-16 | Trung bình | Không có API hàng chờ duyệt cho admin/doanh nghiệp |
| F-17 | Trung bình | Chưa có scope di động |
| F-18 | Trung bình | UI mới gọi 36/157 API không AI; 12 API bị mất so với UI cũ |
| F-20 | Trung bình | Catalog local chỉ có dữ liệu kiểm thử; cần dữ liệu du lịch thật và media có giấy phép |
| F-21 | Trung bình | LCP 4,0 s trên mobile (mục tiêu < 2,5 s) |
| F-24 | Thấp | Code FE cũ không còn dùng; script test cũ chưa khớp UI mới |

---

## 11. Lệnh chạy và kiểm thử

Chạy từ thư mục gốc repo; Node 24.

| Mục đích | Lệnh | Ghi chú |
|---|---|---|
| Cài đặt | `npm --prefix frontend ci` | |
| Cài trình duyệt cho test | `npx --prefix frontend playwright install chromium` | Một lần trên mỗi máy |
| Chạy dev | `npm --prefix frontend run dev` | Cần Gateway P02 ở `127.0.0.1:58080` hoặc đặt `P02_GATEWAY_TARGET` |
| Contract client | `npm --prefix frontend run test:contracts` | Không cần backend |
| Build | `npm --prefix frontend run build` | `tsc --noEmit` + Vite build |
| UI giả lập API | `npm --prefix frontend run test:ui` · `test:ui:editorial` · `node frontend/scripts/cinematic-ui-check.mjs` | Cần dev server; không chứng minh kết nối backend |
| Gateway thật | `npm --prefix frontend run test:gateway` | Cần stack P02 (`python backend/infra/p02.py up`) |
| Trình duyệt với Gateway | `npm --prefix frontend run test:browser` | Cần stack P02 + dev server; **cần cập nhật theo UI mới** (F-24) |
| Bật AI khi làm phần AI | `VITE_AI_ENABLED=true` (FE) và `AI_ENABLED=true` (Gateway) | Phải bật cả hai |

---

## 12. Lịch sử cập nhật

| Thời điểm | Thay đổi | PR / commit |
|---|---|---|
| 23/10/2026 01:05 | Merge frontend v4 vào cấu trúc progress BE/FE; ghi lại màn hình UI mới, hạ FE-P02-01/02 và P03-07 xuống `PARTIAL`, thêm F-20…F-24 | Merge `eed140a` |
| 23/10/2026 00:10 | Header kính nổi, typography editorial, bố cục ảnh bất đối xứng (v4) | `544dd08`, `949a941` (nhánh `feature/frontend-floria-v4-refinement`) |
| 22/10/2026 | Landing editorial, cinematic v3, giao diện clay; module `features/*`, `shared/ui` | Nhánh FE (gộp trong merge `eed140a`) |
| 22/10/2026 23:50 | Tạo `progress_fe.md` khi tách progress BE/FE (trước ghi nhầm 16:50 do lấy giờ UTC) | `e028c46` |
| 21/10/2026 | UI đa vùng, thanh điều hướng kính, thông báo lỗi kết nối Gateway | `8bb6c7c`…`cfd121d` |
| 21/10/2026 11:00 | Tắt AI mặc định, test trình duyệt không AI | PR #20, `c1e8e29` |
| 15/10/2026 | Màn nghiệp vụ gọi Gateway thật | PR #16, `14b342c` |
| 15/10/2026 | API client + refresh xoay vòng | PR #15, `42eac23` |
| 08/10/2026 | Khung React/TS/Vite (P00); landing page | PR #2, PR #3 |
