# Tiến độ Frontend (FE) — SmartTravel VN

- [ ] Kiểm thử bản đồ sau tích hợp — **PARTIAL** · `ea98d08` thay kiểm iframe cũ bằng Leaflet region/marker/popup, Node syntax PASS. Browser chỉ đọc cloud local thiếu marker nên timeout, chưa tính PASS. Lịch sử CI và F-52 tại [progress_be.md](progress_be.md#10-vấn-đề-đang-mở); chờ fixture CI, không nâng số API.

- [ ] Tích hợp source hiện tại vào cloud `main` — **PARTIAL** · Codex, nhánh `feature/travel-workspace-integration-20261113`, nguồn `f635d79`, base `08718ac`, checkout dirty · TypeScript/Vite build PASS; `npm --prefix frontend run test:contracts` 17/0/0/0 (Node, API giả lập). Giữ UI tài khoản, bộ sưu tập theo tỉnh và timeline chuyến đi; giữ client timeout/cloud dotenv của main. Chưa chạy lại browser với cloud; trạng thái API và các vấn đề tích hợp xem [progress_be.md](progress_be.md).

Cập nhật: **13/11/2026 14:34** (GMT+7)


Kiểm lại 05/11/2026: backend local đã cập nhật image Identity và kiểm API đăng ký/đăng nhập thật; chi tiết bằng chứng tại [progress_be.md](progress_be.md). FE end-to-end thật chưa chạy lại; giữ PARTIAL.

- [ ] P01 Tài khoản — **PARTIAL** · Codex, nhánh `feature/identity-skip-email-verification`, baseline `91f15aa`, dirty: đăng ký thành công tự chuyển sang tab đăng nhập, giữ email, xóa mật khẩu và tắt hiển thị mật khẩu; user tự nhập mật khẩu để đăng nhập. `node frontend/scripts/browser-registration.mjs`: 1/0/0/0, Chromium với API stub, 0 lỗi trang; `npm --prefix frontend run build` PASS (TypeScript/Vite). Chưa kiểm Gateway/DB thật; trạng thái kết nối và F-45 tại [progress_be.md](progress_be.md#9-kết-nối-be--fe); không nâng gate.

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

**Kết nối BE ↔ FE:** 155 ✅ · 5 🟡 · 0 ❌ · 0 ⚪ · 14 ⏸️ · 4 ➖. Danh sách và bằng chứng từng API chỉ ghi tại [progress_be.md mục 9](progress_be.md#9-kết-nối-be--fe).

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
| Chuyến đi | Timeline theo ngày, chặng tự động, Leaflet markers, tự lưu và phục hồi xung đột; giữ draft theo từng item, destinations/chặng riêng trong cài đặt | Routing production chưa cấu hình, khoảng cách chim bay có nhãn, không bịa duration/geometry |
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

Ngày 06/11/2026, bộ backend phục vụ Gateway local đã chuyển sang Neon/Atlas; sáu kiểm tra API đọc/đăng nhập PASS sau cấu hình timeout cho runtime cloud. Chưa chạy kiểm thử trình duyệt FE với cloud, vì vậy giữ nguyên trạng thái màn hình và số lượng kết nối đã có. Bằng chứng chuyển dữ liệu, giới hạn revision/runtime và việc cần kiểm tiếp: [progress_be.md mục P02](progress_be.md#6-p02--kết-nối-các-service), F-39; tệp đính kèm vẫn dùng volume local (F-06).

- [x] Cấu hình client cho cloud mặc định — **LOCAL_VERIFIED** (dirty) · Codex · Nhánh `refactor/platform-cloud-default`, baseline `aa85543` · Client chờ 20 s để nhận kết quả hoặc lỗi từ Gateway 15 s; script kiểm thử chọn dotenv bằng `P02_ENV_FILE`, vẫn giữ tùy chọn JSON riêng. Node 24.21.0/npm 11.19.0: `test:contracts` 17/0/0/0 (run/failed/errors/skipped, API giả lập; có phản hồi sau 10,05 s và timeout tùy chỉnh), TypeScript/Vite build PASS; lựa chọn nguồn secret 2/0/0/0. Chưa kiểm browser FE cloud; giữ nguyên số lượng/ký hiệu API, xem [P04-CS-10 và F-39](progress_be.md#8-p04--phát-hành).
- [ ] P02 Bộ sưu tập — **PARTIAL** · Codex, nhánh `feature/collections-province-picker`, baseline `91f15aa`, dirty: thay tìm tự do bằng chọn tỉnh/thành từ Catalog; tìm theo `geographicUnitId`, đếm đủ phân trang, khóa địa điểm trước khi tìm và ghi chú trước khi chọn địa điểm; đổi tỉnh xóa lựa chọn cũ. Build TypeScript/Vite PASS; contract 15/0/0/0 (Node, stub); `P02_FRONTEND_URL=http://127.0.0.1:5181 node frontend/scripts/browser-collection-province.mjs`: 5/0/0/0 nhóm kiểm tra, Chromium, HTTP giả lập, 0 lỗi trang. Các lần lỗi chuẩn bị harness (server 5173 trả UI cũ/locator) đã sửa; chưa dùng làm bằng chứng nghiệp vụ. Chưa kiểm lại Gateway/DB thật; không nâng gate.

- [x] FE-P02-01: Màn nghiệp vụ gọi Gateway thật, lỗi/pending rõ — **LOCAL_VERIFIED** (dirty) · suite F 9 nhóm +36 responsive, H login/me503 không báo giả; business/admin/trip suite PASS; `4e020e1`/`edb10cb`, môi trường và request count tại BE mục9. Tương ứng P02-09.
- [x] FE-P02-02: Pending ack khác thành công cuối — **LOCAL_VERIFIED** (dirty) · B verification/claim pending, C contribution → APPLIED/import decision → SUCCEEDED qua broker, G retry/cancel đọc lại CANCELLED; `4e020e1`/`edb10cb`.
- [ ] FE-P02-03: Nối đủ API không AI — **PARTIAL** · Toàn bộ đã nối và được quan sát, còn hai nhánh media chưa kiểm được với scanner thật (F-14); số lượng/bằng chứng chỉ tại BE mục9. Không có màn còn thiếu trong scope API hiện tại.
- [x] FE-P02-04: Bỏ fallback ghi giả, sửa body/path theo contract — **LOCAL_VERIFIED** (dirty) · A/B/C/E/G PASS qua Gateway thật, F/H và negative assertions giữ dữ liệu/form khi lỗi, không toast thành công giả; đóng F-22/F-23, source `4e020e1`, scripts `edb10cb`.
- [x] FE-P02-AUTH-01: Hoàn thiện giao diện luồng tài khoản — **LOCAL_VERIFIED** (dirty) · Codex, nhánh `fix/identity-registration-verification`, source `2f21c75`, HEAD khi chạy `857faf6` dirty. Đăng ký → xác minh → đăng nhập; gửi lại mã; confirm mật khẩu; lỗi pending/mã cũ/sai mật khẩu; quên → đặt lại → đăng nhập; hướng dẫn Mailpit chỉ ở dev và ẩn khi cấu hình SMTP thật. `test:browser:auth-recovery` 13/0/0/0; `test:browser:account` 8 nhóm/32 request; `test:browser:auth-failure` 1 tình huống, tất cả 0 page error. Chromium, Node 24, Gateway/PostgreSQL/Mailpit thật; viewport 375/768/1440 không tràn, đã xem ảnh. Build PASS 4637 modules; client 15/0/0/0. Gmail thật còn chờ cấu hình người dùng; trạng thái kết nối/bằng chứng tại BE mục 9/O/P, F-44; chưa CI/gate.

### 6.1. Dữ liệu mẫu để test thủ công

- Kiểm tra thực tế 03/11/2026 — **LOCAL_VERIFIED** (checkout dirty), Codex, nhánh `feature/explore-ui-demo-content`, HEAD `ca83db7`: `node frontend/scripts/browser-demo-data.mjs` PASS 21 kiểm tra / 0 page error, Node 24.21.0, Chromium 156.0.8078.4, Vite + Gateway + PostgreSQL/MongoDB P02 thật. Có guest/user/business/editor/admin, public list + phân trang + chi tiết/review, giá null, collection public/private, itinerary, notifications và hàng chờ quản trị. Ca Trip 503 được mô phỏng để kiểm lỗi giao diện; script không duyệt/từ chối/xóa hàng chờ.
- Chuẩn bị từ thư mục gốc repo: `python backend/infra/p02.py prepare` → `python backend/infra/p02.py build` → `python backend/infra/p02.py up`; mở FE bằng `npm --prefix frontend run dev` tại `http://127.0.0.1:5173`. Khi stack P02 đã chạy: `python backend/infra/seed_demo.py` rồi `python backend/infra/seed_demo.py --verify-only`. Sau suite tự động tạo địa điểm test public, dùng `python backend/infra/seed_demo.py --hide-legacy-tests` để chuyển legacy sang HIDDEN qua Catalog API, không xóa dữ liệu.
- Mật khẩu chung nằm trong trường `password` của file local ignored [demo-accounts.json](backend/infra/.local/p02/demo-accounts.json); ID ổn định trong [demo-records.json](backend/infra/.local/p02/demo-records.json). Tài khoản/email dưới đây là giả lập miền `.invalid`; không ghi mật khẩu vào tài liệu.

| Tài khoản / alias | Email đăng nhập | Dùng để test |
|---|---|---|
| Nguyễn Ngọc Lan (`lan`) | `lan.nguyen@demo.smarttravel.invalid` | Sở thích, yêu thích, collection, itinerary, review, contribution, notification |
| Trần Quang Minh (`minh`) | `minh.tran@demo.smarttravel.invalid` | Tài khoản độc lập, collection công khai, kiểm quyền collection riêng của Lan |
| Lê Mai Hương (`business`) | `mai.huong@demo.smarttravel.invalid` | Chủ doanh nghiệp: một hồ sơ đã xác minh, một hồ sơ chờ |
| Phạm Hải An (`editor`) | `an.pham@demo.smarttravel.invalid` | Thành viên `EDITOR`, so quyền với chủ doanh nghiệp |
| Quản trị SmartTravel (`manager`) | `quan.tri@demo.smarttravel.invalid` | Review/report/contribution/draft, doanh nghiệp và import; chỉ đọc khi smoke |
| Đỗ Mai Anh (`new-user`) | `mai.anh.do@demo.smarttravel.invalid` | Tài khoản mới, không có lựa chọn sở thích/favorite/collection/review/trip; preference chỉ có default schema |
| Nguyễn Khánh Hòa (`password-change`) | `khanh.hoa.nguyen@demo.smarttravel.invalid` | Alias riêng để test đổi mật khẩu sau cùng |
| Trần Quốc Bảo (`delete-account`) | `quoc.bao.tran@demo.smarttravel.invalid` | Alias riêng để test yêu cầu xóa dữ liệu sau cùng |

| Màn/nghiệp vụ | Vai trò | Dữ liệu hiện có | Phần bổ sung trong lượt này | Kịch bản và kết quả mong đợi |
|---|---|---|---|---|
| Guest + tài khoản mới | Guest, `new-user` | Route Trip, default preference do schema tạo | 3 account mới; không thêm dữ liệu cá nhân cho Mai Anh | Guest thấy lời mời đăng nhập, không gọi Trip; Mai Anh không có preference selection, collection hay trip |
| Khám phá / bản đồ / chi tiết | Guest, Lan | 29 địa điểm công khai, 6 vùng cấp tỉnh | 12 khu vực du lịch con; 29 địa điểm gắn phạm vi con; 1 địa điểm giá chưa biết | Chọn tỉnh → khu vực thuộc tỉnh → tìm theo tên; draft/legacy không public; giá chưa biết khác 0 đồng |
| Community | Lan, Minh, manager | 28 review, 1 report, 3 contribution; bộ sưu tập và favorite | 1 review dành cho moderation + 2 report; có đủ sao và trạng thái | Chi tiết Văn Miếu có review/author/rating; collection public/private/empty đúng owner; Minh không mở/sửa collection private Lan; queue giữ nguyên để test tay |
| Trip + notification | Lan | 3 trip, lịch 1 điểm đến | Thêm trip 2 điểm đến/5 ngày và trip rỗng | Mở/sửa/lên xuống/khóa item, xem ghi chú/chi phí/chặng; 33 notification có đọc/chưa đọc và liên kết |
| Business + admin/import/media | Business owner, editor, manager | Doanh nghiệp/claim/change request và sandbox P02 | Giữ riêng hồ sơ verified/pending, claim, report và import fixtures | So quyền owner/editor; manager xem queue và job sandbox; item APPLIED/FAILED/NEEDS_REVIEW; duplicate chưa tách được (F-42); ảnh PENDING, không bypass scanner (F-14) |

Gợi ý bản ghi: Khám phá — Hồ Hoàn Kiếm, Văn Miếu Quốc Tử Giám, Mỹ Khê, Phố cổ Hội An, Đại Nội Huế, Đồi chè Cầu Đất, Vịnh Hạ Long, Nhà thờ Lớn Hà Nội; bộ sưu tập — “Những miền biển em muốn đến”, “Cuối tuần khám phá di sản”, “Điểm muốn xem sau”; itinerary nhiều ngày — “Đà Nẵng – Huế: biển miền Trung và kinh thành” (10–14/12/2026); itinerary rỗng — “Chuyến đi mới của Nguyễn Ngọc Lan”; doanh nghiệp — “Du lịch Miền Trung Xanh”, “Trải nghiệm Di sản Hội An”; nguồn — “Cẩm nang du lịch miền Trung · Nguồn mẫu nội bộ”.
Mã collection/job/hồ sơ/claim/change request/media ở manifest [demo-records.json](backend/infra/.local/p02/demo-records.json), tìm theo key `collection:`, `job:`, `verification:`, `claims:`, `change-request:`, `media:`. Một số form vẫn yêu cầu ID/version thủ công (F-16). Giá, giờ, review và doanh nghiệp chỉ là dữ liệu minh họa. Hồ sơ PDF chỉ là tham chiếu, chưa có file để xem/tải; ảnh moderation còn PENDING do chưa có scanner (F-14); AI/provider production vẫn hoãn. Import API hiện không phân biệt bản ghi duplicate và applied (F-42).
Hãy đổi mật khẩu/xóa dữ liệu cuối cùng bằng hai alias riêng; browser check chỉ mở form, chưa gửi yêu cầu. Seed không đặt lại mật khẩu/role/tên hoặc khôi phục account/fixture đã bị người test sửa/xóa; không xóa manifest. Hộp thư xác minh/reset local: `http://127.0.0.1:59025`.

- Kiểm lại bàn giao PR [#23](https://github.com/24521914-ux/SmartTravel_VN/pull/23) — **LOCAL_VERIFIED** · Codex, `feature/travel-demo-routing-filters`, source `7b04167`; checkout dirty chỉ còn `.ai-memory/` untracked. Node 24.21.0/Chromium 156: routing 45/0/0/0; editorial 32/0/0/0; filters lượt đầu 20 PASS/2 FAIL (Gateway chưa chạy và header che nút quay lại), sau phục hồi stack và sửa CSS `7b04167` chạy lại 1 lần 22/0/0/0; demo browser 11 PASS/0 page error qua Gateway/DB thật. Contract FE 15/0/0/0; seed Python 3.14 8/0/0/0; checksum 3/0/0/0, validator 183 HTTP + 23 event/command PASS. Java 21 Maven catalog/community/trip unit/security PASS: 113 run/0 failed/0 errors/74 skipped (DB/broker không chạy local trong lượt này). Build TypeScript/Vite sau sửa PASS. Fixture API chỉ dùng cho nhánh UI được ghi trong suite. CI đang chạy; chưa nâng CI/gate hoặc ACCEPTED.

- Kiểm CI bàn giao — **CI_VERIFIED** trong phạm vi 11 check của PR #23, revision `2f2e702e3b57eaec29879ebd35682265573f0e33`: P00 `41336264353`, P01 `41336264348`, P02 `41336264376`, P03 tooling `41336264372` đều SUCCESS (11/11). CI Linux/Java 21/Node 24, DB/broker/container thật theo workflow; không suy rộng sang các gate hoặc toàn bộ task. P02 run trước `41334918573` FAIL tại smoke chờ NEEDS_REVIEW; `fc370e8` bổ sung candidate PUBLISHED độc lập và chẩn đoán, giữ assertion; local sau refresh stack/Gateway PASS (1 lượt), DB xác nhận NEEDS_REVIEW → CANCELLED. Gateway unit/security local Java 21 22/0/0/0. Đã merge PR #23 bằng `Truong102006`, merge `4223631bc955ca47475fe2bb630a7a48576a3681`; giữ nguyên trạng thái gate/chữ ký.

## 7. P03 — Kiểm thử và thiết kế lại giao diện

- [x] P03-FE-TR-TIMELINE: Đồng bộ planner vào workspace hiện tại, tự lưu không làm mất draft ở item khác — **LOCAL_VERIFIED** (dirty) · Codex; source `91f15aa` dirty, thay đổi draft lưu tại `e287595` trên nhánh `feature/trip-timeline-planner`. `test:browser:trip:timeline` 11 nhóm/0 failure/0 page error; Gateway timeline 5 nhóm/0 failure, build PASS 4639 modules, client 15/0/0/0; Node24.21.0/Chromium/Gateway/DB thật. Collection bundle vẫn FAIL, không suy cả suite PASS; chi tiết T/F-48 tại [progress_be.md](progress_be.md#9-kết-nối-be--fe). Push/PR bị chặn bởi mạng F-47; chưa CI/gate.

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

- [ ] FE-P03-09: Thiết kế bộ lọc và danh mục du lịch — **PARTIAL** · Theo yêu cầu người dùng 03/11/2026, đã gỡ `TravelCatalog` khỏi trang khám phá và bỏ tải API tiện ích/thẻ/dịch vụ chỉ phục vụ khối này; bộ lọc địa điểm được giữ lại. Cập nhật kiểm tra UI trong `browser-filters.mjs`; chưa chạy build/browser sau thay đổi. Next: xác minh trên revision PR trước khi nâng trạng thái.

- [ ] FE-P03-10: Làm mới bộ lọc/địa điểm; bổ sung song ngữ, sáng/tối, giá, đánh giá mẫu và ảnh có ghi nguồn — **PARTIAL** · Người làm: Codex · Nhánh: `feature/explore-ui-demo-content` · Bằng chứng (checkout dirty, HEAD `ca83db7`): `npm --prefix frontend run build` PASS (TypeScript + Vite, 4630 modules); `npm --prefix frontend run test:browser:filters` 25/0/0/0 (run/failed/errors/skipped), Node 24.21.0, Chromium 156.0.8078.4, Vite, live read-only layout + controlled API fixtures; kiểm menu bo góc/bàn phím, theme/locale, carousel cuộn ngang, query/filter qua Gateway, 375/768/1440/1920 px, 0 lỗi JS. P02 Gateway trả giá/điểm/số review và `author_name`; seed hiện có 29 review (22 APPROVED, 6 PENDING, 1 REJECTED) và lượt chạy lại tạo 0/cập nhật 0. Ảnh WebP nguồn Wikimedia có credits. `browser-demo-data.mjs` thêm 21 kiểm tra thật/0 page error cho màn user/business/admin; chưa chạy suite BE/contract hoặc CI trên revision cuối. Next: review N1/N2 và CI trên PR; không đóng gate P03.

- [x] FE-P03-11: Sửa tương phản chữ khi đổi theme — **LOCAL_VERIFIED** (dirty) · Người làm: Codex · Nhánh: `feature/explore-ui-demo-content` · Logo/header cuộn, tiêu đề/mô tả/liên kết bản đồ, bài viết, nhãn và trạng thái trống dùng màu phù hợp nền; giữ chữ sáng trên ảnh có lớp phủ tối. Bằng chứng: `npm --prefix frontend run test:browser:filters` 26/0/0/0 (run/failed/errors/skipped), đo chữ trên nền phẳng ≥ 4.5:1 ở cả hai theme sau khi transition kết thúc; responsive 375/768/1440/1920 px, 0 lỗi JS; `npm --prefix frontend run build` PASS (4630 modules). HEAD `ca83db7`, checkout dirty, Node 24.21.0, Chromium 156.0.8078.4; Vite + Gateway thật cho layout, controlled fixtures cho chức năng; đã kiểm ảnh chụp mode sáng. Next: review N1/N2 và CI revision PR; không suy thành kiểm WCAG đầy đủ hoặc đóng gate P03.

- [x] FE-P03-12: Sửa bố cục “Cận cảnh một điểm đến” — **LOCAL_VERIFIED** (dirty) · Người làm: Codex · Nhánh: `feature/explore-ui-demo-content` · Ảnh nền nằm trong khung, thumbnail cố định 64×54 px trên hàng cuộn ngang, nội dung có giới hạn chiều rộng, chọn thumbnail đổi tiêu đề và ảnh đang active. Bằng chứng: `npm --prefix frontend run test:browser:filters` 27/0/0/0 (run/failed/errors/skipped), kiểm khung ≤ 900 px và thumbnail ≤ 80 px, không tràn trang ở 375/768/1440/1920 px; kiểm ảnh desktop/mobile; `npm --prefix frontend run build` PASS (4630 modules). HEAD `ca83db7`, checkout dirty, Node 24.21.0, Chromium 156.0.8078.4; layout/selection dùng Gateway thật, các nhánh filter dùng controlled fixtures. Next: review N1/N2 và CI revision PR; không đóng gate P03.
- [x] FE-P03-13: Bộ lọc địa lý theo scope giảm dần — **LOCAL_VERIFIED** (dirty) · Người làm: Codex · Nhánh: feature/explore-ui-demo-content · Tỉnh/thành là cấp đầu; sau đó chỉ chọn khu vực du lịch thuộc tỉnh, rồi tùy chọn tìm tên địa điểm. Khu vực bị khóa trước khi chọn tỉnh; đổi tỉnh sẽ xóa khu vực cũ; danh sách chỉ gồm các phạm vi con hoàn toàn nằm trong tỉnh. Bằng chứng: npm --prefix frontend run test:browser:filters 29/0/0/0 (run/failed/errors/skipped), gồm controlled fixtures cho khu vực toàn tỉnh/liên tỉnh/thiếu phạm vi, đổi tỉnh và reset; ca Gateway thật chọn Đà Nẵng → Hội An, xác nhận kết quả khu vực là tập con của kết quả tỉnh; responsive 375/768/1440/1920 px, 0 lỗi JS; npm --prefix frontend run build PASS (TypeScript + Vite, 4630 modules). Node 24.21.0, Chromium 156.0.8078.4, HEAD ca83db7, checkout dirty; chi tiết API ở progress_be.md mục 9. Next: review N1/N2 và CI trên PR; không đóng gate P03.

- [ ] FE-P03-14: Bố cục đăng nhập hai cột cho khách ở trang Chuyến đi — **PARTIAL** (dirty) · Người làm: Codex · Nhánh: feature/explore-ui-demo-content · Tách khung đăng nhập tạo lịch trình và khung nội dung cảm hứng có ảnh Vịnh Hạ Long; nút đăng nhập vẫn chuyển sang Tài khoản; copy VI/EN, ảnh có alt, bố cục xếp dọc trên mobile, dùng theme tokens. Bằng chứng: npm --prefix frontend run build PASS (TypeScript + Vite, 4631 modules), checkout dirty, HEAD ca83db7. Chưa kiểm ảnh trên browser ở hai theme và các viewport. Next: xem trực quan 375/768/1440 px, dark/light; review N1/N2 và CI; không đóng gate P03.

- [x] FE-P03-15: Bản đồ tương tác và cập nhật địa chỉ thực tế — **LOCAL_VERIFIED** (dirty) · Người làm: Codex · Nhánh: `feature/explore-ui-demo-content`, HEAD `ca83db7`. Leaflet thay iframe, chọn địa điểm/ghim, phân trang, tìm tên/địa chỉ; Photon chỉ tra khi bấm tìm, cache/hàng đợi, lọc Việt Nam và tọa độ không hợp lệ, xử lý lỗi/trống/kết quả cũ. Quản trị tra tên hoặc tọa độ → chọn địa chỉ → chỉnh ghim → lưu qua Gateway; không tự ghi đè địa chỉ của dữ liệu hiện có. Bằng chứng: `npm --prefix frontend run test:browser:map` lượt cuối 8/0/0/0 (run/failed/errors/skipped), 0 page error; Gateway/PostGIS/nền Stadia thật, geocoder fixture có kiểm soát; 375/768/1440 px không tràn, kiểm ảnh. Tra Photon thật trên browser: Cầu Rồng trả 5 gợi ý và mở đúng ghim. Build PASS (4637 modules), `test:contracts` 15/0/0/0. Node 24.21.0, Chromium, Java 21/Docker P02. Các lượt phát triển trước đã gặp timeout lazy module, popup cũ khi chuyển ghim, validation address và test gọi sai route status; đã sửa từng nguyên nhân, không tính các lượt đó là PASS. Toàn suite Catalog còn lỗi event F-43; chi tiết API/bằng chứng BE ở `progress_be.md` mục 9. Next: quản trị kiểm và bổ sung địa chỉ từng địa điểm, CI/review; không đóng gate.

- [ ] FE-P03-16: Đưa thay đổi giao diện/dữ liệu mẫu và bản đồ vào PR — **IN_PROGRESS** · Người làm: Codex · Nhánh: `feature/explore-map-address-search` · Đã có: review code PASS; đang kiểm lại contract/provider/broker/browser trên cùng source. Next: commit theo scope, CI trên revision PR, merge vào main khi kiểm tra đạt; không thay chữ ký/gate.

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
| Gateway thật | `npm --prefix frontend run test:gateway` | Cần stack P02 (`python backend/platform/init_env.py` rồi `docker compose up -d --build --wait`) |
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
| 06/11/2026 19:44 | Merge cấu hình mặc định dùng cloud; 11 checks PASS trên head `0b14e46`: P00 run 42190791704, P01 42190791670, P02 42190791665, P03 42190791684. Giữ trạng thái task/gate; F-41 OPEN vì chưa chứng minh nguyên nhân gốc | [PR #3](https://github.com/24521914-ux/SmartTravel_VN_2.0/pull/3), merge `32e14e902795740828269605fd70838665a75c56` |
| 03/11/2026 00:52 | Trang Chuyến đi khi chưa đăng nhập thành bố cục hai cột tích hợp: CTA đăng nhập bên trái, ảnh Vịnh Hạ Long và nội dung cảm hứng bên phải; VI/EN, theme token, mobile xếp dọc. Build PASS; chưa kiểm browser trực quan | Nhánh feature/explore-ui-demo-content, HEAD ca83db7 (checkout dirty) |
| 03/11/2026 00:46 | Đổi bộ lọc địa lý theo thứ tự tỉnh/thành → khu vực du lịch con → địa điểm; khóa khu vực trước khi chọn tỉnh và xóa lựa chọn cũ khi đổi tỉnh. Seed 12 khu vực cho 29 địa điểm. Browser filters 29/0/0/0, có Gateway thật; build PASS | Nhánh feature/explore-ui-demo-content, HEAD ca83db7 (checkout dirty) |
| 03/11/2026 13:18 | Hoàn thiện UI xác minh/gửi lại/login/reset và kiểm browser thật 13+8+1, 0 page error; 3 viewport. Gmail thật chờ cấu hình; kết nối chỉ ghi tại BE mục 9/O/P, F-44 | `2f21c75`, nhánh `fix/identity-registration-verification`, dirty |
| 03/11/2026 00:34 | Hoàn thiện tài khoản/fixture P02 và ma trận test tay; Playwright 21/0 page error qua FE/Gateway thật, gồm preferences account mới, guest, list/detail/review, quyền user, trip, business/admin và account riêng cho thao tác cuối; 8 account, 29 địa điểm public, legacy hidden. Đối chiếu API/status tại BE mục 9; duplicate import F-42; chưa CI/gate | Nhánh `feature/explore-ui-demo-content`, HEAD `ca83db7` (checkout dirty) |
| 03/11/2026 00:30 | Sửa ảnh thumbnail không giới hạn kích thước làm vỡ phần cận cảnh điểm đến; giới hạn khung ảnh nền, thêm hàng thumbnail cuộn ngang và kiểm đổi lựa chọn; build PASS, browser filters 27/0/0/0 | Nhánh `feature/explore-ui-demo-content`, HEAD `ca83db7` (checkout dirty) |
| 03/11/2026 00:16 | Sửa chữ bị chìm trong mode sáng ở header, tiêu đề, liên kết, bài viết, trạng thái trống và nhãn; thêm kiểm tương phản chữ trên nền phẳng ≥ 4.5:1 cho hai theme. Build PASS; browser filters 26/0/0/0 | Nhánh `feature/explore-ui-demo-content`, HEAD `ca83db7` (checkout dirty) |
| 03/11/2026 00:05 | Căn chỉnh mode sáng theo ảnh tham khảo: nền sáng trung tính, thẻ điểm đến trắng bo tròn, nhãn/sao/giá/nút chi tiết có màu và khung; áp dụng cho bộ lọc, dịch vụ, kế hoạch, đánh giá; kiểm giao diện sáng/tối ở 375/768/1440/1920 px, không lỗi JS | Nhánh `feature/explore-ui-demo-content`, HEAD `ca83db7` (checkout dirty); build PASS, `test:browser:filters` 25/0/0/0 |
| 02/11/2026 23:29 | Làm mới bộ lọc, carousel điểm đến, theme sáng/tối, VI/EN, giá/đánh giá; thêm ảnh Commons có ghi nguồn và hoàn thiện nhãn review demo; build FE PASS, `test:browser:filters` 25/0/0/0; chưa chạy suite BE/contract hoặc CI | Nhánh `feature/explore-ui-demo-content`, HEAD `ca83db7` (checkout dirty) |
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

- [ ] Chuẩn bị PR tích hợp — **BLOCKED** · Codex, nhánh `feature/travel-timeline-account-integration`, source `4e6651e`, checkout dirty chỉ do `.env`/`.ai-memory/` chưa theo dõi. `npm --prefix frontend run build` PASS; `npm --prefix frontend run test:contracts` 15/0/0/0 (run/failed/errors/skipped), Node/TypeScript/Vite, API stub. Chưa chạy lại browser/Gateway/DB thật; chưa nâng trạng thái API hay gate. GitHub cổng 443 timeout, chưa push/PR/CI; bằng chứng backend và việc đồng bộ main tại [progress_be.md](progress_be.md).
