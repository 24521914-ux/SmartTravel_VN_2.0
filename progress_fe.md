# Tiến độ Frontend (FE) — SmartTravel VN

Cập nhật: **02/11/2026 01:34** (GMT+7)

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
| `src/main.tsx` → `src/app/App.tsx` | Entry. App tải các màn bằng `React.lazy`; `src/app/routes.ts` ánh xạ 10 màn sang path không dấu, hỗ trợ bookmark hash cũ |
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

### 6.1. Dữ liệu mẫu để test thủ công

- Trang Chuyến đi khi chưa đăng nhập — **LOCAL_VERIFIED** (dirty), Codex/`feature/local-demo-data`, HEAD `5015912`: hiện “Vui lòng đăng nhập để xem chuyến đi”, nút đăng nhập chuyển sang Tài khoản; đợi xác định phiên trước khi mở planner, không gọi API Trip cho khách. Đăng nhập vẫn tải lịch trình, API 503 khi đã đăng nhập vẫn hiện lỗi dữ liệu. `npm --prefix frontend run build` PASS; `node frontend/scripts/browser-demo-data.mjs` 11 kiểm tra PASS / 0 page error (khách 0 request Trip); Node 24/Chromium, Gateway/DB thật, ca 503 dùng response mô phỏng. Không thay đổi tổng API kết nối.
Sau phản hồi ảnh chụp ngày 01/11/2026: 48 địa điểm kiểm thử tên máy đã được chuyển `HIDDEN` trong Catalog, 28 địa điểm mẫu có tên rõ ràng vẫn công khai; nhóm thẻ “Danh mục dữ liệu kiểm thử” không còn dữ liệu để hiển thị. Dọn lại sau khi chạy test tự động bằng `python backend/infra/seed_demo.py --hide-legacy-tests`; bằng chứng API/DB tại BE mục 6.1.

Bộ dữ liệu local ngày 01/11/2026 đã được lưu trong PostgreSQL/MongoDB P02. Người làm: Codex, nhánh `feature/local-demo-data`. Màn hình đã kiểm bằng `node frontend/scripts/browser-demo-data.mjs`: **LOCAL_VERIFIED** (dirty), 8 kiểm tra / 0 page error, HEAD `5015912`, Node 24/Chromium/Docker thật. Bằng chứng database và giới hạn tại [progress_be.md mục 6.1](progress_be.md#61-dữ-liệu-mẫu-kiểm-thử-thủ-công--01112026); số lượng kết nối API vẫn theo BE mục 9.

Mở `http://127.0.0.1:5173/tai-khoan`. Mật khẩu chung cho **các tài khoản mẫu bên dưới** nằm trong trường `password` của file ignored [demo-accounts.json](backend/infra/.local/p02/demo-accounts.json). Đây là các danh tính giả lập, không phải thông tin cá nhân thật.

| Tài khoản mẫu | Email đăng nhập | Dùng để test |
|---|---|---|
| Nguyễn Ngọc Lan | `lan.nguyen@demo.smarttravel.invalid` | Yêu thích, 2 bộ sưu tập, 3 chuyến đi đã có lịch trình, đóng góp, đánh giá, 24 thông báo đọc/chưa đọc |
| Trần Quang Minh | `minh.tran@demo.smarttravel.invalid` | Người dùng thứ hai: bộ sưu tập công khai, đánh giá, kiểm tra quyền riêng tư |
| Lê Mai Hương | `mai.huong@demo.smarttravel.invalid` | Chủ 2 doanh nghiệp: Miền Trung Xanh đã xác minh; Trải nghiệm Di sản Hội An chờ xác minh |
| Phạm Hải An | `an.pham@demo.smarttravel.invalid` | Thành viên `EDITOR` của 2 doanh nghiệp, đối chiếu quyền với chủ doanh nghiệp |
| Quản trị SmartTravel | `quan.tri@demo.smarttravel.invalid` | Kiểm duyệt đánh giá/đóng góp/báo cáo, hồ sơ doanh nghiệp, danh mục, người dùng, nguồn nhập |

| Màn hình | Dữ liệu mẫu nên mở | Thao tác gợi ý |
|---|---|---|
| `/kham-pha`, `/ban-do` | Hồ Hoàn Kiếm, Mỹ Khê, Hội An, Đại Nội Huế, Đà Lạt, Vịnh Hạ Long | Tìm/lọc theo tên, danh mục, tỉnh/vùng, giá, tọa độ, đánh giá; xem chi tiết và dịch vụ; lưu/bỏ lưu |
| `/bo-suu-tap` | “Những miền biển em muốn đến” công khai; “Cuối tuần khám phá di sản” riêng tư | Sửa ghi chú/thứ tự, thêm/xóa địa điểm; dùng tài khoản Minh mở mã bộ sưu tập công khai |
| `/chuyen-di` | “Đà Nẵng – Hội An: biển xanh và phố cổ”; “Hà Nội: một cuối tuần khám phá di sản”; “Đà Lạt: nghỉ ngơi giữa ngàn thông” | Chuyến đi 05–07/12/2026, mỗi chuyến 3 ngày; sửa/lên xuống, khóa/mở khóa, thêm ngày, sửa chặng/ước tính tuyến |
| `/thong-bao` | Thông báo “Cẩm nang mẫu · …” của Lan | Đánh dấu đã đọc; tải lại; xem thêm qua trang thứ hai |
| `/dong-gop` | Làng rau Trà Quế, Rừng dừa Bảy Mẫu Cẩm Thanh, đề xuất sửa giờ Mỹ Khê | Sửa/rút hồ sơ chờ; admin duyệt rồi người gửi kiểm tra trạng thái |
| `/kiem-duyet` | 6 đánh giá chờ, 1 báo cáo, 3 đóng góp; hồ sơ doanh nghiệp/claim/yêu cầu sửa | Đối chiếu dữ liệu trước/sau duyệt bằng tài khoản người gửi |
| `/doanh-nghiep` | Du lịch Miền Trung Xanh; Trải nghiệm Di sản Hội An | So sánh quyền chủ/editor; hồ sơ đã duyệt và chờ; claim Hội An chờ xét, yêu cầu sửa giá Mỹ Khê chờ duyệt |
| `/quan-tri` | “Cẩm nang du lịch miền Trung · Nguồn mẫu nội bộ” | Mở job, bản ghi/lỗi/ứng viên; thử quyết định ghép, retry/cancel theo trạng thái hợp lệ |

Mã bộ sưu tập, job, hồ sơ xác minh, claim, yêu cầu sửa và ảnh nằm trong [demo-records.json](backend/infra/.local/p02/demo-records.json); tìm theo các khóa `collection:`, `job:`, `verification:`, `claims:`, `change-request:`, `media:`. Một số form hiện yêu cầu nhập ID/phiên bản thủ công (F-16). Giá/giờ mở cửa, đánh giá và doanh nghiệp chỉ phục vụ test; ảnh chưa duyệt do scanner (F-14), hồ sơ PDF là tham chiếu mẫu. Đổi mật khẩu/xóa dữ liệu nên thử cuối cùng bằng tài khoản người dùng, sau đó không kỳ vọng seed tự khôi phục tài khoản đã sửa/xóa. Email xác minh/reset xem tại `http://127.0.0.1:59025`.

Chạy lại seed: `python backend/infra/seed_demo.py` (cần Python có PyYAML/Pillow và stack P02 đang chạy). Chỉ đối chiếu dữ liệu: `python backend/infra/seed_demo.py --verify-only`. Không xóa manifest rồi chạy lại sau khi đã đổi tên dữ liệu; không tự đặt lại mật khẩu, role, tên hoặc nội dung người test đã chỉnh.

- Kiểm lại bàn giao PR [#23](https://github.com/24521914-ux/SmartTravel_VN/pull/23) — **LOCAL_VERIFIED** · Codex, `feature/travel-demo-routing-filters`, source `7b04167`; checkout dirty chỉ còn `.ai-memory/` untracked. Node 24.21.0/Chromium 156: routing 45/0/0/0; editorial 32/0/0/0; filters lượt đầu 20 PASS/2 FAIL (Gateway chưa chạy và header che nút quay lại), sau phục hồi stack và sửa CSS `7b04167` chạy lại 1 lần 22/0/0/0; demo browser 11 PASS/0 page error qua Gateway/DB thật. Contract FE 15/0/0/0; seed Python 3.14 8/0/0/0; checksum 3/0/0/0, validator 183 HTTP + 23 event/command PASS. Java 21 Maven catalog/community/trip unit/security PASS: 113 run/0 failed/0 errors/74 skipped (DB/broker không chạy local trong lượt này). Build TypeScript/Vite sau sửa PASS. Fixture API chỉ dùng cho nhánh UI được ghi trong suite. CI đang chạy; chưa nâng CI/gate hoặc ACCEPTED.

- Kiểm CI bàn giao — **CI_VERIFIED** trong phạm vi 11 check của PR #23, revision `2f2e702e3b57eaec29879ebd35682265573f0e33`: P00 `41336264353`, P01 `41336264348`, P02 `41336264376`, P03 tooling `41336264372` đều SUCCESS (11/11). CI Linux/Java 21/Node 24, DB/broker/container thật theo workflow; không suy rộng sang các gate hoặc toàn bộ task. P02 run trước `41334918573` FAIL tại smoke chờ NEEDS_REVIEW; `fc370e8` bổ sung candidate PUBLISHED độc lập và chẩn đoán, giữ assertion; local sau refresh stack/Gateway PASS (1 lượt), DB xác nhận NEEDS_REVIEW → CANCELLED. Gateway unit/security local Java 21 22/0/0/0. Đã merge PR #23 bằng `Truong102006`, merge `4223631bc955ca47475fe2bb630a7a48576a3681`; giữ nguyên trạng thái gate/chữ ký.

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
- [x] FE-P03-07: Chuyển 10 màn sang path không dấu — **LOCAL_VERIFIED** (dirty) · Người làm: Codex · Nhánh: `refactor/frontend-path-routing` · Bằng chứng: `npm --prefix frontend run test:browser:routing` 45/0/0/0 (run/failed/errors/skipped), đủ 10 path trực tiếp/F5, bookmark cũ, query/anchor, Back/Forward, không lặp lịch sử, trang không tìm thấy và hash lỗi; `test:contracts` 15/0/0/0, `test:ui:editorial` 32/0/0/0; `npm --prefix frontend run build` PASS (TypeScript + Vite). Baseline SHA `5015912`, checkout dirty, Node 24.21.0, Chromium 156.0.8078.4; routing dùng Vite + Gateway P02 thật, guest, chỉ đọc, không stub; editorial có mock API. Next: CI trên revision PR và review N1/N2; chưa đóng gate P03.

- [x] FE-P03-08: Đồng bộ font các tiêu đề phối hai kiểu chữ — **LOCAL_VERIFIED** (dirty) · Theo yêu cầu người dùng 31/10/2026: 6 tiêu đề hero/điểm đến/editorial/showcase/cộng đồng/finale dùng Playfair Display italic 400 cho cả câu, giữ màu nhấn. Bằng chứng: Playwright `node --input-type=module`, đọc `getComputedStyle` trên `.journey-hero h1`, `.journey-section h2:has(em)`, `.cinematic-finale h2`: 24/0/0/0 kiểm tra ở 375/768/1440/1920 px, font tải thành công, 0 tràn ngang; kiểm ảnh mobile/desktop; `npm --prefix frontend run build` PASS. Baseline SHA `5015912`, checkout dirty trên `refactor/frontend-path-routing`, Node 24.21.0, Chromium, Vite + Gateway P02 thật, không stub. Next: review N1/N2 và CI revision PR; không nâng gate.

- [x] FE-P03-09: Thiết kế lại bộ lọc và danh mục du lịch theo tham khảo Travel.com.vn — **LOCAL_VERIFIED** (dirty) · Người làm: Codex · Nhánh: `refactor/frontend-path-routing` · `DestinationFilters.tsx`: form từ khóa/vùng/tỉnh, nâng cao giá/đánh giá/tọa độ, đặt lại và tự mở/focus ô lỗi khi thu gọn. `TravelCatalog.tsx`: 3 nhóm, chip tiện ích/thẻ và card dịch vụ; bản ghi kiểm thử giữ nguyên trong phần thu gọn. Bằng chứng: `npm --prefix frontend run test:browser:filters` 22/0/0/0 (run/failed/errors/skipped): Gateway thật áp dụng `minPrice=0&minRating=0` và đặt lại HTTP 200; responsive 375/768/1440/1920 px không tràn; fixture API kiểm đủ tham số, phân trang, validation, giá 0/null, chi tiết dịch vụ và lỗi/trống. `test:contracts` 15/0/0/0; `test:ui:editorial` 32/0/0/0; `npm --prefix frontend run build` PASS (4626 modules). Baseline SHA `5015912`, checkout dirty; Node 24.21.0, Chromium 156.0.8078.4, Vite + Gateway P02 thật cho kiểm live, mock có kiểm soát cho các nhánh chức năng. Giữ nguyên contract/API và số kết nối BE ↔ FE. Next: CI revision PR và review N1/N2; không nâng gate.

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
| Path và lịch sử điều hướng | `npm --prefix frontend run test:browser:routing` | 10 path, tải lại trang, bookmark hash cũ, Back/Forward và trang không tìm thấy; chỉ đọc, không đăng nhập |
| Bộ lọc và danh mục | `npm --prefix frontend run test:browser:filters` | Responsive với Gateway thật; fixture API cho tham số lọc, validation, đặt lại, phân trang, danh mục và giá dịch vụ |
| Nghiệp vụ thật bổ sung | `npm --prefix frontend run test:browser:account` · `test:browser:business` · `test:browser:admin` · `test:browser:media` · `test:browser:trip` · `test:browser:auth-failure` | Cần P02 + dev server; A–H BE mục9 |
| Tổng hợp API đã quan sát | `npm --prefix frontend run integration:coverage` | Chỉ đọc report suite PASS, không thay thế chạy test |
| Bật AI khi làm phần AI | `VITE_AI_ENABLED=true` (FE) và `AI_ENABLED=true` (Gateway) | Phải bật cả hai |

---

## 12. Lịch sử cập nhật

| Thời điểm | Thay đổi | PR / commit |
|---|---|---|
| 02/11/2026 01:33 | Merge tích hợp BE–FE, seed mẫu, path/bộ lọc/giao diện; 11 check CI PASS trên revision PR `2f2e702`; sửa F-30/F-31, không đóng gate | [PR #23](https://github.com/24521914-ux/SmartTravel_VN/pull/23), merge `4223631bc955ca47475fe2bb630a7a48576a3681` |
| 30/10/2026 22:48 | Rà soát tiến độ FE, đối chiếu report tích hợp với bảng API tại BE mục 9; số liệu khớp, giữ hai nhánh scanner chưa xác nhận. Chỉ kiểm tra tài liệu/report cũ, không chạy lại browser/build hoặc nâng trạng thái | Baseline `5015912`; nhánh `fix/frontend-backend-integration`, checkout có `.ai-memory/` untracked |
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
