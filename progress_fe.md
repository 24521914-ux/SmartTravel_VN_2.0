# Tiến độ Frontend (FE) — SmartTravel VN

Cập nhật: **30/10/2026 22:05** (GMT+7)

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
| **P01** API client | Client, refresh, If-Match, idempotency | `LOCAL_VERIFIED` | `test:contracts` 15/0/0/0, source `4e020e1` | N1/N2 review |
| **P02** Gọi Gateway | Màn nghiệp vụ thực, lỗi/pending rõ | `PARTIAL` | Gateway/browser P02 thật PASS, không ghi giả; còn scanner F-14 | Kiểm hai nhánh media khi có scanner thật |
| **P03** Kiểm thử + giao diện mới | Responsive, bàn phím, loading/error/empty | `PARTIAL` | Browser thật 9 nhóm +36 responsive và suite nghiệp vụ PASS | CI mới, LCP (F-21), WCAG đầy đủ |
| **P04** Triển khai | Build production, hosting, same-origin với Gateway | `NOT_STARTED` | — | Chờ gate P03 |

**Kết nối BE ↔ FE:** 158 ✅ · 2 🟡 · 0 ❌ · 0 ⚪ · 14 ⏸️ · 1 ➖. Danh sách và bằng chứng từng API chỉ ghi tại [progress_be.md mục 9](progress_be.md#9-kết-nối-be--fe).

**Tóm tắt một dòng:** FE hiện tại đã gọi Gateway thật, lưu/đọc lại dữ liệu P02 và hiện lỗi đúng; đã bỏ fallback ghi giả, sửa contract, bổ sung nghiệp vụ user/business/admin/trip/collection/ingestion. Chưa có dữ liệu du lịch production có giấy phép hoặc scanner thật theo xác nhận người dùng 30/10/2026; hai nhánh ảnh chưa xác nhận. AI vẫn hoãn; không cấp gate.

**Người phụ trách:** N2 sở hữu cấu hình chung và màn Community/Trip/Intelligence; N1 làm màn auth/tìm kiếm/doanh nghiệp/admin ingestion. Review chéo.

---

## 2. Cấu trúc frontend

| Thành phần | Nội dung |
|---|---|
| Stack | React 19.2, TypeScript 5.9, Vite 7.3; font Be Vietnam Pro (`@fontsource`) + Playfair Display; icon `@phosphor-icons/react`; Playwright cho test trình duyệt |
| Chạy dev | `http://127.0.0.1:5173`; Vite proxy `/api` → Gateway (`P02_GATEWAY_TARGET`, mặc định `http://127.0.0.1:58080`) |
| `src/main.tsx` → `src/app/App.tsx` | Entry. App tải các màn bằng `React.lazy`, điều hướng theo hash route |
| `src/app/providers/` | `AuthProvider` (login, refresh, logout, tải `/me`), `ToastProvider` (thông báo) |
| `src/app/layouts/LayoutShell.tsx` | Header trong suốt → kính nổi khi cuộn > 60 px, menu theo vai trò (Thông báo khi đăng nhập; Doanh nghiệp cho BUSINESS; Kiểm duyệt, Quản trị cho ADMIN), footer |
| `src/features/*` | `places` (Khám phá, chi tiết, bản đồ, card, section landing), `collections`, `trips` (TripPlanner), `notifications`, `account`, `businesses`, `moderation`, `ingestion` |
| `src/shared/` | `api` (re-export `src/api/*`), `ui` (Button, Input, Modal, Badge, RatingStars, EmptyState, ErrorState, LiquidGlassNav, Icon), `styles` (tokens, liquid-glass, app, editorial, cinematic), `motion`, `config/features.ts` |
| `src/api/` | Client giữ nguyên: Bearer, `If-Match`, `Idempotency-Key`, correlation ID, refresh dùng chung một request; `places()` thêm tham số `categoryId`, `cursor`, `limit` |
| `public/images/editorial/` | Ảnh Ninh Bình, Hội An, Hạ Long (WebP) kèm tác giả/giấy phép trong `credits.json` |
| `design-system/smarttravel-vn/` | Tài liệu thiết kế (MASTER, FRONTEND_DESIGN_SPECIFICATION, TRAVEL_EDITORIAL, CINEMATIC_V3, CLAY_INTERFACE, trip-planner) |
| Code cũ không còn dùng | `TravelApp.tsx`, `OperationalPanels.tsx`, `TripEditor.tsx`, `ScreenGuide.tsx`, `LiquidGlassNav.tsx`/`Icon.tsx` ở gốc `src`, `clay.css`, `travel.css`, `styles.css`, `tokens.css` ở gốc `src` (F-24) |

> **Lưu ý:** token access + refresh lưu trong `localStorage` (`browserTokenStore`, khóa `smarttravel.auth`) để giữ phiên khi tải lại trang. Cần đánh giá rủi ro XSS trước P04. Cờ `VITE_AI_ENABLED=false` ẩn mọi phần AI.

---

## 3. Màn hình và trạng thái kết nối

| Màn hình | Nghiệp vụ đã triển khai và kiểm thử | Phần còn thiếu |
|---|---|---|
| Trang chủ / Khám phá / Chi tiết / Bản đồ | Tải Catalog, cursor, favorite server, review ảnh, thêm trip; tọa độ thật, OSM opt-in; loading/error/empty | Dữ liệu production F-20; representation F-15; scanner F-14; LCP F-21 |
| Tài khoản | Đăng ký/verify/login/refresh/logout; quên/reset/đổi mật khẩu; hồ sơ, preferences/options/consent, session revoke, deletion request | Review và CI mới |
| Thông báo | Phân trang, đọc đúng notification_id, giữ trạng thái khi lỗi | Consumer backend thiếu một số event F-01 |
| Bộ sưu tập / Đánh giá / Đóng góp | CRUD, item/order/public/private; review pending/edit/delete/report; contribution ADD/EDIT/withdraw và APPLIED sau duyệt | Không có nhánh AI |
| Chuyến đi | CRUD/state/days/items/lock/order, destinations, transfers, route estimate fallback, snapshot; hiển thị field state đúng | Routing production chưa cấu hình, không bịa duration |
| Doanh nghiệp | CRUD, membership, verification, claims, yêu cầu sửa và đọc lại sau admin duyệt | Claim/KYC queue thiếu API, nhập ID tay F-16 |
| Quản trị / Kiểm duyệt | Catalog 7 nhóm tài nguyên, user role/status, reports/reviews/contributions, upload/media metadata/reject; ingestion source/policy/job/item/error/candidate/decision/retry/cancel | APPROVE cần scanner F-14; queue claim/KYC/media F-16 |
| Gợi ý | Ẩn khi AI tắt | Người dùng hoãn AI |

Bằng chứng theo màn: các suite A–I và revision tại [progress_be.md mục 9](progress_be.md#9-kết-nối-be--fe). Đây là dữ liệu P02 trên service/DB/broker thật, không phải bộ dữ liệu du lịch production.

---

## 4. P00 — Khung frontend

- [x] FE-P00-01: Khung React/TypeScript/Vite, build, dev proxy — **LOCAL_VERIFIED** · `npm run build` PASS, `npm audit` 0 lỗ hổng (08/10/2026) · CI P00 frontend PASS run 39540804336.
- [x] FE-P00-02: Landing page đầu tiên — **LOCAL_VERIFIED** · PR #3. Thay thế bởi landing editorial (mục 7).

## 5. P01 — API client

- [x] FE-P01-01: Client theo prefix Gateway và snake_case — **LOCAL_VERIFIED** · `test:contracts` 15/0/0/0, `build` PASS; source `4e020e1`, scripts `edb10cb`, Node24; bằng chứng cũ PR #15 giữ trong Git.
- [x] FE-P01-02: Bearer, `If-Match`, `Idempotency-Key`, trace; xử lý 204, lỗi domain, xung đột version, timeout, JSON hỏng — **LOCAL_VERIFIED** · test "requests preserve bearer, version, idempotency, trace and JSON fields", "204 and domain errors preserve status and trace".
- [x] FE-P01-03: Refresh rotation dùng chung một request theo đúng phiên; refresh cũ không ghi đè hoặc replay dưới user mới — **LOCAL_VERIFIED** · `mock-contract-test.mjs` regression concurrent refresh/session-switch/logout; `test:contracts` 15/0/0/0; `test:gateway` rotation/revoke thật PASS, `4e020e1`/`edb10cb`.
- [x] FE-P01-04: Tìm kiếm giữ Unicode, `categoryId`, cursor qua nhiều trang — **LOCAL_VERIFIED** · test "catalog search preserves Unicode, category and opaque cursor across pages".
- [ ] Review FE P01 (N1) — **NOT_STARTED**.

## 6. P02 — Gọi Gateway thật

- [x] FE-P02-01: Màn nghiệp vụ gọi Gateway thật, lỗi/pending rõ — **LOCAL_VERIFIED** (dirty) · suite F 9 nhóm +36 responsive, H login/me503 không báo giả; business/admin/trip suite PASS; `4e020e1`/`edb10cb`, môi trường và request count tại BE mục9. Tương ứng P02-09.
- [x] FE-P02-02: Pending ack khác thành công cuối — **LOCAL_VERIFIED** (dirty) · B verification/claim pending, C contribution → APPLIED/import decision → SUCCEEDED qua broker, G retry/cancel đọc lại CANCELLED; `4e020e1`/`edb10cb`.
- [ ] FE-P02-03: Nối đủ API không AI — **PARTIAL** · Toàn bộ đã nối và được quan sát, còn hai nhánh media chưa kiểm được với scanner thật (F-14); số lượng/bằng chứng chỉ tại BE mục9. Không có màn còn thiếu trong scope API hiện tại.
- [x] FE-P02-04: Bỏ fallback ghi giả, sửa body/path theo contract — **LOCAL_VERIFIED** (dirty) · A/B/C/E/G PASS qua Gateway thật, F/H và negative assertions giữ dữ liệu/form khi lỗi, không toast thành công giả; đóng F-22/F-23, source `4e020e1`, scripts `edb10cb`.

## 7. P03 — Kiểm thử và thiết kế lại giao diện

**Bằng chứng giao diện mới** (theo ghi chép nhánh FE, checkout dirty `cfd121d` → `544dd08`, Windows, Node 24.21.0, Chromium Playwright):
- `npm run test:ui` (`clay-ui-check.mjs`): 52 kiểm tra, 0 fail, API giả lập; 9 màn × 375/768/1440 px, màn con, trạng thái rỗng/lỗi, reduced motion.
- `npm run test:ui:editorial` (`editorial-ui-check.mjs`): 32 kiểm tra, 0 fail; 375/430/768/1366/1920 px, menu, Escape, tìm kiếm/danh mục/cursor, favorite thành công/thất bại, loading/empty/error. Chức năng dùng API giả lập; ảnh chụp đọc Gateway thật.
- `cinematic-ui-check.mjs`: 22 kiểm tra, 0 fail; header, hero, menu, reduced motion.
- Lighthouse (preview production local, mobile): Performance 80, Accessibility 100, Best Practices 100, SEO 100; LCP 4,0 s, TBT 180 ms, CLS 0.
- Lịch sử lỗi đã sửa: matcher `**/api/**` bắt nhầm module `/src/api/`; Escape khi focus nút menu; selector trùng.

**Kiểm lại ngày 23/10/2026 trên merge `eed140a`** (Windows, Node 24.15.0): `npm ci` OK, `npm run build` PASS, `npm run test:contracts` 8/8. Không chạy được test trình duyệt (máy chưa cài Chromium Playwright) và test Gateway (không có Python/Docker).

- [x] FE-P03-01 (P03-07): Browser không AI qua Gateway thật — **LOCAL_VERIFIED** (dirty) · `test:browser` 9 nhóm +36 responsive, 0 page error/AI call, hash trước/sau khớp; A–H PASS, `4e020e1`/`edb10cb`; chưa CI cho revision mới.
- [x] FE-P03-02: Tắt AI mặc định (`VITE_AI_ENABLED=false`) — **LOCAL_VERIFIED** · UI mới vẫn ẩn Gợi ý, model admin · PR #20.
- [ ] FE-P03-03: Thiết kế editorial/responsive — **PARTIAL** · Kiểm Gateway thật F PASS, `test:ui:editorial` 32/0/0/0; thiếu CI revision mới, LCP <2,5s (F-21), dữ liệu production F-20. Các kết quả cũ bên trên chỉ là lịch sử.
- [ ] FE-P03-04: Kiểm thử accessibility đầy đủ (WCAG, screen reader) — **NOT_STARTED** · Hiện có Lighthouse Accessibility 100, focus/Escape, reduced motion.
- [ ] FE-P03-05: Test UI phần AI (`test:browser:ai`) — **DEFERRED** (người dùng, 20/10/2026).
- [ ] FE-P03-06: Dọn code cũ và script — **PARTIAL** · `browser-nonai.mjs` đã cập nhật, suite nghiệp vụ mới PASS; code gốc không dùng và clay-ui-check cũ chưa dọn (F-24).

## 8. P04 — Triển khai

- [ ] FE-P04-01: Build production và hosting cùng domain với Gateway (không dùng Vite proxy) — **NOT_STARTED**.
- [ ] FE-P04-02: Cấu hình CORS/origin production ở Gateway (`CORS_ALLOWED_ORIGINS`) — **NOT_STARTED**.
- [ ] FE-P04-03: Smoke sau triển khai user/admin/business/trip/map — **NOT_STARTED**.

---

## 9. Việc FE còn phải làm

| Ưu tiên | Việc còn lại | Phụ thuộc |
|---|---|---|
| 1 | Cấu hình scanner và kiểm APPROVE/public read ảnh đã duyệt | F-14; không bypass quarantine |
| 2 | Nguồn dữ liệu du lịch/media có giấy phép khi chuyển production | F-20; người dùng hiện chọn P02 |
| 3 | Thống nhất representation Place và API queue admin/doanh nghiệp | F-15/F-16; owner contract |
| 4 | Tối ưu LCP, WCAG đầy đủ, dọn code cũ | F-21/F-24 |
| 5 | CI trên revision cuối, review chéo và gate trước triển khai | N1/N2; không tự ký gate |

## 10. Vấn đề đang mở liên quan FE

Nguồn trạng thái duy nhất: [progress_be.md mục 10](progress_be.md#10-vấn-đề-đang-mở). F-18/F-22/F-23 đã đóng bằng source và kiểm thử mới. Còn F-14 (scanner/contract media), F-15 (representation), F-16 (queue), F-17 (scope di động), F-20 (production dataset), F-21 (LCP), F-24 (code cũ). Phần này không thay bảng API ở BE.

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
| Trình duyệt với Gateway | `npm --prefix frontend run test:browser` | Cần stack P02 + dev server; đã cập nhật UI hiện tại |
| Nghiệp vụ thật bổ sung | `npm --prefix frontend run test:browser:account` · `test:browser:business` · `test:browser:admin` · `test:browser:media` · `test:browser:trip` · `test:browser:auth-failure` | Cần P02 + dev server; A–H BE mục9 |
| Tổng hợp API đã quan sát | `npm --prefix frontend run integration:coverage` | Chỉ đọc report suite PASS, không thay thế chạy test |
| Bật AI khi làm phần AI | `VITE_AI_ENABLED=true` (FE) và `AI_ENABLED=true` (Gateway) | Phải bật cả hai |

---

## 12. Lịch sử cập nhật

| Thời điểm | Thay đổi | PR / commit |
|---|---|---|
| 30/10/2026 22:03 | Hoàn thành tích hợp local với P02, khôi phục nghiệp vụ, bỏ ghi giả, kiểm Gateway/browser; hai nhánh scanner chưa xác nhận, chưa CI/gate | `66e6586`, `4e020e1`, `edb10cb` |
| 23/10/2026 01:05 | Merge frontend v4 vào cấu trúc progress BE/FE; ghi lại màn hình UI mới, hạ FE-P02-01/02 và P03-07 xuống `PARTIAL`, thêm F-20…F-24 | Merge `eed140a` |
| 23/10/2026 00:10 | Header kính nổi, typography editorial, bố cục ảnh bất đối xứng (v4) | `544dd08`, `949a941` (nhánh `feature/frontend-floria-v4-refinement`) |
| 22/10/2026 | Landing editorial, cinematic v3, giao diện clay; module `features/*`, `shared/ui` | Nhánh FE (gộp trong merge `eed140a`) |
| 22/10/2026 23:50 | Tạo `progress_fe.md` khi tách progress BE/FE (trước ghi nhầm 16:50 do lấy giờ UTC) | `e028c46` |
| 21/10/2026 | UI đa vùng, thanh điều hướng kính, thông báo lỗi kết nối Gateway | `8bb6c7c`…`cfd121d` |
| 21/10/2026 11:00 | Tắt AI mặc định, test trình duyệt không AI | PR #20, `c1e8e29` |
| 15/10/2026 | Màn nghiệp vụ gọi Gateway thật | PR #16, `14b342c` |
| 15/10/2026 | API client + refresh xoay vòng | PR #15, `42eac23` |
| 08/10/2026 | Khung React/TS/Vite (P00); landing page | PR #2, PR #3 |
