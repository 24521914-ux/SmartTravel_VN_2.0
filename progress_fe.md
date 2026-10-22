# Tiến độ Frontend (FE) — SmartTravel VN

Cập nhật: **22/10/2026 16:50** (GMT+7)

Progress gồm **hai file**: file này (`progress_fe.md`) cho frontend web; [`progress_be.md`](progress_be.md) cho backend và **trạng thái kết nối BE ↔ FE từng API** (mục 9 của file đó). Quy ước trạng thái, tiêu chuẩn PASS và cách cập nhật dùng chung: `progress_be.md` mục 2.

Phạm vi FE hiện tại: **chỉ web** (React). Ứng dụng di động chưa thuộc scope (vấn đề F-17).

## Mục lục

1. [Đọc nhanh](#1-đọc-nhanh)
2. [Cấu trúc frontend](#2-cấu-trúc-frontend)
3. [Màn hình và trạng thái kết nối](#3-màn-hình-và-trạng-thái-kết-nối)
4. [P00 — Khung frontend](#4-p00--khung-frontend)
5. [P01 — API client](#5-p01--api-client)
6. [P02 — Gọi Gateway thật](#6-p02--gọi-gateway-thật)
7. [P03 — Kiểm thử trình duyệt](#7-p03--kiểm-thử-trình-duyệt)
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
| **P01** API client | Client 6 service, auth, refresh xoay vòng, If-Match, Idempotency-Key | `LOCAL_VERIFIED` | `test:contracts` 7/7; CI PASS | Owner N2 nhờ N1 review |
| **P02** Gọi Gateway | Màn nghiệp vụ gọi Gateway thật | `LOCAL_VERIFIED` | `test:gateway`, `test:browser` PASS; CI `connected` PASS | Nối thêm API theo mục 9 |
| **P03** Kiểm thử trình duyệt | user/business/admin, responsive, bàn phím, loading/error/empty, không gọi AI | `LOCAL_VERIFIED` (dirty) | 8 nhóm, 36 case responsive; CI browser PASS | Thêm test cho 17 API 🟡 |
| **P04** Triển khai | Build production, hosting, same-origin với Gateway | `NOT_STARTED` | — | Chờ gate P03 |

**Kết nối BE ↔ FE (chi tiết `progress_be.md` mục 9):** 27 ✅ hoàn thiện · 17 🟡 đã nối, chưa kiểm · 1 ❌ lỗi · 112 ⚪ chưa thực hiện · 14 ⏸️ hoãn (AI) · 1 ➖ không áp dụng.

**Tóm tắt một dòng:** frontend đã chạy được các luồng chính qua Gateway thật (đăng nhập, khám phá, yêu thích, bộ sưu tập, chuyến đi, doanh nghiệp, kiểm duyệt, nguồn dữ liệu) và qua test trình duyệt, nhưng mới dùng 44/157 API không AI của backend.

**Người phụ trách:** N2 sở hữu cấu hình chung và màn Community/Trip/Intelligence; N1 làm màn auth/tìm kiếm/doanh nghiệp/admin ingestion. Review chéo.

---

## 2. Cấu trúc frontend

| Thành phần | Nội dung |
|---|---|
| Stack | React 19.2, TypeScript 5.9, Vite 7.3; Playwright cho test trình duyệt |
| Chạy dev | `http://127.0.0.1:5173/app`; Vite proxy `/api` → Gateway (`P02_GATEWAY_TARGET`, mặc định `http://127.0.0.1:58080`) |
| `src/api/client.ts` | Gửi request tới `/api/<service>/api/v1/...`; tự gắn Bearer, `If-Match`, `Idempotency-Key`, correlation ID; chuyển lỗi domain/409/timeout thành lỗi rõ ràng; **không tự retry thao tác ghi** |
| `src/api/identity.ts` | Login, refresh, logout. Refresh dùng chung một request khi nhiều chỗ gọi cùng lúc vì refresh token chỉ dùng được một lần |
| `src/api/travel.ts` | `read` (GET), `mutate` (ghi, kèm version), hàm tiện ích địa điểm/review/recommendation |
| `src/TravelApp.tsx` | Khung app, menu 10 mục, các màn Khám phá, Bộ sưu tập, Chuyến đi, Thông báo, Tài khoản, Quản trị |
| `src/TripEditor.tsx` | Ngày và địa điểm trong chuyến đi |
| `src/OperationalPanels.tsx` | Bản đồ, Doanh nghiệp, Kiểm duyệt |
| `src/features.ts` | `aiEnabled` từ `VITE_AI_ENABLED`; `false` thì ẩn Gợi ý, quản trị model và ô consent AI |

> **Lưu ý:** `TravelApp` dùng `browserTokenStore`, nên access + refresh token nằm trong `localStorage` (khóa `smarttravel.auth`) để giữ phiên khi tải lại trang. Script test dùng `memoryTokenStore`. Trước P04 cần đánh giá lại rủi ro XSS của cách lưu này.

---

## 3. Màn hình và trạng thái kết nối

| Màn hình (menu) | Đã làm được | Kết nối | Còn thiếu |
|---|---|---|---|
| Đăng nhập / tài khoản mới | Đăng nhập, đăng xuất, đăng ký, xác minh email | ✅ login/refresh/logout; 🟡 đăng ký, xác minh email | Quên mật khẩu, đặt lại mật khẩu |
| Khám phá | Danh sách, tìm theo từ khóa, xem thêm, chi tiết địa điểm, đánh giá, lưu yêu thích, viết đánh giá | ✅ danh sách/chi tiết/đánh giá/yêu thích; 🟡 viết đánh giá | Bộ lọc category/vùng/giá/rating/bán kính, ảnh (❌ F-14), sửa/xóa/report review, bỏ yêu thích, offering |
| Bản đồ | Tìm địa điểm, xem tọa độ, link và iframe OpenStreetMap (bật khi người dùng chọn) | ✅ | Nhiều marker, vẽ tuyến; MapLibre theo quyết định P00 |
| Gợi ý | Ẩn khi AI tắt | ⏸️ | Bật khi tiếp tục phần AI |
| Bộ sưu tập | Danh sách, tạo, xem chi tiết, thêm địa điểm | ✅ danh sách/tạo; 🟡 chi tiết, thêm địa điểm | Sửa/xóa collection, sửa/xóa/sắp xếp item, xem collection công khai |
| Chuyến đi | Danh sách, tạo, chi tiết, thêm ngày, thêm địa điểm vào ngày, khóa/mở khóa | ✅ | Sửa/xóa trip, đổi trạng thái, chặng theo destination, sắp xếp item, di chuyển, ước tính tuyến, làm mới snapshot, xóa ngày/item |
| Thông báo | Danh sách, đánh dấu đã đọc | ✅ danh sách; 🟡 đã đọc | — |
| Tài khoản | Hồ sơ, đổi tên hiển thị, xem preferences, yêu cầu xóa dữ liệu | ✅ xem; 🟡 đổi tên, preferences, xóa dữ liệu | Chọn category/phong cách/ngân sách (cần `GET /preference-options`), đổi mật khẩu, quản lý phiên đăng nhập, danh sách favorite, đóng góp của tôi |
| Doanh nghiệp | Danh sách, tạo, xem chi tiết, thành viên, gửi xác minh, yêu cầu quản lý địa điểm | ✅ (trừ claim 🟡) | Sửa/xóa doanh nghiệp, quản lý thành viên, yêu cầu sửa thông tin địa điểm, xem trạng thái claim (thiếu API, F-16) |
| Kiểm duyệt (admin) | Danh sách review / địa điểm, duyệt review, đổi trạng thái địa điểm, duyệt xác minh doanh nghiệp | ✅ danh sách review; 🟡 còn lại | Hàng chờ claim/yêu cầu sửa/media/report/đóng góp (thiếu API list, F-16); phải nhập ID xác minh bằng tay |
| Quản trị (admin) | Danh sách nguồn dữ liệu, tạo import job, xem trạng thái job | ✅ danh sách nguồn; 🟡 import | CRUD nguồn/policy, items/errors/candidates, retry/cancel, quyết định item; quản lý user/role; CRUD địa điểm, địa lý, destination, taxonomy, offering |

---

## 4. P00 — Khung frontend

- [x] FE-P00-01: Khung React/TypeScript/Vite, build, dev proxy tới stub — **LOCAL_VERIFIED** · `npm run build` PASS, `npm audit` 0 lỗ hổng (08/10/2026) · CI P00 frontend PASS run 39540804336.
- [x] FE-P00-02: Landing page — **LOCAL_VERIFIED** · PR #3.

## 5. P01 — API client

- [x] FE-P01-01: Client 6 service theo prefix Gateway; giữ tên field snake_case của contract — **LOCAL_VERIFIED** · `npm run test:contracts` 7/7 · PR #15.
- [x] FE-P01-02: Bearer, `If-Match`, `Idempotency-Key`, trace; xử lý 204, lỗi domain, xung đột version, timeout, JSON hỏng — **LOCAL_VERIFIED** · test "requests preserve bearer, version, idempotency, trace and JSON fields", "204 and domain errors preserve status and trace".
- [x] FE-P01-03: Refresh xoay vòng dùng chung một request; refresh muộn không ghi đè login mới; logout chờ refresh xong — **LOCAL_VERIFIED** · 4 test refresh/logout trong `mock-contract-test.mjs`.
- [ ] Review FE P01 (N1) — **NOT_STARTED**.

## 6. P02 — Gọi Gateway thật

- [x] FE-P02-01: Màn nghiệp vụ gọi Gateway thật thay cho stub — **LOCAL_VERIFIED** · `npm run test:gateway` (login, hồ sơ, preferences, địa điểm, review, collection, trip, thông báo, refresh, logout) PASS 11/10/2026 · PR #16 · CI `connected` PASS run 39540804333. Tương ứng P02-09 bên BE.
- [x] FE-P02-02: Hiển thị trạng thái chờ khi thao tác cần ack (xác minh doanh nghiệp, import job) — **LOCAL_VERIFIED** · browser kiểm chữ "chờ/PENDING".
- [ ] FE-P02-03: Nối đủ API không AI của backend — **PARTIAL** · 44/157 API đã nối (27 ✅, 17 🟡) · Thiếu: 112 API ⚪ (mục 9) · Người xử lý: N2 + N1.

## 7. P03 — Kiểm thử trình duyệt

- [x] FE-P03-01 (P03-07): Test trình duyệt phạm vi không AI — **LOCAL_VERIFIED** (dirty, 20/10/2026) · `npm run test:browser` (`browser-nonai.mjs`): 8 nhóm user/business/admin, 36 case responsive ở 320/390/768/1280 px, phím Tab tới control, trạng thái loading khi API trả 503, danh sách rỗng, bản đồ bật theo lựa chọn, 0 request AI, 0 lỗi trang · CI browser PASS run 39540804333.
- [x] FE-P03-02: Tắt AI mặc định (`VITE_AI_ENABLED=false`): ẩn Gợi ý, model admin, ô consent AI — **LOCAL_VERIFIED** · browser kiểm không có menu Gợi ý, không có option models · PR #20.
- [ ] FE-P03-03: Test cho 17 API 🟡 — **NOT_STARTED** · Next: thêm bước vào `browser-nonai.mjs` (đăng ký, viết review, thêm item collection, duyệt review, import job…).
- [ ] FE-P03-04: Kiểm thử accessibility đầy đủ (WCAG) — **NOT_STARTED** · Hiện mới kiểm label, focus bàn phím, responsive cơ bản.
- [ ] FE-P03-05: Test UI phần AI (`test:browser:ai`) — **DEFERRED** (người dùng, 20/10/2026).

## 8. P04 — Triển khai

- [ ] FE-P04-01: Build production và hosting cùng domain với Gateway (không dùng Vite proxy) — **NOT_STARTED**.
- [ ] FE-P04-02: Cấu hình CORS/origin production ở Gateway (`CORS_ALLOWED_ORIGINS`) — **NOT_STARTED**.
- [ ] FE-P04-03: Smoke sau triển khai user/admin/business/trip/map — **NOT_STARTED**.

---

## 9. Việc FE còn phải làm

Thứ tự ưu tiên đề xuất (đối chiếu `progress_be.md` mục 9):

| Ưu tiên | Việc | API backend đã sẵn | Phụ thuộc |
|---|---|---|---|
| 1 | Hiển thị ảnh địa điểm/review | Cần sửa backend trước | F-14 (backend) |
| 2 | Test cho 17 API 🟡 | Có | — |
| 3 | Quên/đặt lại/đổi mật khẩu, quản lý phiên | `forgot-password`, `reset-password`, `PUT /me/password`, `GET/DELETE /me/sessions` | — |
| 4 | Bộ lọc tìm kiếm (category, vùng, destination, giá, rating, bán kính) | `GET /categories`, `/tags`, `/amenities`, `/geographic-units`, `/destinations`; tham số `GET /places` | F-15 (field Place thiếu trong contract) |
| 5 | Chọn sở thích (category, phong cách, ngân sách) | `GET /preference-options`, `PUT /me/preferences` | — |
| 6 | Favorite và review đầy đủ | `GET /me/favorites`, `DELETE /me/favorites/{id}`, `PATCH/DELETE /reviews/{id}`, `POST /reviews/{id}/reports` | — |
| 7 | Chuyến đi đầy đủ | segment, transfer, `route-estimates`, `snapshots/refresh`, reorder, `PUT /trips/{id}/state` | — |
| 8 | Bộ sưu tập đầy đủ | sửa/xóa, item, `PUT .../items/order`, `GET /collections/{id}` | — |
| 9 | Đóng góp dữ liệu (user + admin) | `POST/PATCH /contributions`, `withdraw`, `GET /me/contributions`, `GET/POST /admin/contributions` | — |
| 10 | Admin Catalog, user, report, ingestion chi tiết | 40 API admin Catalog, `admin/users`, `admin/reports`, import items/errors/candidates/retry/cancel/decision | F-16 cho hàng chờ duyệt |
| 11 | Bản đồ nhiều điểm và tuyến | `GET /places?lat&lon&radiusM`, `route-estimates` | Provider bản đồ thật (P04) |

---

## 10. Vấn đề đang mở liên quan FE

Danh sách đầy đủ và trạng thái: `progress_be.md` mục 10.

| ID | Mức | Ảnh hưởng tới FE |
|---|---|---|
| F-14 | Cao | Không upload được ảnh cho review/doanh nghiệp; ảnh cần JWT nên `<img>` không tải được |
| F-15 | Trung bình | Contract Place thiếu `address`, `description`, `rating_avg`, `review_count`, `media`; client sinh từ OpenAPI sẽ thiếu field hiển thị |
| F-16 | Trung bình | Không có API liệt kê hàng chờ duyệt; admin phải nhập ID tay, doanh nghiệp không xem được claim của mình |
| F-17 | Trung bình | Chưa có scope di động (push, deep link, lưu token trên thiết bị) |
| F-18 | Trung bình | FE mới nối 44/157 API không AI |

---

## 11. Lệnh chạy và kiểm thử

Chạy từ thư mục gốc repo; Node 24.

| Mục đích | Lệnh | Ghi chú |
|---|---|---|
| Cài đặt | `npm --prefix frontend ci` | |
| Chạy dev | `npm --prefix frontend run dev` | Cần Gateway P02 ở `127.0.0.1:58080` hoặc đặt `P02_GATEWAY_TARGET` |
| Contract client | `npm --prefix frontend run test:contracts` | Không cần backend |
| Build | `npm --prefix frontend run build` | `tsc --noEmit` + Vite build |
| Gateway thật | `npm --prefix frontend run test:gateway` | Cần stack P02 (`python backend/infra/p02.py up`) |
| Trình duyệt | `npm --prefix frontend run test:browser` | Cần stack P02 và dev server; ảnh chụp lưu ở `backend/infra/.local/p03/frontend-browser/` (bị Git ignore) |
| Bật AI khi làm phần AI | `VITE_AI_ENABLED=true` (FE) và `AI_ENABLED=true` (Gateway) | Phải bật cả hai |

---

## 12. Lịch sử cập nhật

| Thời điểm | Thay đổi | PR / commit |
|---|---|---|
| 22/10/2026 16:50 | Tạo `progress_fe.md` khi tách progress BE/FE; ghi trạng thái màn hình và việc FE còn thiếu | Nhánh `docs/progress-be-fe-split` |
| 21/10/2026 11:00 | Tắt AI mặc định, test trình duyệt không AI | PR #20, `c1e8e29` |
| 15/10/2026 | Màn nghiệp vụ gọi Gateway thật | PR #16, `14b342c` |
| 15/10/2026 | API client + refresh xoay vòng | PR #15, `42eac23` |
| 08/10/2026 | Khung React/TS/Vite (P00); landing page | PR #2, PR #3 |
