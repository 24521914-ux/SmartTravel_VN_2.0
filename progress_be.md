# Tiến độ Backend (BE) — SmartTravel VN

Cập nhật: **05/11/2026 19:16** (GMT+7)

Kiểm lại runtime 05/11/2026: **PARTIAL**, Codex, nhánh `feature/identity-skip-email-verification`, SHA `91f15aa`, dirty. Image Identity cũ đóng gói JAR trước thay đổi; đã `mvn -f backend/services/identity-service/pom.xml package -DskipTests -q`, `python backend/platform/build_service_image.py identity --tag smarttravel-identity:p02-local`, recreate riêng Identity, readiness 200. Kiểm API qua Gateway/PostgreSQL Docker thật, Java 21: 4/0/0/0 (admin login 200, kích hoạt tài khoản PENDING qua admin status 200, đăng ký synthetic 202, đăng nhập ngay 200). Không đổi mật khẩu tài khoản người dùng. Chưa kiểm đăng nhập bằng mật khẩu người dùng sau kích hoạt; mật khẩu thử trước đó trả 401. F-35 vẫn PARTIAL: chưa full DB/broker suite/FE end-to-end/CI; không đóng gate. Các ghi chú chưa kiểm runtime bên dưới là mốc trước lần kiểm này.

- [ ] P01 Identity — đăng ký không cần xác minh email: **PARTIAL** · Codex, nhánh `feature/identity-skip-email-verification`, baseline `91f15aa`, dirty. Theo yêu cầu người dùng 05/11/2026: mặc định `IDENTITY_EMAIL_VERIFICATION_REQUIRED=false`, tài khoản mới ACTIVE nhưng `email_verified_at` vẫn null; không gửi mã, giữ xác minh cho tài khoản PENDING cũ. FE chuyển sang đăng nhập, giữ email, xóa mật khẩu. Playwright `node frontend/scripts/browser-registration.mjs`: 1/0/0/0, Chromium + API stub; build FE PASS. Chưa kiểm DB/Gateway thật hoặc CI; suite xác minh cũ cần cấu hình bật xác minh. F-35; không đóng gate. Backend: `mvn -f backend/services/identity-service/pom.xml test -q`, Java 21, 66/0/0/44; 22 unit/security chạy thật, DB/broker skip. Lần đầu FAIL do fixture Mockito trả Map rỗng cho idempotency, đã sửa stub null; không phải flaky.

Progress gồm **hai file**: file này (`progress_be.md`) cho backend, Gateway, hạ tầng và **trạng thái kết nối BE ↔ FE**; [`progress_fe.md`](progress_fe.md) cho frontend web. Mỗi file sắp theo phase P00 → P04. Yêu cầu chi tiết của từng phase vẫn nằm trong `plan/phases/`; file này chỉ ghi **đã làm tới đâu, kiểm bằng gì, làm gì tiếp**.

## Mục lục

1. [Đọc nhanh: dự án đang ở đâu](#1-đọc-nhanh-dự-án-đang-ở-đâu)
2. [Quy ước ghi tiến độ](#2-quy-ước-ghi-tiến-độ)
3. [Bản đồ hệ thống và luồng hoạt động](#3-bản-đồ-hệ-thống-và-luồng-hoạt-động)
4. [P00 — Chuẩn bị chung](#4-p00--chuẩn-bị-chung)
5. [P01 — Phát triển và kiểm thử độc lập](#5-p01--phát-triển-và-kiểm-thử-độc-lập)
6. [P02 — Kết nối các service](#6-p02--kết-nối-các-service)
7. [P03 — Kiểm thử hệ thống](#7-p03--kiểm-thử-hệ-thống)
8. [P04 — Phát hành](#8-p04--phát-hành)
9. [Kết nối BE ↔ FE](#9-kết-nối-be--fe)
10. [Vấn đề đang mở](#10-vấn-đề-đang-mở)
11. [Lệnh chạy kiểm thử backend](#11-lệnh-chạy-kiểm-thử-backend)
12. [Lịch sử cập nhật](#12-lịch-sử-cập-nhật)

---

## 1. Đọc nhanh: dự án đang ở đâu

| Phase | Mục tiêu | Trạng thái | Đã kiểm ở mức | Còn thiếu để đóng gate | Việc tiếp theo |
|---|---|---|---|---|---|
| **P00** Chuẩn bị chung | Contract, fixture, template, 6 skeleton chạy độc lập | `READY_FOR_REVIEW` | Local | N1/N2 ký nhận gói và freeze contract `1.0.0-candidate` | N1/N2 review contract; quyết định có mở `1.1.0` cho F-14…F-16 trước khi freeze |
| **P01** Phát triển độc lập | 6 service có nghiệp vụ thật, test với DB thật + stub đối tác | 60/67 task `LOCAL_VERIFIED`; 7 task `PARTIAL` gồm phát event Catalog F-33 | Local DB/broker thật + CI cũ cho 5 service | Sửa F-33; chữ ký reviewer từng service; xác nhận ánh xạ CI → task | N1 xử lý F-33; review chéo các service |
| **P02** Kết nối thật | Gateway, HTTP, broker giữa 6 service, frontend qua Gateway | `PARTIAL` 12/15 task | Local P02 trên UI hiện tại; CI cũ không đại diện revision mới | P02-01, P02-08, P02-14; chữ ký | Xử lý F-01/F-06/F-07; review các commit tích hợp |
| **P03** Kiểm thử hệ thống | E2E, bảo mật, lỗi phụ thuộc, tải, restore, browser | `PARTIAL`; P03-07 `LOCAL_VERIFIED` trên UI hiện tại | Browser Gateway P02 thật; chưa chạy lại toàn bộ gate | Gate trên revision sạch; CI mới, chữ ký; AI hoãn | Chạy lại gate khi đủ điều kiện, N1/N2 review |
| **P04** Phát hành | Triển khai mới, rollback, bàn giao vận hành | `NOT_STARTED` | — | Toàn bộ; bị chặn bởi gate P03 | Chuẩn bị target triển khai, domain, credential provider |
| **Kết nối BE ↔ FE** | Từng API public/admin qua Gateway | 155 ✅ · 5 🟡 · 0 ❌ · 0 ⚪ · 14 ⏸️ · 4 ➖ (mục 9) | Bằng chứng lịch sử 161 API; timeline mới xem T; còn scanner và F-32 | Scanner thật (F-14); contract/CI + N1 review cho representation (F-15) | Kiểm scanner khi có; xử lý F-32, chạy contract mới và review N1 |

**Tóm tắt một dòng:** đã nối và kiểm thử FE hiện tại với Gateway/DB/broker thật trên dữ liệu tổng hợp P02; sửa sai contract và loại bỏ ghi giả khi API lỗi. Chưa xác nhận hai nhánh media phụ thuộc scanner thật; người dùng xác nhận 30/10/2026 tiếp tục bằng P02, chưa có dữ liệu du lịch có giấy phép. AI vẫn `DEFERRED`; không đóng gate hoặc ký thay N1/N2.

**Phân công:** N1 sở hữu Identity, Catalog, Ingestion, platform/Gateway/CI. N2 sở hữu Community, Trip, Intelligence, frontend. Hai người review chéo cho nhau; không tự duyệt phần mình.

---

## 2. Quy ước ghi tiến độ

### 2.1. Trạng thái task

| Trạng thái | Ý nghĩa | Ô đánh dấu |
|---|---|---|
| `NOT_STARTED` | Chưa có code | `[ ]` |
| `IN_PROGRESS` | Đang làm; ghi người làm và nhánh | `[ ]` |
| `BLOCKED` | Bị chặn; ghi chặn bởi gì, ai xử lý, việc vẫn làm được | `[ ]` |
| `PARTIAL` | Đã có một phần tiêu chí; ghi rõ phần thiếu | `[ ]` |
| `DEFERRED` | Tạm hoãn theo quyết định người dùng; ghi ai quyết định và ngày | `[ ]` |
| `N/A` | Không áp dụng; ghi lý do và người quyết định | `[ ]` |
| `LOCAL_VERIFIED` | Đủ tiêu chí trong `plan/`, test PASS ở local | `[x]` |
| `CI_VERIFIED` | Như trên và CI GitHub PASS, có run ID, đúng revision | `[x]` |
| `ACCEPTED` | Owner và reviewer chéo đã xác nhận bằng văn bản | `[x]` |

Trạng thái cấp service/phase: `READY_FOR_INTEGRATION` (qua P01) → `CONNECTED` (qua P02) → `SYSTEM_VERIFIED` (qua P03; phạm vi không AI ghi `P03_NON_AI_VERIFIED`) → `RELEASED` (qua P04). Chỉ ghi khi gate có đủ bằng chứng **và** chữ ký.

### 2.2. Trạng thái kết nối BE ↔ FE (dùng ở mục 9)

| Ký hiệu | Ý nghĩa | Điều kiện |
|---|---|---|
| ✅ Hoàn thiện | FE gọi API qua Gateway và được test FE thật kiểm | Có trong `npm run test:gateway` hoặc `npm run test:browser`, và lần chạy gần nhất PASS (local hoặc CI có run ID) |
| 🟡 Đã nối, chưa kiểm | FE có màn hình gọi API nhưng chưa đủ bằng chứng kiểm thử các nhánh cần thiết | Ghi rõ nhánh đã kiểm và phần còn thiếu; không tính nhánh chưa chạy là PASS |
| ❌ Lỗi | FE gọi hoặc cần gọi nhưng thất bại: test FAIL, API trả sai, contract lệch làm FE không dùng được | Bắt buộc ghi vấn đề `F-xx` |
| ⚪ Chưa thực hiện | BE đã có API, FE chưa có màn hình gọi | Ghi việc cần làm ở `progress_fe.md` |
| ⏸️ Hoãn | Phạm vi đang `DEFERRED` (AI) | Bật lại khi người dùng tiếp tục phần AI |
| ➖ Không áp dụng | API không dành cho FE (ví dụ JWKS) | Ghi lý do |

Khi nối thêm hoặc sửa một API: đổi ký hiệu ở dòng API trong mục 9, cập nhật bảng tổng, cập nhật màn hình tương ứng trong `progress_fe.md`.

### 2.3. Một lần test được tính là PASS khi

- 0 failure, 0 error. Một test fail thì cả suite FAIL.
- **Skip không phải pass.** `mvnw verify` thường sẽ skip suite DB/broker; chỉ tính DB/broker khi chạy `test-local.py` với Docker (mục 11).
- Ghi đủ: lệnh, số run/fail/error/skip, commit SHA, checkout sạch hay dirty, môi trường (Java 21, Docker…). Kết quả trên checkout dirty chỉ đủ cho `LOCAL_VERIFIED` kèm ghi chú "dirty".
- CI phải có run ID. Test flaky không được chạy lại tới khi pass rồi ghi PASS.
- Không suy trạng thái từ: PR đã merge, số endpoint, README, lời dev khác chưa có bằng chứng.

### 2.4. Cách cập nhật progress

1. Sửa dòng task trong phase tương ứng theo mẫu:
   `- [x] P0x-yy: <nội dung> — **TRẠNG_THÁI** · Bằng chứng: <test/lệnh, số liệu, SHA> · Next: <việc tiếp theo>`
2. Cập nhật bảng mục 1 nếu trạng thái phase đổi; cập nhật mục 9 khi kết nối BE ↔ FE đổi; cập nhật mục 10 nếu có vấn đề mới hoặc vừa đóng.
3. Thêm một dòng lên đầu mục "Lịch sử cập nhật" và sửa dòng **Cập nhật** ở đầu file (ngày giờ GMT+7). Việc của frontend ghi ở `progress_fe.md`.
4. Commit riêng: `docs(progress): <tóm tắt>`; không gộp với commit code. PR đổi chức năng phải cập nhật file này trong cùng PR.
5. Không ghi password, token, key, connection string có credential, email/PII thật.
6. Agent không tự đặt `ACCEPTED`, không đóng gate, không ký thay N1/N2.

---

## 3. Bản đồ hệ thống và luồng hoạt động

### 3.1. Service

| Service | Cổng | Lưu trữ | Trách nhiệm |
|---|---|---|---|
| API Gateway | 8080 (local P02: 58080) | — | Cổng duy nhất cho client. Route `/api/<service>/**`, kiểm JWT + audience, chặn `/internal/**` và `actuator`, đổi token người dùng lấy token ngắn hạn cho đúng service đích, CORS. Tắt route AI khi `AI_ENABLED=false` |
| Identity | 8101 | PostgreSQL | Đăng ký, xác minh email, login, refresh xoay vòng, logout, đặt lại mật khẩu; hồ sơ; preferences + consent; RBAC; thông báo (inbox + email Mailpit); yêu cầu xóa dữ liệu; JWKS |
| Catalog | 8102 | PostgreSQL + PostGIS | Nguồn chuẩn địa điểm, địa lý, destination, category/tag/amenity, offering, giờ mở cửa, giá, media, doanh nghiệp/claim. Giữ bản chiếu rating từ Community |
| Community | 8103 | MongoDB replica set | Review + kiểm duyệt + report, rating summary (bản gốc), favorite, collection, đóng góp dữ liệu |
| Trip | 8104 | PostgreSQL | Chuyến đi, chặng, ngày, item, sắp xếp, di chuyển, ước tính tuyến, snapshot địa điểm |
| Ingestion | 8105 | PostgreSQL | Nguồn dữ liệu + license, import job, chuẩn hóa, chống trùng, ghép địa điểm, gửi lệnh sang Catalog |
| Intelligence | 8106 | PostgreSQL + pgvector | Lịch sử tương tác, đặc trưng, recommendation Basic, dataset/training/model. **AI đang DEFERRED**; service vẫn chạy để trả xác nhận xóa dữ liệu |
| Hạ tầng | RabbitMQ 5672 (P02: 55672), Mailpit 1025/8025 | — | Broker event, hộp thư sandbox |

Mỗi service có database và tài khoản riêng; không service nào đọc DB của service khác. Dữ liệu chéo đi qua HTTP nội bộ `/internal/v1/**` hoặc event. Contract chuẩn: `backend/contracts/` (183 HTTP operation, 23 event/command, phiên bản `1.0.0-candidate`).

### 3.2. Luồng chính

| Mã | Luồng | Input → Xử lý → Output | Chức năng | Trạng thái |
|---|---|---|---|---|
| FLOW-01 | Đăng nhập và đi qua Gateway | Email/mật khẩu → Identity cấp access + refresh token → mỗi request Gateway đổi token qua `/internal/v1/security/exchange` → service đích kiểm phiên còn sống → trả dữ liệu | F01 | CI PASS |
| FLOW-02 | Lưu sở thích | `PUT /me/preferences` (category UUID, phong cách, ngân sách, consent) + `If-Match` → Identity kiểm category với Catalog → lưu + outbox → event `identity.preferences.changed.v1` | F01, F05 | Phần Identity CI PASS; phần Intelligence DEFERRED |
| FLOW-03 | Tìm kiếm địa điểm | `GET /places?q&lat&lon&radiusM&categoryId&minPrice&maxPrice&minRating&cursor` → tên/địa chỉ bỏ dấu + alias + PostGIS → trang kết quả, cursor ổn định | F02–F04 | Local V9: `CatalogDatabaseTests` 20/0/0/0 và browser map 8/0/0/0; CI revision mới chưa chạy |
| FLOW-04 | Review → rating | Tạo review (`PENDING`) → admin duyệt → Community cập nhật rating + outbox → `community.rating-summary.changed.v1` → Catalog lưu bản chiếu nếu version mới hơn | F06 | CI PASS |
| FLOW-05 | Favorite và collection | `PUT/DELETE /me/favorites/{place}`; collection public/private, item, sắp xếp → Community kiểm địa điểm qua Catalog → event `community.favorite.changed.v1` | F07 | CI PASS |
| FLOW-06 | Lập chuyến đi | Tạo trip → chặng/ngày → thêm item (Catalog kiểm + lưu snapshot) → sắp xếp với `If-Match` → di chuyển, ước tính tuyến → `trip.item.added.v1` | F09, F10 | CI PASS |
| FLOW-07 | Đóng góp dữ liệu | User gửi đóng góp → admin duyệt → `community.contribution.apply-requested.v1` → Catalog áp dụng → `catalog.contribution.applied/rejected.v1` → Community `APPLIED`/`APPLY_FAILED` | F02, F11 | CI PASS (Identity chưa nhận thông báo, F-01) |
| FLOW-08 | Doanh nghiệp | Tạo doanh nghiệp → xác minh → claim địa điểm → admin duyệt → `catalog.business-claim.reviewed.v1` → gửi yêu cầu sửa field | F03, F11 | CI PASS |
| FLOW-09 | Nhập dữ liệu nguồn | Admin tạo import job → fetch/chuẩn hóa/hash/ghép → `ingestion.place.upsert-requested.v1` (UUID cố định) → Catalog → `catalog.place-import.applied/rejected.v1` → checkpoint tiến khi đủ ack | F11 | CI PASS |
| FLOW-10 | Ẩn địa điểm | Admin đổi status → `catalog.place.visibility-changed.v1` → Community/Trip/Intelligence ẩn hoặc đánh dấu không khả dụng | F02, F09 | CI PASS |
| FLOW-11 | Xóa dữ liệu người dùng | `POST /me/deletion-requests` → `identity.user.deletion-requested.v1` → các service xóa/ẩn danh → `domain.user-data-deleted.v1` → Identity hoàn tất khi đủ 6 ack | F01 | CI PASS |
| FLOW-12 | Dữ liệu đầu vào cho Intelligence | Đăng ký nhận event → lấy snapshot (địa điểm, preferences, rating, lịch sử trip) kèm watermark → áp event mới hơn → chống trùng theo `event_id` | F05, F08 | LOCAL_VERIFIED; DEFERRED ở P03 |
| FLOW-13 | Recommendation | `POST /recommendations` (topN, category, ngân sách, vị trí, bán kính; user lấy từ JWT) → chấm điểm trên dữ liệu nội bộ → kiểm visibility với Catalog → Top N + giải thích | F05 | DEFERRED |
| FLOW-14 | Ghi tương tác | Client: `POST /interactions/batch` chỉ `SEARCH`, `PLACE_VIEW`. Favorite/review/trip đi bằng event từ server | F08 | DEFERRED |

Ngoài phạm vi (không có trong contract): gợi ý "tương tự/xu hướng", tự sinh lịch trình tối ưu tuyến, đặt phòng, thanh toán, chat.

### 3.3. Điểm hay hiểu sai

1. **URL qua Gateway có hai lần `api`:** `/api/catalog/api/v1/places`. Gateway bỏ `/api/catalog` rồi chuyển tiếp. Mọi `/api/*/internal/**` luôn bị chặn.
2. **Logout hoặc khóa user có hiệu lực ngay.** Service kiểm phiên với Identity ở mỗi request; Identity sập thì service từ chối, không cho qua.
3. **API trả 2xx chưa có nghĩa service khác đã cập nhật.** Event đi qua outbox → RabbitMQ → inbox. UI phải hiện trạng thái chờ: đóng góp ở `APPLYING`, import chưa `SUCCEEDED`, yêu cầu xóa chưa xong khi chưa đủ ack.
4. **Ghi dữ liệu cần `If-Match` (version) và `Idempotency-Key`.** Hai người sửa cùng version thì một người nhận 409. Gửi lại cùng key trả kết quả cũ, không tạo trùng.
5. **Rating có hai bản:** Community giữ bản gốc, Catalog giữ bản chiếu để lọc `minRating`. Bản chiếu chỉ nhận version mới hơn nên event đến trễ không làm rating lùi. 0 review thì rating là `NULL`.
6. **Trip lưu snapshot địa điểm.** Catalog sập vẫn đọc được trip. Địa điểm bị ẩn thì item bị đánh dấu không khả dụng, không bị xóa.
7. **Ước tính tuyến không bịa thời gian.** Provider bản đồ chưa nối thật; khi lỗi, hệ thống trả khoảng cách đường chim bay **có nhãn fallback** và không có thời gian.
8. **Giá `NULL` khác `0`:** `NULL` là chưa biết giá, `0` là miễn phí.
9. **Ingestion không ghi thẳng vào Catalog.** Catalog quyết định áp dụng hay từ chối; import lại không tạo địa điểm trùng.
10. **AI tắt mặc định:** `AI_ENABLED=false` ở Gateway (route trả `503 FEATURE_DEFERRED`), `VITE_AI_ENABLED` ở frontend. Bật thì phải bật cả hai.
11. **ID luôn là UUID.** Event luôn có envelope: `event_id`, `event_type`, `schema_version`, `aggregate_*`, `occurred_at`, `producer`, `correlation_id`, `causation_id`, `traceparent`, `payload`. Consumer không ACK event có version chưa hỗ trợ; event đó vào DLQ.

---

## 4. P00 — Chuẩn bị chung

Yêu cầu: `plan/phases/P00-scope-architecture.md` · Trạng thái phase: **`READY_FOR_REVIEW`**

- [x] P00-01: Ánh xạ 11 nhóm chức năng / 42 bảng nguồn vào 6 service; Community dùng MongoDB — **LOCAL_VERIFIED** · Bằng chứng: `plan/P00-POLICIES.md`, `plan/database/community-mongodb.md`.
- [x] P00-02: Phân công N1/N2, review chéo, quyền sở hữu thư mục — **LOCAL_VERIFIED** · Bằng chứng: người dùng xác nhận 08/10/2026.
- [ ] P00-03: OpenAPI 183 operation, validator PASS — **PARTIAL** · Thiếu: N1/N2 duyệt và freeze `1.0.0-candidate` (F-05) · Next: quyết định có mở `1.1.0` cho F-14…F-16 trước khi freeze.
- [ ] P00-04: 23 event/command schema + registry producer/consumer — **PARTIAL** · Thiếu: freeze; registry còn 3 message Identity không nhận (F-01).
- [x] P00-05: Fixture chung, negative case, bộ sinh dữ liệu tổng hợp 83.000 bản ghi (checksum khớp hai lần) — **LOCAL_VERIFIED**.
- [x] P00-06: 6 skeleton chạy độc lập trên DB riêng; stub HTTP cho 183 operation; JWKS; event harness — **LOCAL_VERIFIED**.
- [x] P00-07: Java 21 / Spring Boot 3.5.13, image non-root, health, log correlation, CI template — **LOCAL_VERIFIED** · CI P00 PASS run 39540804336.
- [x] P00-08: Chốt frontend, triển khai mới, Basic trước ML, baseline SLO/RPO/RTO/retention — **LOCAL_VERIFIED** · Bằng chứng: `plan/P00-DECISIONS.md`.
- [ ] P00-09: Bàn giao gói cho 6 owner cùng revision — **PARTIAL** · Thiếu: N1/N2 xác nhận nhận gói.
- [x] P00-RC-PLAN: Phân tích và lập master plan Unified Modular Recommendation (chỉ tài liệu) — **LOCAL_VERIFIED** · Người làm: Codex, nhánh `docs/intelligence-modular-recommendation-plan` · Bằng chứng: Python stdlib, 11 nhóm kiểm tra tĩnh / 0 lỗi / 0 bỏ qua: [13 file](docs/recommendation/00-readme.md), 33 JSON, 171 link nội bộ, 60 task đủ 15 trường, DAG không vòng, tổng 115 ngày-người, phép tính 5 ví dụ khớp; baseline `89eb8cb`, commit `0df6399`, Python 3.14/Windows, không dùng Java/DB/broker vì chỉ tài liệu. 10 Mermaid đã rà văn bản, chưa render (không có CLI/package sẵn); không chạy test nghiệp vụ/CI, không đóng gate. Next: N2/N1 review contract/purpose và RC-G1-01/02 trước code; AI và trạng thái kết nối giữ nguyên.
- [ ] **Gate P00** — **PARTIAL** · Thiếu: chữ ký N1/N2 và freeze contract. Ghi chú: P01–P03 đã chạy trước khi gate P00 đóng (F-05).

---

## 5. P01 — Phát triển và kiểm thử độc lập

Yêu cầu: `plan/phases/P01-services/*.md` · Trạng thái phase: **`PARTIAL`** (người dùng chấp nhận 11/10/2026; chưa có chữ ký reviewer).

**Bằng chứng chung cho các task `LOCAL_VERIFIED` dưới đây:**
- Local 14/10/2026, suite DB/broker disposable thật (`test-local.py`, Identity thêm `--transport --isolated-source`), 0 failure/error/skip: Identity 60, Catalog 26, Community 30, Trip 40, Ingestion 38, Intelligence 35 test.
- Local 20/10/2026 (dirty, phạm vi P03): Identity 61, Catalog 28, Community 30, Trip 41, Ingestion 38, Gateway 18 test với dependency thật.
- CI 21/10/2026 trên cây file của `main` `c1e8e29`: run 39540804296 PASS cho Identity, Catalog, Community, Trip, Ingestion (DB/provider/broker/image), contracts, platform. Intelligence không chạy trong CI vì AI DEFERRED.
- Các task có run CI trên là ứng viên `CI_VERIFIED`; cần owner xác nhận ánh xạ test → task trước khi nâng.

Mã task: ID = Identity, CA = Catalog, CO = Community, TR = Trip, IG = Ingestion, IN = Intelligence.

### 5.1. M1 — Database và runtime

- [x] M1 chung: baseline Flyway/Mongo, compose P01, image 6/6, CI matrix, runbook; sửa checksum CRLF/LF Community — **LOCAL_VERIFIED** · PR #5.
- [x] P01-ID-01: Migration V1–V7, role, seed tài khoản test — **LOCAL_VERIFIED**.
- [x] P01-ID-02: JWT RS256/JWKS, xoay khóa, chặn secret, health, image — **LOCAL_VERIFIED** · `IssuerKeysTests`, `JwksIntegrationTests`.
- [x] P01-CA-01: PostGIS, 24 bảng domain + 4 kỹ thuật, seed taxonomy/địa lý, index GiST/GIN — **LOCAL_VERIFIED** · V2, V4.
- [x] P01-CA-02: Security, config, health, image — **LOCAL_VERIFIED** · `SecurityConfigurationTests`, `JwksIntegrationTests`.
- [x] P01-CO-01: Migration Mongo V1–V3 (16 collection), unique index, validator — **LOCAL_VERIFIED** · `MongoStorageConfigurationTests`.
- [x] P01-CO-02: App, security, health, image, consumer harness — **LOCAL_VERIFIED**.
- [x] P01-TR-01: Migration V1–V7, FK cùng trip, unique deferrable — **LOCAL_VERIFIED**.
- [x] P01-TR-02: Service, security, health, image, stub — **LOCAL_VERIFIED** · `RuntimeGuardTests`, `LiveSessionValidatorTests`.
- [x] P01-IG-01: Migration V1–V8, unique hash/link/command, một job active mỗi nguồn — **LOCAL_VERIFIED**.
- [x] P01-IG-02: Workers, security, secret dạng `env:NAME` — **LOCAL_VERIFIED** · `credentialBearingSourceUriCannotPersistSecrets`.
- [x] P01-IN-01: Migration V1–V10, bảng Basic + ML + embedding — **LOCAL_VERIFIED**.
- [x] P01-IN-02: Workers, security, lưu artifact model trên volume — **LOCAL_VERIFIED** · `RuntimeGuardTests`.

### 5.2. M2 — Nghiệp vụ

- [x] P01-ID-03: Đăng ký/xác minh/login/logout/refresh/đặt lại/đổi mật khẩu, rate limit — **LOCAL_VERIFIED** (dirty) · `python backend/services/identity-service/test-local.py --transport --isolated-source`: 64/0/0/0 (run/failed/errors/skipped), riêng AuthDatabaseTests 38; Java 21.0.11, PostgreSQL/RabbitMQ Docker thật, SMTP mock trong DB suite. Chạy tại `857faf6` dirty; source lưu ở `2f21c75`. Browser SMTP thật qua Mailpit: mục 9/O. Gmail thật còn chờ cấu hình tài khoản gửi (F-34).
- [ ] P02-ID-AUTH-01: Hoàn thiện đăng ký/xác minh/gửi lại mã/đăng nhập — **PARTIAL** · Người làm: Codex · Nhánh: `fix/identity-registration-verification`, source `2f21c75` · Đã sửa và kiểm local: mã hết hạn/thay thế, cooldown/rate limit, lỗi login pending, chuyển bước FE; 64 test BE, 22 Gateway, browser 13+8+1, 0 failure/error; checkout dirty. Người dùng chọn Gmail thật ngày 03/11/2026; thiếu tài khoản gửi/App Password để chạy `configure_mail.py --apply` và xác nhận email thực nhận (F-34). Next: người dùng cấu hình SMTP cục bộ; Codex kiểm lại xác thực/kết quả sau cấu hình.
- [x] P01-ID-04: Hồ sơ, preferences, consent, admin user/status/role, API batch nội bộ — **LOCAL_VERIFIED** · `PreferencePatchTests`, `CategoryClientTests`.
- [x] P01-ID-05: Hộp thư thông báo, gửi email có retry; yêu cầu xóa và thu ack — **LOCAL_VERIFIED** · `deletionRevokesAndTombstonesAtomicallyButRequiresAllSixAcknowledgements`.
- [x] P01-CA-03: Phân cấp địa lý (chống vòng), taxonomy, vòng đời địa điểm + lịch sử — **LOCAL_VERIFIED** · `hierarchyCycleEffectiveOverlapAndEventPublishScheduleAreRejected`.
- [x] P01-CA-04: Tìm tiếng Việt/alias, lọc, cursor ổn định, khoảng cách mét, lọc rating — **LOCAL_VERIFIED** · `cursorRejectsTamperingAndChangedFiltersAndPagesWithoutDuplicates`. Bổ sung 03/11/2026: migration V9 đưa tên + địa chỉ vào chỉ mục bỏ dấu, đồng bộ khi tạo/sửa; runtime POST/PATCH cho phép `address` theo OpenAPI. `CatalogDatabaseTests` 20/0/0/0 gồm `placeAddressSearchNormalizesAccentsAndTracksAddressUpdates`; Java 21, PostGIS Docker thật, HEAD `ca83db7`, dirty. Browser map qua Gateway 8/0/0/0 xác nhận lưu/đọc lại và tìm địa chỉ không dấu. Toàn suite không PASS: F-33. Hiệu năng alias: F-04.
- [x] P01-CA-05: Giờ mở cửa nhiều ca/qua đêm/ngày lễ; giá NULL/0; media cách ly; bằng chứng claim riêng tư — **LOCAL_VERIFIED** · `openingOvernight24HoursHolidayAndRejectedLongShiftRollback`.
- [x] P01-CA-06: Offering SERVICE/TOUR/EVENT/ACTIVITY/EXPERIENCE; tiện ích — **LOCAL_VERIFIED**. Seed thiếu `homestay`: F-03.
- [x] P01-CA-07: Doanh nghiệp, thành viên, xác minh, claim, yêu cầu sửa, field được bảo vệ — **LOCAL_VERIFIED** · `businessRequiresVerifiedMembershipAndConflictPreservesPlace`.
- [x] P01-CO-03: Review CRUD, media, report, kiểm duyệt; sửa review đã duyệt về `PENDING` — **LOCAL_VERIFIED** · `approvedEditHideRestoreDeleteReconcilesSummaryAndCrossUserFails`.
- [x] P01-CO-04: Review + rating + outbox cùng transaction; favorite idempotent — **LOCAL_VERIFIED** · `concurrentApprovedReviewsReconcileWithoutLostCount`.
- [x] P01-CO-05: Collection public/private, item, ghi chú, sắp xếp — **LOCAL_VERIFIED** · `concurrentCollectionReorderHasOneWinner`.
- [x] P01-CO-06: Đóng góp: thêm/sửa/rút/duyệt → `APPLYING` → `APPLIED`/`APPLY_FAILED` — **LOCAL_VERIFIED** · `contributionMissingAckStaysApplyingAndRejectedAckIsIdempotent`.
- [x] P01-TR-03: Trip/chặng/ngày CRUD, chủ sở hữu, ngày/múi giờ, khóa version, xóa mềm — **LOCAL_VERIFIED** · `ownerPreconditionCrossTripAndDateBoundariesAreEnforced`.
- [x] P01-TR-04: Thêm địa điểm qua Catalog, snapshot, sắp xếp, chi phí/ngân sách — **LOCAL_VERIFIED** · `concurrentReorderHasOneWinnerAndRetainsAllItems`.
- [x] P01-TR-05: Di chuyển, cache tuyến, fallback có nhãn, làm mới snapshot — **LOCAL_VERIFIED** · `routingFailureHasStraightLineLabelAndNoInventedDuration`.
- [x] P01-TR-06: Ghi nguồn gốc recommendation; địa điểm ẩn chỉ đánh dấu không khả dụng — **LOCAL_VERIFIED** · `recommendationAttributionIsPersistedAndEmittedOnce`.
- [x] P01-IG-03: Đăng ký nguồn, license, policy, job; không lưu raw khi `allow_storage=false` — **LOCAL_VERIFIED** · `policiesSourceLocksQuotaAndCancellationPreventUnsafeProcessing`.
- [x] P01-IG-04: Fetch, cursor, hash, chuẩn hóa, cách ly dòng lỗi — **LOCAL_VERIFIED** · `invalidRowsRemainQuarantinedAndPartialDoesNotAdvanceCheckpoint`.
- [x] P01-IG-05: Ghép theo source link trước, ứng viên, `NEEDS_REVIEW` — **LOCAL_VERIFIED** · `conflictsRequireReviewAndNeverUpdateLinkBeforeApplied`.
- [x] P01-IG-06: Command UUID cố định, version, retry; checkpoint chỉ tiến khi đủ ack — **LOCAL_VERIFIED** · `duplicateInputStableRetryAndDelayedAckNeverAdvanceCheckpoint`.
- [x] P01-IN-03: Ghi tương tác client/server, chống trùng, rate, retention, consent — **LOCAL_VERIFIED** · `clientDedupConsentRevokeTombstoneAndServerAttribution`. P03: DEFERRED.
- [x] P01-IN-04: Đặc trưng có version, dựng lại từ snapshot, lọc cứng, cold-start — **LOCAL_VERIFIED** · `SnapshotRebuildTests`. P03: DEFERRED.
- [x] P01-IN-05: Dataset có version/checksum/license/consent — **LOCAL_VERIFIED**. P03: DEFERRED.
- [x] P01-IN-06: Training, artifact, validate, kích hoạt/rollback model, deadline + fallback — **LOCAL_VERIFIED** · `immutableDatasetTrainingReproducibilityValidationActivationRollback`. P03: DEFERRED.
- [x] P01-IN-07: Thu hồi nguồn/xóa dữ liệu ảnh hưởng model; quality gate không tự bật production — **LOCAL_VERIFIED**. P03: DEFERRED.

### 5.3. M3 — Adapter và event

- [x] P01-ID-06: Category client, outbox 4 event, consumer thông báo/ack xóa/cập nhật category — **LOCAL_VERIFIED** · `BrokerDatabaseTests` (6). Thiếu 3 consumer theo registry: F-01.
- [x] P01-ID-07: Contract provider JWKS/claims/batch/event; cấu hình stub không lọt production — **LOCAL_VERIFIED** · `all25FrozenOperationsHaveRealHttpProviderResponses`.
- [x] P01-CA-08: Consumer rating có version; handler import/đóng góp idempotent; ghi + lịch sử + inbox/outbox cùng transaction — **LOCAL_VERIFIED** · `dependencyFailureRollsBackCommandInboxAndResult`.
- [ ] P01-CA-09: Phát event địa điểm/visibility/destination/category/claim; snapshot API — **PARTIAL** · Bằng chứng cũ: `BrokerDatabaseTests` (5). Kiểm lại 03/11/2026: `CatalogProviderTests.allSixtySixFrozenOperationsReturnValidatedProviderResponses` FAIL do payload `catalog.place.upserted.v1` thiếu 7 trường bắt buộc trong schema đang sửa trên checkout dirty (F-33); không coi bằng chứng cũ là đủ cho revision hiện tại. Người xử lý: N1.
- [x] P01-CO-07: Client Catalog validate/batch; đóng quyền ghi khi không xác minh được địa điểm — **LOCAL_VERIFIED** · `CatalogClientTests`.
- [x] P01-CO-08: Phát review/favorite/rating/contribution; nhận kết quả apply/visibility/xóa — **LOCAL_VERIFIED** · `BrokerDatabaseTests` (5).
- [x] P01-TR-07: Adapter Catalog/routing; phát `trip.changed`, `trip.item.added`; nhận visibility/xóa — **LOCAL_VERIFIED** · `BrokerDatabaseTests` (12).
- [x] P01-TR-08: Snapshot version, outbox/inbox/retry, cache-control riêng tư, thêm item idempotent — **LOCAL_VERIFIED** · `crashAfterPublishBeforeCommitRedeliversSameEventId`.
- [x] P01-IG-07: Phát upsert-requested/source-policy; xử lý kết quả Catalog qua inbox — **LOCAL_VERIFIED** · `BrokerDatabaseTests` (12).
- [x] P01-IG-08: Client ứng viên, harness broker trùng/trễ/crash, API policy cho provider — **LOCAL_VERIFIED** · `allFrozenAdminAndInternalProviderOperationsUseRealRows`.
- [x] P01-IN-08: Client/handler/outbox/inbox; phát `model.deployed`; ack xóa — **LOCAL_VERIFIED** · `BrokerDatabaseTests` (4).
- [x] P01-IN-09: Contract recommendation; đổi schema; thu hồi — **LOCAL_VERIFIED** · `versionsIndependentInboxAndUnsupportedSchema`.

### 5.4. M4 — Kiểm thử lỗi, tranh chấp và bàn giao

- [x] P01-ID-08: Email trùng; token đã dùng/hết hạn/dùng lại; refresh đồng thời; JWT hết hạn/sai audience — **LOCAL_VERIFIED**.
- [x] P01-ID-09: USER không lên ADMIN; category timeout; thông báo trùng; thiếu ack không hoàn tất; consent mặc định false — **LOCAL_VERIFIED** · `timeoutNeverApprovesUnverifiedSelection`.
- [x] P01-CA-10: Địa lý/tìm kiếm/phân trang/giá/qua đêm/24h/ngày lễ/vòng/claim sai — **LOCAL_VERIFIED**.
- [x] P01-CA-11: Hai update cùng version chỉ một commit; import trùng; field bảo vệ; rating không lùi — **LOCAL_VERIFIED** · `concurrentVersionAllowsOneCommit`.
- [x] P01-CO-09: Duyệt/sửa/ẩn/xóa/khôi phục làm rating đúng, không đếm đôi — **LOCAL_VERIFIED**.
- [x] P01-CO-10: Chặn truy cập chéo user, collection riêng tư, UGC chưa duyệt — **LOCAL_VERIFIED** · `deletionFencePreventsNewCollectionAndReviewAfterDeletionAcknowledges`.
- [x] P01-TR-09: Không gắn item của trip khác; ngày ngoài khoảng; sắp xếp đồng thời 409 — **LOCAL_VERIFIED**.
- [x] P01-TR-10: Catalog sập vẫn đọc snapshot; timeout không bịa thời gian — **LOCAL_VERIFIED** · `catalogCurrencyRejectionRollsBackAndRoutingTimeoutFallsBackWithinBound`.
- [x] P01-IG-09: Chạy lại giữ số liệu/UUID; thiếu ack không `SUCCEEDED` — **LOCAL_VERIFIED** · `paginationReplayAndDeletionAnonymizationKeepProvenance`.
- [x] P01-IG-10: `PARTIAL`, retry, thu hồi license, xung đột field bảo vệ — **LOCAL_VERIFIED**.
- [x] P01-IN-10: Golden test chấm điểm/lọc/cold-start/consent/visibility — **LOCAL_VERIFIED**. P03: DEFERRED.
- [x] P01-IN-11: Không đếm đôi, dataset bị cấm, checksum, kích hoạt đồng thời, tái lập — **LOCAL_VERIFIED**. P03: DEFERRED.
- [ ] P01-ID-10 / CA-12 / CO-11 / TR-11 / IG-11 / IN-12: Bàn giao image, migration, API, event, báo cáo test, runbook của 6 service — **PARTIAL** · Đã có README + runbook từng service, image, số test · Thiếu: chữ ký reviewer (N2 cho ID/CA/IG, N1 cho CO/TR/IN). README Ingestion ghi "18 operations" nhưng contract có 17.

### 5.5. Gateway

- [x] Gateway route, security, đổi token — **LOCAL_VERIFIED** · 18 test (20/10); CI PASS trong run 39540804296.
- [ ] Review platform — **NOT_STARTED**.
- Frontend P01 (API client, refresh xoay vòng): xem `progress_fe.md`.
- [ ] **Gate P01** (6/6 `READY_FOR_INTEGRATION` có chữ ký) — **PARTIAL** · Thiếu: sửa lệch schema/producer event Catalog (F-33) và chữ ký N1/N2 cho 6 gói.

---

## 6. P02 — Kết nối các service

P02 Bộ sưu tập: FE chọn tỉnh/thành từ `GET /geographic-units`, tìm `GET /places?geographicUnitId=…` và đếm đủ phân trang; chưa chạy lại Gateway/DB thật cho thay đổi này nên giữ nguyên ký hiệu kết nối và gate. Chi tiết kiểm tra frontend tại [progress_fe.md](progress_fe.md#6-p02--gọi-gateway-thật).

Yêu cầu: `plan/phases/P02-service-integration.md` · Trạng thái phase: **`PARTIAL`** 12/15 task; P02-09 kiểm lại local ngày 30/10/2026.

**Bằng chứng chung:** local connected 11/10/2026 (checkout dirty) bằng `p02.py smoke`, `p02_faults.py`, `p02_transport_test.py`, `p02_import_ack_test.py`, `p02_privacy_test.py`. CI `connected` PASS run 39540804333 (21/10/2026, 8m35s): 11 nhóm E2E không AI, 8 nhóm resilience, import ack/retry, frontend qua Gateway thật, 8 case browser, monitor `alarms=[]`. Task có phần AI chỉ có bằng chứng local.

- [x] P02-00: Đối chiếu revision/checksum/migration/test 6 gói — **LOCAL_VERIFIED** · `p02.py manifest`.
- [ ] P02-01: Môi trường tích hợp (DB, broker ACL/DLQ, object storage, secrets, tracing) — **PARTIAL** · Đã có: 6 DB, RabbitMQ ACL/DLQ, secrets bị ignore, monitor/dashboard · Thiếu: object storage (đang dùng Docker volume), distributed tracing (F-06).
- [x] P02-02: Token Identity đi qua 6 service; phiên bị thu hồi bị chặn — **LOCAL_VERIFIED** · `realSignedTokenExchangesAcrossSixServicesAndRevocationFailsClosed` · CI PASS.
- [x] P02-03: Catalog cung cấp dữ liệu cho Identity/Community/Trip/Intelligence — **LOCAL_VERIFIED** · CI PASS (phần không AI).
- [x] P02-04: Community ↔ Catalog: rating, visibility, đóng góp — **LOCAL_VERIFIED** · CI PASS.
- [x] P02-05: Ingestion ↔ Catalog: import 2 lần không trùng, mất ack retry an toàn — **LOCAL_VERIFIED** · CI PASS.
- [x] P02-06: Đầu vào Intelligence snapshot + delta, thu hồi — **LOCAL_VERIFIED** · Chỉ local; AI DEFERRED.
- [x] P02-07: Recommendation → Trip → lịch sử đúng một lần — **LOCAL_VERIFIED** · Chỉ local; AI DEFERRED.
- [ ] P02-08: Thông báo và xóa dữ liệu — **PARTIAL** · Đã có: thông báo từ event, email Mailpit, đủ 6 ack, thiếu ack Trip thì vẫn chờ · Thiếu: thông báo kết quả đóng góp và `model.deployed` (F-01).
- [x] P02-09: Frontend gọi Gateway thật; lỗi/pending rõ, provider sandbox ghi rõ — **LOCAL_VERIFIED** (dirty) · `test:browser` 9 nhóm + 36 responsive, 0 page error/AI request; account 8, business 12, admin 23, media 7, trip/collection 12 nhóm PASS; `test:gateway` PASS; source `66e6586`/`4e020e1`, scripts `edb10cb`. Môi trường/bằng chứng chi tiết mục 9; hai nhánh ảnh F-14 chưa xác nhận, không dùng để đóng gate.
- [x] P02-10: Route Gateway, chặn internal/actuator, đổi token theo service đích — **LOCAL_VERIFIED** · `GatewayRoutingTests`, `PrincipalExchangeFilterTests`.
- [x] P02-11: Snapshot + watermark + delta + chống trùng — **LOCAL_VERIFIED** · `SnapshotRebuildTests` · Chỉ local; AI DEFERRED.
- [x] P02-12: Outbox/inbox/retry/DLQ/replay, crash sau commit — **LOCAL_VERIFIED** · CI resilience PASS.
- [x] P02-13: Không trỏ stub/issuer test/fixture — **LOCAL_VERIFIED**.
- [ ] P02-14: Tương thích schema cũ/mới — **NOT_STARTED** · Chưa có revision contract thứ hai (F-07) · Next: làm cùng contract `1.1.0`.
- [ ] **Gate P02** (6/6 `CONNECTED`) — **PARTIAL** · Thiếu: P02-01, P02-08, P02-14; CI revision mới và chữ ký. F-14 còn hai nhánh media cần scanner.

---

### 6.1. Dữ liệu mẫu kiểm thử thủ công — cập nhật 03/11/2026

- Seed P02 + readback — **LOCAL_VERIFIED** (checkout dirty), Codex, nhánh `feature/explore-ui-demo-content`, HEAD `ca83db7`. `python backend/infra/seed_demo.py` PASS; chạy lặp sau đó `new records this run: 0`, `seed-owned updates this run: 0`. `python backend/infra/seed_demo.py --verify-only` PASS, đọc qua Gateway và đối chiếu ID trong PostgreSQL/MongoDB; rating projection khớp. Dữ liệu: 8 user; 29 public place + 1 draft; 18 destination (6 vùng cấp tỉnh + 12 khu vực du lịch con), 8 offering; 4 collection/11 item, 7 favorite; 5 trip/14 day/5 destination segment/21 itinerary item/8 transfer; 29 review (22 APPROVED, 6 PENDING, 1 REJECTED; rating 1–5), 3 report, 3 contribution; 2 business/2 member/2 verification/2 claim/1 change request; 33 notification; 1 media PENDING; 1 source/1 job/4 item (APPLIED×2, FAILED, NEEDS_REVIEW), job giữ RUNNING.
- Bộ lọc địa lý tỉnh → khu vực du lịch — **LOCAL_VERIFIED** (checkout dirty), Codex, nhánh feature/explore-ui-demo-content, HEAD ca83db7. python backend/infra/seed_demo.py --catalog-only PASS: tạo 12 đơn vị địa lý con + 12 khu vực và cập nhật phạm vi 29 địa điểm qua Catalog API; python -m unittest test_seed_demo -v: 18 run/0 failed/0 errors/0 skipped; npm --prefix frontend run test:browser:filters: 29/0/0/0, trong đó ca Gateway thật xác nhận Hội An trả tập con của tỉnh Đà Nẵng; npm --prefix frontend run build PASS (4630 modules). Nhóm địa lý là phạm vi minh họa du lịch, không đồng bộ ranh giới pháp lý. Không đổi contract Java; chưa chạy CI/review.
- Dọn dữ liệu public cũ — `python backend/infra/seed_demo.py --hide-legacy-tests` PASS: 2 địa điểm legacy mới chuyển PUBLISHED → HIDDEN qua Catalog API; tổng 50 ID legacy ở trạng thái HIDDEN được đối chiếu trong PostgreSQL. Giữ nguyên bản ghi, ID và quan hệ; API public còn 29 địa điểm seed có tên. Có thể chạy lại sau suite tự động tạo place test; không xóa DB/manifest.
- Test logic và UI — `python -m py_compile backend/infra/seed_demo.py backend/infra/test_seed_demo.py` PASS; `python -m unittest discover -s backend/infra -p test_seed_demo.py -v`: 16 run / 0 failed / 0 errors / 0 skipped. `node frontend/scripts/browser-demo-data.mjs`: 21 kiểm tra PASS / 0 page error, Node 24.21.0 + Chromium 156.0.8078.4, Vite FE → Gateway P02 → DB thật; guest không gọi Trip, danh sách/phân trang/chi tiết/review, quyền collection, itinerary, notification, business/editor, các queue admin và account mới. Ca HTTP 503 chỉ mô phỏng cho kiểm UI. Maven Catalog/Community `package -DskipTests` và image local PASS trước lượt kiểm. Contract validator chạy nhưng fail ở SHA manifest sau thay đổi artifact; chưa refresh vì validator yêu cầu artifact change được review. Java unit tests, CI và N1 review chưa chạy trên revision cuối.
- Seed dùng API Gateway cho nghiệp vụ/validation/status; không reset password/role/tên và không tái tạo fixture người test đã xóa. author_name trên review là snapshot hiển thị local, cập nhật trực tiếp Mongo theo đúng ID review + chủ sở hữu vì Community chưa có API field; không đổi rating/status. Notification và business member cũng là fixture local theo đường DB hiện có, không dùng làm bằng chứng event/consumer hay API thêm member.
- Import provider là sandbox local, job vẫn RUNNING; API item trả APPLIED×2/FAILED/NEEDS_REVIEW, chưa có item duplicate riêng. Pipeline còn map nội bộ DUPLICATE/SKIPPED thành APPLIED nên màn quản trị không tách được duplicate; mở F-32. Ảnh media PENDING vì chưa có scanner thật (F-14); evidence PDF doanh nghiệp chỉ là tham chiếu, không có file thật để tải. Giá/giờ/review/business là nội dung minh họa, không phải dữ liệu đã xác minh; AI vẫn DEFERRED.
- Mật khẩu chỉ ở file ignored `backend/infra/.local/p02/demo-accounts.json`, record IDs trong `demo-records.json`; hướng dẫn tài khoản và ma trận thao tác tại [progress_fe.md mục 6.1](progress_fe.md#61-dữ-liệu-mẫu-để-test-thủ-công). Checkout bẩn, môi trường Python 3.14/Node 24/Chromium/Docker P02; chưa CI, không nâng gate hoặc ACCEPTED.

- Kiểm lại bàn giao PR [#23](https://github.com/24521914-ux/SmartTravel_VN/pull/23) — **LOCAL_VERIFIED** · Codex, `feature/travel-demo-routing-filters`, source `7b04167`; checkout dirty chỉ còn `.ai-memory/` untracked. Node 24.21.0/Chromium 156: routing 45/0/0/0; editorial 32/0/0/0; filters lượt đầu 20 PASS/2 FAIL (Gateway chưa chạy và header che nút quay lại), sau phục hồi stack và sửa CSS `7b04167` chạy lại 1 lần 22/0/0/0; demo browser 11 PASS/0 page error qua Gateway/DB thật. Contract FE 15/0/0/0; seed Python 3.14 8/0/0/0; checksum 3/0/0/0, validator 183 HTTP + 23 event/command PASS. Java 21 Maven catalog/community/trip unit/security PASS: 113 run/0 failed/0 errors/74 skipped (DB/broker không chạy local trong lượt này). Build TypeScript/Vite sau sửa PASS. Fixture API chỉ dùng cho nhánh UI được ghi trong suite. CI đang chạy; chưa nâng CI/gate hoặc ACCEPTED.

- Kiểm CI bàn giao — **CI_VERIFIED** trong phạm vi 11 check của PR #23, revision `2f2e702e3b57eaec29879ebd35682265573f0e33`: P00 `41336264353`, P01 `41336264348`, P02 `41336264376`, P03 tooling `41336264372` đều SUCCESS (11/11). CI Linux/Java 21/Node 24, DB/broker/container thật theo workflow; không suy rộng sang các gate hoặc toàn bộ task. P02 run trước `41334918573` FAIL tại smoke chờ NEEDS_REVIEW; `fc370e8` bổ sung candidate PUBLISHED độc lập và chẩn đoán, giữ assertion; local sau refresh stack/Gateway PASS (1 lượt), DB xác nhận NEEDS_REVIEW → CANCELLED. Gateway unit/security local Java 21 22/0/0/0. Đã merge PR #23 bằng `Truong102006`, merge `4223631bc955ca47475fe2bb630a7a48576a3681`; giữ nguyên trạng thái gate/chữ ký.

## 7. P03 — Kiểm thử hệ thống

Kiểm lại nhánh PR `feature/trip-timeline-planner`, commit `a055a20`, checkout tracked sạch: `python backend/services/trip-service/test-local.py --transport` 61/0/0/0, Java21.0.11, PostgreSQL16/RabbitMQ Docker thật, Catalog/routing stub; BUILD SUCCESS. Đây là baseline khác workspace tích hợp54 test bên dưới; không cộng số test hai lượt.

- [x] P03-TR-TIMELINE: Đồng bộ Trip Planner vào workspace hiện tại và sửa contract test — **LOCAL_VERIFIED** (dirty) · Codex; source `91f15aa` dirty, phần sửa fixture lưu tại `a055a20` trên nhánh `feature/trip-timeline-planner`. `python backend/services/trip-service/test-local.py --transport`: 54 run / 0 failed / 0 errors / 0 skipped, Java 21.0.11, Docker PostgreSQL 16/RabbitMQ thật, Catalog/routing stub. Lượt trước 54/0/1/0 do stub snapshot thiếu các trường của contract mở rộng; đã dùng `placeSnapshot` canonical fixture, giữ nguyên contract. `validate_contracts.py`: 184 HTTP/23 event + 1 extension PASS; chỉ thêm hash extension vào manifest của workspace. Gateway timeline 5 nhóm PASS; FE timeline 11 nhóm PASS. Không nâng gate; còn CI/review.
- [ ] P03-TR-PUBLISH: Push nhánh và tạo/merge PR — **BLOCKED** · F-41; GitHub TCP timeout trước xác thực. Chủ xử lý: người dùng/quản trị mạng cùng Codex; code và kiểm thử local vẫn làm được.

Yêu cầu: `plan/phases/P03-system-verification.md` và `plan/phases/P03-non-ai-execution.md` · Trạng thái phase: **`PARTIAL`**.

**Quyết định phạm vi (người dùng, 20/10/2026):** nghiệm thu P03 phần **không AI** trước. F05 recommendation, F08 lịch sử tương tác, ML dataset/training/model, quản trị model là `DEFERRED`.

**Bằng chứng chung:**
- Gate local `p03_gate.py --scope non-ai` 20/10/2026 trả `P03_NON_AI_VERIFIED`, release `p03-non-ai-20261020`, chạy trên checkout dirty trước commit `15e9004` (nên chưa đủ đóng gate).
- CI 21/10/2026 trên cây file `main` `c1e8e29`: P03 tooling PASS run 39540804332 (98 test), connected PASS run 39540804333.
- Chi tiết số đo và lệnh chạy lại: `docs/P03_NON_AI_ACCEPTANCE.md`, `docs/operations/p03-non-ai-runbook.md`.

- [x] P03-01: Contract producer/consumer/frontend, client cũ, PATCH status offering bổ sung — **LOCAL_VERIFIED** (dirty) · 183 HTTP operation, 23 event, frontend contract 7/7. Tương thích schema cũ/mới đầy đủ vẫn chờ F-07.
- [x] P03-02: E2E F01/02/03/04/06/07/09/10/11, doanh nghiệp, import — **LOCAL_VERIFIED** (dirty) · 11 nhóm PASS, có correlation ID · CI connected PASS.
- [x] P03-03: Broker/service sập, crash/retry, trùng/sai thứ tự, backpressure, snapshot, đối soát rating, DLQ replay — **LOCAL_VERIFIED** (dirty) · 8 nhóm PASS; CI xác nhận "Community Catalog read path recovers after restart".
- [x] P03-04: Phân quyền toàn endpoint, BOLA/IDOR, dùng lại refresh, thu hồi session/claim, upload, rate limit, che PII trong log — **LOCAL_VERIFIED** (dirty) · 532 request PASS.
- [x] P03-05: Tải — **LOCAL_VERIFIED** (dirty) · Dữ liệu: 10.000 địa điểm, 2.009 tài khoản, 20.001 review, 1.000 trip, 50 tài khoản đăng nhập riêng · 60 giây, 1.200/1.200 HTTP 200, 19,96 req/s, 0 lỗi · p95: đọc Catalog 242 ms, đọc Trip 99 ms, ghi 72 ms (ngưỡng 500/500/800 ms) · có EXPLAIN ANALYZE truy vấn nóng.
- [x] P03-06: Backup/restore 6 DB + object có dữ liệu, watermark, retention, xóa dữ liệu, thu hồi license — **LOCAL_VERIFIED** (dirty) · Restore storage + ứng dụng 183,92 s; checkpoint 265,5 s (mục tiêu RPO ≤ 24 giờ, RTO ≤ 4 giờ).
- [x] P03-07: Browser user/business/admin — **LOCAL_VERIFIED** (dirty) · `browser-nonai.mjs`: 9 nhóm, 36 responsive, 0 page error, 0 AI call; sáu suite nghiệp vụ/auth bổ sung PASS qua Gateway P02 thật (mục 9); source `4e020e1`, scripts `edb10cb`. Không suy thành gate P03; LCP/WCAG và scanner vẫn theo F-21/F-14.
- [x] P03-08: Ràng buộc source/JAR/image, review độc lập, dashboard, runbook, cảnh báo — **LOCAL_VERIFIED** (dirty) · review APPROVE, 0 critical/high · Cảnh báo chỉ tới dashboard local.
- [ ] P03-09: Dữ liệu thực có quyền dùng, đánh giá holdout — **DEFERRED** (người dùng, 20/10/2026).
- [ ] P03-10: So model với Basic — **DEFERRED** (người dùng, 20/10/2026).
- [x] P03-11: Danh mục provider — **LOCAL_VERIFIED** (dirty) · Mailpit sandbox, nguồn tổng hợp sandbox, OpenStreetMap (bật khi người dùng chọn), routing fallback đường chim bay. Chưa có provider production.
- [ ] **Gate P03** — **PARTIAL** · Đã có: gate local không AI · Thiếu: chạy lại `p03_gate.py --scope non-ai` trên commit sạch của `main`; chữ ký N1/N2; phần AI (`SYSTEM_VERIFIED` đầy đủ chưa cấp) · Next: chạy lại gate trên `main` sạch rồi xin chữ ký.

---

## 8. P04 — Phát hành

Yêu cầu: `plan/phases/P04-migration-release.md` · Trạng thái phase: **`NOT_STARTED`** (bị chặn bởi gate P03).

- [ ] P04-01: Chọn triển khai mới hay chuyển dữ liệu — **NOT_STARTED** · P00 đã chọn triển khai mới; xác nhận lại khi bắt đầu P04.
- [ ] P04-02: Chuyển dữ liệu monolith — **NOT_STARTED** · Dự kiến `N/A` vì không có monolith (cần người quyết định ký).
- [ ] P04-03: Diễn tập staging, go/no-go — **NOT_STARTED**.
- [ ] P04-04: Đóng băng/rút delta/chuyển writer và traffic — **NOT_STARTED**.
- [ ] P04-05: Rollback có write mới / forward-fix — **NOT_STARTED**.
- [ ] P04-06: Theo dõi ổn định, DLQ, dọn credential cũ — **NOT_STARTED**.
- [ ] P04-07: Bàn giao triển khai, chi phí, backup, quyền truy cập, backlog — **NOT_STARTED**.
- [ ] **Gate P04** — **NOT_STARTED**.

Cần chuẩn bị trước P04: target triển khai và domain; credential provider email/bản đồ thật; dữ liệu có quyền sử dụng; người vận hành và người nhận cảnh báo; dự toán chi phí được người dùng duyệt.

---

## 9. Kết nối BE ↔ FE

Bảng dưới đối chiếu 172 operation public/admin trong OpenAPI (không tính 12 `/internal`), 4 operation media và 2 operation timeline mở rộng: **178 API**. Nguồn quan sát: `integration-coverage.mjs` và suite timeline Gateway/browser, không suy coverage từ source. Extension media: [catalog-media.md](docs/contracts/catalog-media.md); timeline: [trip-planner.openapi.json](backend/contracts/extensions/trip-planner.openapi.json).

**Kiểm lại 30/10/2026:** 160 API không AI đã được gọi qua Gateway; 158 có phản hồi 2xx. Membership DELETE đã kiểm nhánh bảo vệ chủ sở hữu (422, bản ghi giữ nguyên). GET ảnh cách ly trả 404 đúng; review REJECT 202 đúng, nhưng APPROVE 503 vì chưa có scanner thật. Vì vậy hai API media vẫn 🟡, chưa xác nhận nhánh thành công đầy đủ. JWKS chỉ dành cho Gateway (➖); 14 API AI hoãn theo quyết định trước đó.

**Bằng chứng dùng chung cho các dòng API:** Windows, Java 21, Node 24, Chromium Playwright, Docker; Gateway và service thật với PostgreSQL/MongoDB/RabbitMQ thật; email Mailpit, nguồn tổng hợp P02, routing fallback, bản đồ OSM chỉ khi opt-in. Dữ liệu có persist/readback thật, **không phải dữ liệu du lịch production**. Các lỗi chủ động 401/404/422/503 là assertion nghiệp vụ, không phải test bị bỏ qua. Mọi suite dưới đây có 0 failure/error/skipped; các lượt lỗi trước khi sửa không được tính PASS.

| Mã bằng chứng | Lệnh / phạm vi kiểm | Kết quả gần nhất |
|---|---|---|
| A | `npm --prefix frontend run test:browser:account` | 8 nhóm, 39 request; profile/preferences/password/verify/reset/sessions/delete-request; 0 unexpected API/page error |
| B | `npm --prefix frontend run test:browser:business` | 12 nhóm, 120 request; membership/KYC/claim/change-request; price đọc lại 12345, tên admin được bảo vệ; 0 unexpected error |
| C | `npm --prefix frontend run test:browser:admin` | 23 nhóm, 238 request; 7 nhóm tài nguyên Catalog, user, ingestion, contribution → APPLIED qua broker; 0 API/page error |
| D | `npm --prefix frontend run test:browser:media` | 7 nhóm, 56 request; upload thật, PENDING/REJECTED, quarantine404, scanner503; 0 unexpected error; chưa có APPROVE/read200 với scanner thật |
| E | `npm --prefix frontend run test:browser:trip` | 12 nhóm, 410 response; 29 API Trip, collection/review/report, persist/state/privacy/lock/order/snapshot; 0 page error |
| F | `npm --prefix frontend run test:browser` | 9 nhóm + 36 responsive, loading/error/empty, notification503 giữ trạng thái, favorite PUT/DELETE, user/business/admin; 0 page error, 0 AI call; candidate hash trước/sau khớp |
| G | `npm --prefix frontend run test:gateway` | Client thật + 3 nhóm bổ sung: refresh rotation, revoke session401, business soft-delete SUSPENDED, ingestion retry/cancel → CANCELLED đọc lại |
| H | `npm --prefix frontend run test:browser:auth-failure` | Login thật + inject `/me`503: không báo thành công giả, giữ session, phục hồi và logout; 0 page error |
| I | `npm --prefix frontend run test:contracts` / `build` / `test:ui:editorial` | 15/0/0/0 client tests; production build PASS; editorial 32/0/0/0 (API giả lập, không tính coverage Gateway) |
| J | `python backend/services/catalog-service/test-local.py --transport` | 38/0/0/0; UUID PATCH, offering/geography/tag/amenity persist, media fail-closed, pagination101 |
| K | `python backend/services/community-service/test-local.py --transport` | 32/0/0/0; 7 endpoint pagination101, report queue có nội dung/ID đúng |
| L | `python backend/services/trip-service/test-local.py --transport` | 43/0/0/0; sửa CatalogAdapter dùng collection destinations + opaque cursor, bỏ URL detail không tồn tại |
| M | `backend/mvnw.cmd -B -f backend/platform/api-gateway/pom.xml verify` | 22/0/0/0; multipart media11MB, JSON vẫn1MB, không mở rộng route khác |
| N | `python backend/platform/validate_contracts.py`; tại `backend/platform`: `python -m unittest test_contract_checksums test_contract_policy` | 183 HTTP / 23 event PASS; checksum 3/0/0/0, policy 7/0/0/0; tổng 10/0/0/0; candidate chưa freeze. Gọi unittest bằng module từ root lỗi import, đã chạy đúng working directory; không tính lượt lỗi là PASS |
| O | `npm --prefix frontend run test:browser:auth-recovery` / `test:browser:account` / `test:browser:auth-failure` | 13/0/0/0 kiểm khôi phục (gửi lại thật sau 60 giây, mã cũ401, mã mới202, pending login403, sai mật khẩu401), 8 nhóm tài khoản/32 request Gateway (đổi/reset mật khẩu, hồ sơ, phiên, yêu cầu xóa), 1 tình huống lỗi hồ sơ503; 0 page error; viewport 375/768/1440 không tràn và đã xem ảnh. Gateway/PostgreSQL/Mailpit thật; tài khoản synthetic riêng, không ghi đè tài khoản người dùng. Source `2f21c75`, HEAD khi chạy `857faf6` dirty, Node 24/Chromium/Java 21/Docker; chưa CI |
| P | Identity `test-local.py --transport --isolated-source`; Gateway `mvnw.cmd ... verify`; `validate_contracts.py`; platform `test_contract_checksums test_contract_policy`; infra `test_configure_mail`; FE `build` / `test:contracts` | Lần cuối Identity 64/0/0/0 (PostgreSQL/RabbitMQ thật; lần trước 64/0/0/6 không tính broker PASS); Gateway 22/0/0/0; contract 184 HTTP/23 event và manifest PASS (candidate chưa duyệt/freeze); platform 12/0/0/0; cấu hình Gmail 6/0/0/0 (SMTP mock, không gửi thư thật); FE build 4637 modules, client 15/0/0/0. Source `2f21c75`, checkout dirty; Gmail xác thực/gửi thật chưa kiểm vì thiếu credential |

**Revision:** các lượt J/K/M và lượt đầu chạy trên `d04c13a` dirty; L và browser cuối trên `101912f` dirty. Source kiểm thử đã lưu không đổi ở backend `66e6586`, FE `4e020e1`, scripts `edb10cb`; tài liệu contract `40590cf`. Chưa có CI run cho revision mới; chỉ `LOCAL_VERIFIED`, không cấp gate. ScannerBoundary từng có 2 lượt fail503 lúc JDK khởi động lạnh; sửa handshake fixture (không tăng timeout production), sau đó full37 và full38 PASS; không dùng retry che lỗi.

**T — Timeline, 05/11/2026:** workspace `91f15aa` dirty, Node 24.21.0/Chromium, Gateway/Catalog/PostgreSQL thật. `test:browser:trip:timeline` 11 nhóm/0 failure/0 page error, gồm draft không hợp lệ ở một item trong khi item khác lưu, lỗi503 có điều khiển và xung đột phiên bản; `test:gateway:trip:timeline` 5 nhóm/0 failure, có cleanup synthetic fixture. Build FE PASS 4639 modules, `test:contracts` 15/0/0/0; platform checksum/policy 12/0/0/0. Bundle collection vẫn FAIL (F-42); chưa CI/gate.

| Service | ✅ Hoàn thiện | 🟡 Đã nối, chưa kiểm đủ | ❌ Lỗi | ⚪ Chưa thực hiện | ⏸️ Hoãn | ➖ Không áp dụng | Tổng |
|---|---|---|---|---|---|---|---|
| Identity | 19 | 3 | 0 | 0 | 0 | 1 | 23 |
| Catalog | 64 | 2 | 0 | 0 | 0 | 0 | 66 |
| Community | 30 | 0 | 0 | 0 | 0 | 0 | 30 |
| Trip | 28 | 0 | 0 | 0 | 0 | 3 | 31 |
| Ingestion | 14 | 0 | 0 | 0 | 0 | 0 | 14 |
| Intelligence | 0 | 0 | 0 | 0 | 14 | 0 | 14 |
| **Tổng** | **155** | **5** | **0** | **0** | **14** | **4** | **178** |

#### Identity

| API | Trạng thái kết nối | Màn hình FE / ghi chú |
|---|---|---|
| `POST /auth/register` | 🟡 Đã nối, chưa kiểm | Chính sách mới 05/11/2026: ACTIVE ngay, không gửi email; browser-registration PASS với API stub, chưa kiểm Gateway/DB thật (F-35) |
| `POST /auth/login` | 🟡 Đã nối, chưa kiểm | Đăng ký xong chuyển form login, giữ email, mật khẩu trống; browser-registration PASS với API stub, chưa kiểm Gateway/DB thật (F-35) |
| `POST /auth/refresh` | ✅ Hoàn thiện | Tài khoản / thông báo / quản trị user · Bằng chứng A/F/G/H |
| `POST /auth/logout` | ✅ Hoàn thiện | Tài khoản / thông báo / quản trị user · Bằng chứng A/F/G/H |
| `POST /auth/verify-email` | ✅ Hoàn thiện | `test:browser:auth-recovery`: 13/0/0/0; FE → Gateway → Identity/PostgreSQL/Mailpit thật, gồm gửi lại sau cooldown và mã cũ bị từ chối. Source `2f21c75`, chạy dirty; SMTP Gmail thật chờ F-34 |
| `POST /auth/resend-verification` | ✅ Hoàn thiện | `test:browser:auth-recovery`: 13/0/0/0; FE → Gateway → Identity/PostgreSQL/Mailpit thật, gồm gửi lại sau cooldown và mã cũ bị từ chối. Source `2f21c75`, chạy dirty; SMTP Gmail thật chờ F-34 |
| `POST /auth/forgot-password` | ✅ Hoàn thiện | Tài khoản / thông báo / quản trị user · Bằng chứng A/F/G/H |
| `POST /auth/reset-password` | ✅ Hoàn thiện | Tài khoản / thông báo / quản trị user · Bằng chứng A/F/G/H |
| `GET /me` | ✅ Hoàn thiện | Tài khoản / thông báo / quản trị user · Bằng chứng A/F/G/H |
| `PATCH /me` | ✅ Hoàn thiện | Tài khoản / thông báo / quản trị user · Bằng chứng A/F/G/H |
| `PUT /me/password` | ✅ Hoàn thiện | Tài khoản / thông báo / quản trị user · Bằng chứng A/F/G/H |
| `GET /me/preferences` | ✅ Hoàn thiện | Tài khoản / thông báo / quản trị user · Bằng chứng A/F/G/H |
| `PUT /me/preferences` | ✅ Hoàn thiện | Tài khoản / thông báo / quản trị user · Bằng chứng A/F/G/H |
| `GET /preference-options` | ✅ Hoàn thiện | Tài khoản / thông báo / quản trị user · Bằng chứng A/F/G/H |
| `GET /me/sessions` | ✅ Hoàn thiện | Tài khoản / thông báo / quản trị user · Bằng chứng A/F/G/H |
| `DELETE /me/sessions/{session_id}` | ✅ Hoàn thiện | Tài khoản / thông báo / quản trị user · Bằng chứng A/F/G/H |
| `GET /me/notifications` | ✅ Hoàn thiện | Tài khoản / thông báo / quản trị user · Bằng chứng A/F/G/H |
| `PATCH /me/notifications/{notification_id}/read` | ✅ Hoàn thiện | Tài khoản / thông báo / quản trị user · Bằng chứng A/F/G/H |
| `POST /me/deletion-requests` | ✅ Hoàn thiện | Tài khoản / thông báo / quản trị user · Bằng chứng A/F/G/H |
| `GET /admin/users` | ✅ Hoàn thiện | Tài khoản / thông báo / quản trị user · Bằng chứng A/F/G/H |
| `PATCH /admin/users/{user_id}/status` | 🟡 Đã nối, chưa kiểm | Mở khóa theo cùng cấu hình xác minh email; chưa kiểm Gateway/DB thật (F-35) |
| `PUT /admin/users/{user_id}/roles` | ✅ Hoàn thiện | Tài khoản / thông báo / quản trị user · Bằng chứng A/F/G/H |
| `GET /.well-known/jwks.json` | ➖ Không áp dụng | Gateway dùng nội bộ, FE không gọi |

#### Catalog

| API | Trạng thái kết nối | Màn hình FE / ghi chú |
|---|---|---|
| `GET /admin/places` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `POST /admin/places` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G; `test:browser:map` 8/0/0/0 qua Gateway/DB thật, tạo địa điểm kiểm tra có địa chỉ rồi archive khi kết thúc (03/11/2026) |
| `GET /admin/places/{place_id}` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `PATCH /admin/places/{place_id}` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G; `test:browser:map` 8/0/0/0: chọn địa chỉ gợi ý, chỉnh ghim, lưu và đọc lại đúng address/latitude/longitude qua Gateway; geocoder fixture có kiểm soát (03/11/2026) |
| `DELETE /admin/places/{place_id}` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `GET /places` | ✅ Hoàn thiện | Khám phá · `browser-demo-data.mjs`: tìm/lọc, phân trang và public list qua Vite/Gateway P02; 29 địa điểm có tên, không còn legacy public (03/11/2026). `browser-filters.mjs` 29/0/0/0; ca Gateway thật gửi tỉnh + khu vực và xác nhận địa điểm trong khu vực là tập con kết quả tỉnh. Contract/CI + N1 review còn theo F-15 Bổ sung địa chỉ: `test:browser:map` 8/0/0/0 qua Gateway/PostGIS thật, tìm không dấu sau khi lưu và mở đúng ghim; tra Photon thật trên browser trả 5 gợi ý Cầu Rồng (03/11/2026). |
| `GET /places/{place_id}` | ✅ Hoàn thiện | Chi tiết điểm đến · `browser-demo-data.mjs`: trang Văn Miếu hiển thị mô tả/giá/điểm và dữ liệu thật qua Gateway P02 (03/11/2026). Contract/CI + N1 review còn theo F-15 |
| `PUT /admin/places/{place_id}/status` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `GET /admin/geographic-units` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `POST /admin/geographic-units` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `GET /admin/geographic-units/{id}` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `PATCH /admin/geographic-units/{id}` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `DELETE /admin/geographic-units/{id}` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `GET /geographic-units` | ✅ Hoàn thiện | Khám phá · seed Catalog có 6 tỉnh và 12 đơn vị con dùng làm khu vực du lịch minh họa; browser filters kiểm selector theo quan hệ cha–con qua Gateway (03/11/2026) |
| `GET /admin/destinations` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `POST /admin/destinations` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `GET /admin/destinations/{destination_id}` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `PATCH /admin/destinations/{destination_id}` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `DELETE /admin/destinations/{destination_id}` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `GET /destinations` | ✅ Hoàn thiện | Khám phá · 12 khu vực du lịch con có phạm vi gắn với 6 tỉnh; dropdown chỉ hiện khu vực thuộc tỉnh đang chọn; ca Gateway thật Đà Nẵng → Hội An hẹp hơn kết quả tỉnh (03/11/2026) |
| `GET /admin/categories` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `POST /admin/categories` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `GET /admin/categories/{id}` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `PATCH /admin/categories/{id}` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `DELETE /admin/categories/{id}` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `GET /categories` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `GET /admin/tags` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `POST /admin/tags` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `GET /admin/tags/{id}` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `PATCH /admin/tags/{id}` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `DELETE /admin/tags/{id}` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `GET /tags` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `GET /admin/amenities` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `POST /admin/amenities` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `GET /admin/amenities/{id}` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `PATCH /admin/amenities/{id}` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `DELETE /admin/amenities/{id}` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `GET /amenities` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `GET /admin/offerings` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `POST /admin/offerings` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `GET /admin/offerings/{offering_id}` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `PATCH /admin/offerings/{offering_id}` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `DELETE /admin/offerings/{offering_id}` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `GET /offerings` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `GET /places/{place_id}/offerings` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `GET /businesses` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `POST /businesses` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `GET /businesses/{business_id}` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `PATCH /businesses/{business_id}` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `DELETE /businesses/{business_id}` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `GET /businesses/{business_id}/members` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `POST /businesses/{business_id}/members` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `GET /businesses/{business_id}/members/{member_id}` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `PATCH /businesses/{business_id}/members/{member_id}` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `DELETE /businesses/{business_id}/members/{member_id}` | ✅ Hoàn thiện | Doanh nghiệp · B: chủ sở hữu tự xóa →422, membership vẫn còn; nhánh bảo vệ đúng |
| `POST /businesses/{business_id}/verification` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `POST /businesses/{business_id}/claims` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `POST /claims/{claim_id}/change-requests` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `POST /admin/claims/{id}/review` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `POST /admin/change-requests/{id}/review` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `POST /admin/business-verifications/{id}/review` | ✅ Hoàn thiện | Khám phá / Catalog admin / doanh nghiệp / kiểm duyệt · Bằng chứng B/C/E/G |
| `POST /admin/media/{id}/review` | 🟡 Đã nối, chưa kiểm đủ | Admin media · D: REJECT202; APPROVE503 đúng khi thiếu scanner, chưa xác nhận clean→APPROVED (F-14) |
| `POST /media` | ✅ Hoàn thiện | Review: upload ảnh thật201 PENDING, anonymous401 · D; extension |
| `POST /admin/media` | ✅ Hoàn thiện | Admin media: upload201, invalid PNG400 · D; extension |
| `GET /admin/media/{id}` | ✅ Hoàn thiện | Admin media: đọc metadata PENDING/REJECTED · D; extension |
| `GET /media/{id}` | 🟡 Đã nối, chưa kiểm đủ | Ảnh qua media_keys · D: quarantine404; chưa xác nhận approved200 với scanner thật (F-14), extension |

#### Community

| API | Trạng thái kết nối | Màn hình FE / ghi chú |
|---|---|---|
| `GET /places/{place_id}/reviews` | ✅ Hoàn thiện | Đánh giá điểm đến · `browser-demo-data.mjs`: chi tiết Văn Miếu hiển thị review đã duyệt, tác giả và rating projection qua Gateway P02 (03/11/2026). Contract/CI + N1 review còn theo F-15 |
| `POST /places/{place_id}/reviews` | ✅ Hoàn thiện | Đánh giá / yêu thích / bộ sưu tập / đóng góp / kiểm duyệt · Bằng chứng C/E/F |
| `PATCH /reviews/{review_id}` | ✅ Hoàn thiện | Đánh giá / yêu thích / bộ sưu tập / đóng góp / kiểm duyệt · Bằng chứng C/E/F |
| `DELETE /reviews/{review_id}` | ✅ Hoàn thiện | Đánh giá / yêu thích / bộ sưu tập / đóng góp / kiểm duyệt · Bằng chứng C/E/F |
| `POST /reviews/{review_id}/reports` | ✅ Hoàn thiện | Đánh giá / yêu thích / bộ sưu tập / đóng góp / kiểm duyệt · Bằng chứng C/E/F |
| `GET /me/favorites` | ✅ Hoàn thiện | Đánh giá / yêu thích / bộ sưu tập / đóng góp / kiểm duyệt · Bằng chứng C/E/F |
| `PUT /me/favorites/{place_id}` | ✅ Hoàn thiện | Đánh giá / yêu thích / bộ sưu tập / đóng góp / kiểm duyệt · Bằng chứng C/E/F |
| `DELETE /me/favorites/{place_id}` | ✅ Hoàn thiện | Đánh giá / yêu thích / bộ sưu tập / đóng góp / kiểm duyệt · Bằng chứng C/E/F |
| `GET /me/collections` | ✅ Hoàn thiện | Đánh giá / yêu thích / bộ sưu tập / đóng góp / kiểm duyệt · Bằng chứng C/E/F |
| `POST /me/collections` | ✅ Hoàn thiện | Đánh giá / yêu thích / bộ sưu tập / đóng góp / kiểm duyệt · Bằng chứng C/E/F |
| `GET /me/collections/{collection_id}` | ✅ Hoàn thiện | Đánh giá / yêu thích / bộ sưu tập / đóng góp / kiểm duyệt · Bằng chứng C/E/F |
| `PATCH /me/collections/{collection_id}` | ✅ Hoàn thiện | Đánh giá / yêu thích / bộ sưu tập / đóng góp / kiểm duyệt · Bằng chứng C/E/F |
| `DELETE /me/collections/{collection_id}` | ✅ Hoàn thiện | Đánh giá / yêu thích / bộ sưu tập / đóng góp / kiểm duyệt · Bằng chứng C/E/F |
| `GET /collections/{collection_id}` | ✅ Hoàn thiện | Đánh giá / yêu thích / bộ sưu tập / đóng góp / kiểm duyệt · Bằng chứng C/E/F |
| `GET /collections/{collection_id}/items` | ✅ Hoàn thiện | Đánh giá / yêu thích / bộ sưu tập / đóng góp / kiểm duyệt · Bằng chứng C/E/F |
| `POST /collections/{collection_id}/items` | ✅ Hoàn thiện | Đánh giá / yêu thích / bộ sưu tập / đóng góp / kiểm duyệt · Bằng chứng C/E/F |
| `GET /collections/{collection_id}/items/{item_id}` | ✅ Hoàn thiện | Đánh giá / yêu thích / bộ sưu tập / đóng góp / kiểm duyệt · Bằng chứng C/E/F |
| `PATCH /collections/{collection_id}/items/{item_id}` | ✅ Hoàn thiện | Đánh giá / yêu thích / bộ sưu tập / đóng góp / kiểm duyệt · Bằng chứng C/E/F |
| `DELETE /collections/{collection_id}/items/{item_id}` | ✅ Hoàn thiện | Đánh giá / yêu thích / bộ sưu tập / đóng góp / kiểm duyệt · Bằng chứng C/E/F |
| `PUT /collections/{collection_id}/items/order` | ✅ Hoàn thiện | Đánh giá / yêu thích / bộ sưu tập / đóng góp / kiểm duyệt · Bằng chứng C/E/F |
| `POST /contributions` | ✅ Hoàn thiện | Đánh giá / yêu thích / bộ sưu tập / đóng góp / kiểm duyệt · Bằng chứng C/E/F |
| `GET /me/contributions` | ✅ Hoàn thiện | Đánh giá / yêu thích / bộ sưu tập / đóng góp / kiểm duyệt · Bằng chứng C/E/F |
| `PATCH /contributions/{contribution_id}` | ✅ Hoàn thiện | Đánh giá / yêu thích / bộ sưu tập / đóng góp / kiểm duyệt · Bằng chứng C/E/F |
| `POST /contributions/{contribution_id}/withdraw` | ✅ Hoàn thiện | Đánh giá / yêu thích / bộ sưu tập / đóng góp / kiểm duyệt · Bằng chứng C/E/F |
| `GET /admin/reviews` | ✅ Hoàn thiện | Đánh giá / yêu thích / bộ sưu tập / đóng góp / kiểm duyệt · Bằng chứng C/E/F |
| `POST /admin/reviews/{id}/moderate` | ✅ Hoàn thiện | Đánh giá / yêu thích / bộ sưu tập / đóng góp / kiểm duyệt · Bằng chứng C/E/F |
| `GET /admin/contributions` | ✅ Hoàn thiện | Đánh giá / yêu thích / bộ sưu tập / đóng góp / kiểm duyệt · Bằng chứng C/E/F |
| `POST /admin/contributions/{id}/moderate` | ✅ Hoàn thiện | Đánh giá / yêu thích / bộ sưu tập / đóng góp / kiểm duyệt · Bằng chứng C/E/F |
| `GET /admin/reports` | ✅ Hoàn thiện | Đánh giá / yêu thích / bộ sưu tập / đóng góp / kiểm duyệt · Bằng chứng C/E/F |
| `POST /admin/reports/{id}/moderate` | ✅ Hoàn thiện | Đánh giá / yêu thích / bộ sưu tập / đóng góp / kiểm duyệt · Bằng chứng C/E/F |

#### Trip

| API | Trạng thái kết nối | Màn hình FE / ghi chú |
|---|---|---|
| `GET /me/trips` | ✅ Hoàn thiện | Chuyến đi: chi tiết, lịch trình, chặng và di chuyển · Bằng chứng E |
| `POST /me/trips` | ✅ Hoàn thiện | Chuyến đi: chi tiết, lịch trình, chặng và di chuyển · Bằng chứng E |
| `GET /trips/{trip_id}` | ✅ Hoàn thiện | Chuyến đi: chi tiết, lịch trình, chặng và di chuyển · Bằng chứng E |
| `PATCH /trips/{trip_id}` | ✅ Hoàn thiện | Chuyến đi: chi tiết, lịch trình, chặng và di chuyển · Bằng chứng E |
| `DELETE /trips/{trip_id}` | ✅ Hoàn thiện | Chuyến đi: chi tiết, lịch trình, chặng và di chuyển · Bằng chứng E |
| `PUT /trips/{trip_id}/state` | ✅ Hoàn thiện | Chuyến đi: chi tiết, lịch trình, chặng và di chuyển · Bằng chứng E |
| `GET /trips/{trip_id}/destinations` | ✅ Hoàn thiện | Chuyến đi: chi tiết, lịch trình, chặng và di chuyển · Bằng chứng E |
| `POST /trips/{trip_id}/destinations` | ✅ Hoàn thiện | Chuyến đi: chi tiết, lịch trình, chặng và di chuyển · Bằng chứng E |
| `GET /trips/{trip_id}/destinations/{segment_id}` | ✅ Hoàn thiện | Chuyến đi: chi tiết, lịch trình, chặng và di chuyển · Bằng chứng E |
| `PATCH /trips/{trip_id}/destinations/{segment_id}` | ✅ Hoàn thiện | Chuyến đi: chi tiết, lịch trình, chặng và di chuyển · Bằng chứng E |
| `DELETE /trips/{trip_id}/destinations/{segment_id}` | ✅ Hoàn thiện | Chuyến đi: chi tiết, lịch trình, chặng và di chuyển · Bằng chứng E |
| `GET /trips/{trip_id}/days` | ✅ Hoàn thiện | Chuyến đi: chi tiết, lịch trình, chặng và di chuyển · Bằng chứng E |
| `POST /trips/{trip_id}/days` | ✅ Hoàn thiện | Chuyến đi: chi tiết, lịch trình, chặng và di chuyển · Bằng chứng E |
| `GET /trips/{trip_id}/days/{day_id}` | ✅ Hoàn thiện | Chuyến đi: chi tiết, lịch trình, chặng và di chuyển · Bằng chứng E |
| `PATCH /trips/{trip_id}/days/{day_id}` | ✅ Hoàn thiện | Chuyến đi: chi tiết, lịch trình, chặng và di chuyển · Bằng chứng E |
| `DELETE /trips/{trip_id}/days/{day_id}` | ✅ Hoàn thiện | Chuyến đi: chi tiết, lịch trình, chặng và di chuyển · Bằng chứng E |
| `GET /trips/{trip_id}/days/{day_id}/items` | ✅ Hoàn thiện | Chuyến đi: chi tiết, lịch trình, chặng và di chuyển · Bằng chứng E |
| `POST /trips/{trip_id}/days/{day_id}/items` | ✅ Hoàn thiện | Chuyến đi: chi tiết, lịch trình, chặng và di chuyển · Bằng chứng E |
| `GET /trips/{trip_id}/days/{day_id}/items/{item_id}` | ➖ Không áp dụng | Timeline đọc danh sách item; API vẫn giữ tương thích |
| `PATCH /trips/{trip_id}/days/{day_id}/items/{item_id}` | ✅ Hoàn thiện | Chuyến đi: chi tiết, lịch trình, chặng và di chuyển · Bằng chứng E |
| `DELETE /trips/{trip_id}/days/{day_id}/items/{item_id}` | ✅ Hoàn thiện | Chuyến đi: chi tiết, lịch trình, chặng và di chuyển · Bằng chứng E |
| `PUT /trips/{trip_id}/days/{day_id}/items/order` | ✅ Hoàn thiện | Chuyến đi: chi tiết, lịch trình, chặng và di chuyển · Bằng chứng E |
| `GET /trips/{trip_id}/transfers` | ✅ Hoàn thiện | Chuyến đi: chi tiết, lịch trình, chặng và di chuyển · Bằng chứng E |
| `POST /trips/{trip_id}/transfers` | ✅ Hoàn thiện | Chuyến đi: chi tiết, lịch trình, chặng và di chuyển · Bằng chứng E |
| `GET /trips/{trip_id}/transfers/{transfer_id}` | ➖ Không áp dụng | Timeline dùng danh sách chặng; API vẫn giữ tương thích |
| `PATCH /trips/{trip_id}/transfers/{transfer_id}` | ✅ Hoàn thiện | Chuyến đi: chi tiết, lịch trình, chặng và di chuyển · Bằng chứng E |
| `DELETE /trips/{trip_id}/transfers/{transfer_id}` | ✅ Hoàn thiện | Chuyến đi: chi tiết, lịch trình, chặng và di chuyển · Bằng chứng E |
| `POST /trips/{trip_id}/route-estimates` | ➖ Không áp dụng | Timeline tính tuyến nền qua chặng tự động; API vẫn giữ tương thích |
| `POST /trips/{trip_id}/snapshots/refresh` | ✅ Hoàn thiện | Chuyến đi: chi tiết, lịch trình, chặng và di chuyển · Bằng chứng E |
| `GET /trips/{trip_id}/days/{day_id}/travel-legs` | ✅ Hoàn thiện | Timeline và bản đồ theo dõi chặng tự động · Bằng chứng T |
| `PATCH /trips/{trip_id}/days/{day_id}/travel-legs/{leg_id}` | ✅ Hoàn thiện | Đổi phương tiện và thử tính lại ngay trên timeline · Bằng chứng T |

#### Ingestion

| API | Trạng thái kết nối | Màn hình FE / ghi chú |
|---|---|---|
| `GET /admin/data-sources` | ✅ Hoàn thiện | Quản trị nguồn, policy, import và quyết định ứng viên · Bằng chứng B/C/G |
| `POST /admin/data-sources` | ✅ Hoàn thiện | Quản trị nguồn, policy, import và quyết định ứng viên · Bằng chứng B/C/G |
| `GET /admin/data-sources/{source_id}` | ✅ Hoàn thiện | Quản trị nguồn, policy, import và quyết định ứng viên · Bằng chứng B/C/G |
| `PATCH /admin/data-sources/{source_id}` | ✅ Hoàn thiện | Quản trị nguồn, policy, import và quyết định ứng viên · Bằng chứng B/C/G |
| `DELETE /admin/data-sources/{source_id}` | ✅ Hoàn thiện | Quản trị nguồn, policy, import và quyết định ứng viên · Bằng chứng B/C/G |
| `PATCH /admin/data-sources/{source_id}/policy` | ✅ Hoàn thiện | Quản trị nguồn, policy, import và quyết định ứng viên · Bằng chứng B/C/G |
| `POST /admin/data-sources/{source_id}/import-jobs` | ✅ Hoàn thiện | Quản trị nguồn, policy, import và quyết định ứng viên · Bằng chứng B/C/G |
| `GET /admin/import-jobs/{job_id}` | ✅ Hoàn thiện | Quản trị nguồn, policy, import và quyết định ứng viên · Bằng chứng B/C/G |
| `GET /admin/import-jobs/{job_id}/items` | ✅ Hoàn thiện | Quản trị nguồn, policy, import và quyết định ứng viên · Bằng chứng B/C/G |
| `GET /admin/import-jobs/{job_id}/errors` | ✅ Hoàn thiện | Quản trị nguồn, policy, import và quyết định ứng viên · Bằng chứng B/C/G |
| `GET /admin/import-jobs/{job_id}/candidates` | ✅ Hoàn thiện | Quản trị nguồn, policy, import và quyết định ứng viên · Bằng chứng B/C/G |
| `POST /admin/import-jobs/{job_id}/retry` | ✅ Hoàn thiện | Quản trị nguồn, policy, import và quyết định ứng viên · Bằng chứng B/C/G |
| `POST /admin/import-jobs/{job_id}/cancel` | ✅ Hoàn thiện | Quản trị nguồn, policy, import và quyết định ứng viên · Bằng chứng B/C/G |
| `POST /admin/import-items/{item_id}/decision` | ✅ Hoàn thiện | Quản trị nguồn, policy, import và quyết định ứng viên · Bằng chứng B/C/G |

#### Intelligence

| API | Trạng thái kết nối | Màn hình FE / ghi chú |
|---|---|---|
| `POST /recommendations` | ⏸️ Hoãn (AI) | Ẩn khi `VITE_AI_ENABLED=false` |
| `POST /interactions/batch` | ⏸️ Hoãn (AI) | Ẩn khi `VITE_AI_ENABLED=false` |
| `GET /me/interactions` | ⏸️ Hoãn (AI) | Ẩn khi `VITE_AI_ENABLED=false` |
| `DELETE /me/interactions` | ⏸️ Hoãn (AI) | Ẩn khi `VITE_AI_ENABLED=false` |
| `POST /admin/datasets` | ⏸️ Hoãn (AI) | Ẩn khi `VITE_AI_ENABLED=false` |
| `GET /admin/datasets/{dataset_id}` | ⏸️ Hoãn (AI) | Ẩn khi `VITE_AI_ENABLED=false` |
| `POST /admin/training-jobs` | ⏸️ Hoãn (AI) | Ẩn khi `VITE_AI_ENABLED=false` |
| `GET /admin/training-jobs/{job_id}` | ⏸️ Hoãn (AI) | Ẩn khi `VITE_AI_ENABLED=false` |
| `POST /admin/training-jobs/{job_id}/cancel` | ⏸️ Hoãn (AI) | Ẩn khi `VITE_AI_ENABLED=false` |
| `GET /admin/models` | ⏸️ Hoãn (AI) | Ẩn khi `VITE_AI_ENABLED=false` |
| `GET /admin/models/{model_id}/metrics` | ⏸️ Hoãn (AI) | Ẩn khi `VITE_AI_ENABLED=false` |
| `POST /admin/models/{model_id}/validate` | ⏸️ Hoãn (AI) | Ẩn khi `VITE_AI_ENABLED=false` |
| `POST /admin/models/{model_id}/deploy` | ⏸️ Hoãn (AI) | Ẩn khi `VITE_AI_ENABLED=false` |
| `POST /admin/models/{model_id}/rollback` | ⏸️ Hoãn (AI) | Ẩn khi `VITE_AI_ENABLED=false` |



## 10. Vấn đề đang mở

F-41 — Trung bình, P03, **OPEN** · Push/PR bị chặn bởi kết nối TCP tới GitHub/API GitHub; HTTPS Google và raw.githubusercontent.com vẫn 200. DNS hệ thống và DoH trùng nhau; HTTPS GitHub qua nhiều địa chỉ chính thức và SSH22 đều timeout. Có route Radmin VPN trạng thái Dead; thử ép socket qua Wi-Fi vẫn timeout nên chưa kết luận VPN là nguyên nhân. Thử thêm route tạm bị Windows từ chối quyền Administrator; không thay đổi route/firewall/DNS. Người xử lý: người dùng/quản trị mạng + Codex; cần kiểm tra trên mạng khác hoặc phiên quản trị.

F-42 — Trung bình, P02, **OPEN** · Suite collection trong workspace hiện tại: lượt đầu FAIL selector tiêu đề Tài khoản, đã cập nhật sang `.account-panel-container`; lượt sau FAIL `POST /collections/{id}/items` 503. Log Community: workload token request tới Catalog thất bại; health container vẫn healthy. Timeline browser/Gateway riêng PASS; không coi bundle Trip/collection PASS. Người xử lý: N1/N2 + Codex (đồng bộ token issuer runtime).

| ID | Mức | Phase | Vấn đề | Người xử lý | Trạng thái |
|---|---|---|---|---|---|
| F-01 | Cao | P01/P02 | Identity chưa nhận `catalog.contribution.applied/rejected.v1` và `intelligence.model.deployed.v1` dù registry khai báo; message bị bỏ trong môi trường kết nối | N1 + N2 | OPEN |
| F-02 | Trung bình | P00 | 11 endpoint ngoài candidate contract: 9 endpoint cũ và `POST /media`, `GET /admin/media/{id}`. Media đã có tài liệu extension và kiểm thử, chưa freeze/duyệt phiên bản mới | N1, N2 | OPEN |
| F-03 | Thấp | P01 | Seed category chưa có `homestay` | N1 | OPEN |
| F-04 | Thấp | P03 | Tìm alias dùng `LIKE '%q%'`, không có index trigram | N1 | OPEN |
| F-05 | Trung bình | P00 | Gate P00 chưa đóng nhưng P01–P03 đã merge | Điều phối | OPEN |
| F-06 | Trung bình | P02 | Chưa có object storage và distributed tracing | N1 | OPEN |
| F-07 | Trung bình | P02/P03 | Chưa test tương thích schema cũ/mới | Owner producer/consumer | OPEN |
| F-09 | Trung bình | P01/P02 | PR #14–#17 không có run ID CI riêng; đã có CI cho cây file sau PR #20 | Người merge | PARTIAL |
| F-14 | Cao | P00/P03 | Đã có upload user/admin, metadata, public read approved ở Gateway/provider; kiểm thử P02 upload/quarantine/reject PASS. Thiếu scanner thật để xác nhận APPROVE và public200; chưa có media version/If-Match và upload idempotency replay như candidate. Người dùng 30/10/2026 xác nhận chưa có scanner, tiếp tục dữ liệu P02; không bypass quarantine | N1 + N2; người dùng cung cấp scanner | PARTIAL |
| F-15 | Trung bình | P00/P02 | Place representation và OpenAPI/schema có `name_en`, `address`, `description`, `price_min/max`, `rating_avg`, `review_count`; Review có `author_name` tùy chọn. Catalog/Community build `-DskipTests` PASS; browser FE qua Gateway đã kiểm list/detail/review thật (3 API chuyển ✅ ở mục 9), giá null và rating/author khớp. `python backend/platform/validate_contracts.py` FAIL tại checksum manifest do artifact đang dirty; validator yêu cầu chỉ refresh sau khi thay đổi contract được review, nên chưa refresh. Chưa có N1 review/CI; giữ PARTIAL. `media_keys` FE đang dùng; giá Offering null không tự gán 0 | N1 | PARTIAL |
| F-16 | Trung bình | P00 | Thiếu API liệt kê hàng chờ duyệt cho admin (claim, yêu cầu sửa, xác minh doanh nghiệp, media) và cho doanh nghiệp (claim của mình); màn admin phải nhập ID tay | N1 | OPEN |
| F-17 | Trung bình | — | Plan chưa có scope di động: push/device token, deep link email, lưu token trên thiết bị, ảnh thu nhỏ/CDN | Người dùng quyết định | OPEN |
| F-19 | Thấp | — | Plan lệch: còn ô `[x]` trong `plan/`; "Reviewer: A–F" thay vì N1/N2; SLO Basic recommendation P03 (< 800 ms) khác P00 (≤ 1 giây). Đã đồng bộ riêng dòng Trạng thái P07/P08 theo progress ngày 29/10/2026; hướng dẫn song song cũ cần đọc theo quyết định Basic trước ML tại P00 | Điều phối | OPEN |

| F-20 | Trung bình | P03 | Chưa có dữ liệu du lịch/media production có giấy phép. Người dùng xác nhận 30/10/2026 tiếp tục kiểm thử bằng P02; DB/persist thật nhưng dữ liệu tổng hợp, không coi là dữ liệu production | N1 + người dùng cung cấp nguồn | OPEN |
| F-21 | Trung bình | P03 | Lighthouse preview production local: Performance 80, LCP 4,0 s (mục tiêu < 2,5 s) trên UI editorial (nhánh FE ghi là F-15, đánh số lại vì trùng ID) | N2 | OPEN |
| F-24 | Thấp | P03 | Đã cập nhật browser-nonai và thêm suite nghiệp vụ cho UI hiện tại; code FE cũ không còn dùng và clay-ui-check cũ chưa dọn. Không ảnh hưởng entry hiện tại `src/app/App.tsx` | N2 | PARTIAL |
| F-25 | Trung bình | P00/P01 | OpenAPI `POST /api/v1/interactions/batch` khai báo `security: []` nhưng `SecurityConfiguration` Intelligence yêu cầu `intelligence:write`; chưa thống nhất contract/provider security. Khảo sát tĩnh tại `89eb8cb`, chưa thay code/quyền | N2 + N1 review contract | OPEN |
| F-26 | Trung bình | P01/P03 (AI) | `BasicRepository.candidates` lấy 1.000 PUBLISHED theo UUID trước bộ lọc, có thể bỏ sót ứng viên hợp lệ; `persist` lấy `data_as_of` max trên candidate pool, chưa phản ánh freshness bảo thủ của kết quả thực dùng. Khảo sát tĩnh `BasicRepository.java:86,115` tại `89eb8cb`; cần regression >1.000 place và mixed freshness trong RC-G1-08/11, chưa có runtime evidence | N2 + N1 review | OPEN |
| F-32 | Trung bình | P02 | Sandbox import job có 4 item (`APPLIED`×2, `NEEDS_REVIEW`, `FAILED`), chưa có item trùng riêng. Ngoài ra `PipelineService.publicItemStatus` đổi nội bộ `DUPLICATE` thành `APPLIED` và `SKIPPED` thành `APPLIED` (trừ `REVIEW_REJECTED`), nên API/UI không phân biệt trùng với ghi thành công; chưa thể kiểm scenario trùng qua màn hiện tại | N1 | OPEN |
| F-33 | Cao | P00/P01 | Schema event đang sửa trên checkout dirty yêu cầu thêm `name_en`, `address`, `description`, `price_min`, `price_max`, `rating_avg`, `review_count` nhưng `CatalogRepository.emit` vẫn phát whitelist cũ. `python backend/services/catalog-service/test-local.py` ngày 03/11/2026, HEAD `ca83db7`, dirty, Java 21/PostGIS Docker: toàn suite 39/1/0/5 (run/failed/errors/skipped), FAIL tại `CatalogProviderTests.allSixtySixFrozenOperationsReturnValidatedProviderResponses`; riêng `CatalogDatabaseTests` 20/0/0/0. Hạ P01-CA-09; chưa sửa contract/event ngoài phạm vi bản đồ. Cần thống nhất schema/producer/consumer và chạy lại provider/broker trên cùng revision | N1 + N2 review consumer | OPEN |
| F-34 | Cao | P01/P02 | Đã sửa khôi phục xác minh/email hết hạn, chống gửi dồn và chuyển bước FE (`2f21c75`), kiểm local BE/Gateway/browser/SMTP Mailpit PASS (mục 9/O/P). Người dùng chọn Gmail thật 03/11/2026; máy chưa có SMTP credential, chờ nhập cục bộ qua `python backend/infra/configure_mail.py --apply` và xác nhận thư thực nhận. Candidate contract mới chưa CI/review; không nâng gate | Người dùng cấu hình Gmail; Codex kiểm; N1/N2 review | PARTIAL |
| F-35 | Trung bình | P01/P02 | Chính sách đăng ký mới bỏ xác minh email theo người dùng 05/11/2026; chưa kiểm Gateway/DB thật. Suite smoke/recovery/seed cũ cần bật IDENTITY_EMAIL_VERIFICATION_REQUIRED=true hoặc thích nghi với chính sách mới; không dùng bằng chứng cũ để nâng gate | Codex + N1/N2 review | PARTIAL |


Đã đóng: F-31 (Trung bình, P03, Codex: smoke phụ thuộc candidate của suite trước; fixture độc lập `fc370e8`, CI cũ `41334918573` FAIL, CI mới `41336264376` PASS trên `2f2e702`; PR #23), F-30 (Trung bình, P03, Codex: header cố định che nút quay lại chi tiết; `7b04167`, filters lần đầu FAIL, sau sửa 22/0/0/0), F-18 (khôi phục màn và nối đủ API không AI, còn hai nhánh media tách F-14; `4e020e1`/`edb10cb`, A–G), F-22 (sửa body/path/form thật; `4e020e1`, A/B/C/E/G), F-23 (bỏ bản ghi giả, chỉ cập nhật sau API thành công; `4e020e1`, F/H và negative assertions các suite).

Đã đóng trong lượt tích hợp này: F-27 (Cao, P02, N1: UUID PATCH500 và các field PATCH Catalog không persist; `66e6586`, J 38/0/0/0 và C readback), F-28 (Cao, P02, N2: Trip gọi URL Catalog destination detail không tồn tại; `66e6586`, L 43/0/0/0 và E tạo/sửa/xóa chặng thật), F-29 (Trung bình, P02, N1/N2: cap100 trước cursor và report queue thiếu nội dung/ID; `66e6586`, J/K pagination101, C/E report moderation). Không dùng stub destination detail cũ làm bằng chứng kết nối thật.

Đã đóng: F-08 (dòng trạng thái plan lỗi thời, PR #19), F-10 (PR #3/#4 đã ghi vào lịch sử), F-11 (môi trường thiếu Java 21/Docker; CI Linux đã chạy đủ), F-12 (MongoDB 8 lỗi với kernel runner ≥ 6.19; pin Ubuntu 22.04, PR #20), F-13 (kiểm phục hồi đường Community → Catalog bằng probe GET, PR #20).

---

## 11. Lệnh chạy kiểm thử backend

Yêu cầu: Java 21, Docker, Python 3, Node 24. Chạy từ thư mục gốc repo.

| Mục đích | Lệnh | Ghi chú |
|---|---|---|
| Unit/security 6 service | `backend/mvnw -B -f backend/services/pom.xml verify` | Suite DB/broker bị skip; **không** tính là DB PASS |
| DB/broker thật một service | `python backend/services/<service>-service/test-local.py` | Identity thêm `--transport --isolated-source`; các service khác thêm `--transport` để chạy broker |
| Gateway | `backend/mvnw -B -f backend/platform/api-gateway/pom.xml verify` | |
| Contract | `python backend/platform/validate_contracts.py` | 183 operation, 23 message |
| Môi trường kết nối P02 | `python backend/infra/p02.py prepare` → `build` → `up` → `smoke` → `monitor` | `status`, `manifest`, `replay-catalog-dlq` khi cần |
| Lỗi phụ thuộc P02 | `python backend/infra/p02_faults.py` | Cần stack P02 đang chạy |
| Tooling P03 | `python backend/infra/p03_nonai_tests.py` | Windows skip 1 test symlink |
| Gate P03 không AI | `python backend/infra/p03_gate.py --scope non-ai --release-id <id>` | Bằng chứng phải cùng release, dưới 24 giờ, khớp source |
| Test kết nối BE ↔ FE | `npm --prefix frontend run test:gateway` · `npm --prefix frontend run test:browser` | Cần stack P02 đang chạy; kết quả dùng để cập nhật mục 9. Lệnh FE khác: `progress_fe.md` |

Lỗi môi trường Windows: nếu JVM báo `Unable to establish loopback connection`, đặt `JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=<thư mục ngắn, có quyền ghi>`.

---

## 12. Lịch sử cập nhật

Mới nhất ở trên. Mỗi dòng: ngày giờ · thay đổi · PR/commit.

| Thời điểm | Thay đổi | PR / commit |
|---|---|---|
| 03/11/2026 00:46 | Seed thêm 12 khu vực du lịch con và chuyển 29 địa điểm từ phạm vi tỉnh sang khu vực qua Catalog API; 18 test seed và browser filters 29/0/0/0 PASS, có xác nhận Gateway thật; build FE PASS. Giữ trạng thái API tổng, không đổi contract, chưa CI/review | Nhánh feature/explore-ui-demo-content, HEAD ca83db7 (checkout dirty) |
| 03/11/2026 13:18 | Sửa luồng đăng ký/xác minh/gửi lại/login và khôi phục mật khẩu; local BE64/Gateway22/browser13+8+1/client15 PASS; cập nhật 4 API tài khoản về ✅, tổng159✅/2🟡/176. Đã cập nhật riêng Identity/Gateway local; SMTP Gmail thật chờ người dùng cấu hình, F-34 PARTIAL; chưa CI/gate | Nhánh `fix/identity-registration-verification`, source `2f21c75`, chạy dirty |
| 03/11/2026 00:34 | Mở rộng fixture P02 lên 8 tài khoản/29 địa điểm/29 review và các queue; 16 test seed PASS, seed + `--verify-only` PASS, lượt lặp tạo 0/cập nhật 0; 21 kiểm tra Playwright thật qua Vite/Gateway, 0 lỗi trang; ẩn 2 legacy public qua Catalog, tổng 50 ID hidden; mở F-32. Contract validator dừng tại checksum manifest dirty, chưa refresh khi chưa review; chưa CI/gate | Nhánh `feature/explore-ui-demo-content`, HEAD `ca83db7` |
| 02/11/2026 23:23 | Mở rộng representation/schema Place và Review cho giá, điểm, số review, tên người đánh giá; build Catalog/Community `-DskipTests`, P02 health và GET qua Gateway thủ công PASS; suite/CI chưa chạy. Hạ ba API về 🟡 do chưa có kiểm thử contract/FE trên revision mới; giữ F-15 PARTIAL | Nhánh `feature/explore-ui-demo-content`, HEAD `ca83db7` (checkout dirty) |
| 02/11/2026 01:33 | Merge tích hợp BE–FE, seed mẫu, path/bộ lọc/giao diện; 11 check CI PASS trên revision PR `2f2e702`; sửa F-30/F-31, không đóng gate | [PR #23](https://github.com/24521914-ux/SmartTravel_VN/pull/23), merge `4223631bc955ca47475fe2bb630a7a48576a3681` |
| 30/10/2026 22:48 | Rà soát: 7/7 report được công cụ tổng hợp chấp nhận, 160/175 API được quan sát, 158 có 2xx; bảng API khớp tổng. Đồng bộ dòng Trạng thái hai README plan và P04 (lệch tài liệu thuộc F-19). Chỉ đọc lại bằng chứng cũ, không chạy lại suite nghiệp vụ/CI, không nâng trạng thái hoặc đóng gate | Baseline `5015912`; nhánh `fix/frontend-backend-integration`, checkout có `.ai-memory/` untracked |
| 30/10/2026 22:03 | Kiểm lại FE↔BE trên P02: 158✅/2🟡; sửa provider UUID/PATCH/pagination, Trip destination path, media cap, report queue, refresh/login; đóng F-18/F-22/F-23. Chỉ local, chưa CI/merge/gate | `66e6586`, `4e020e1`, `edb10cb`, `40590cf` |
| 29/10/2026 15:07 | Hoàn thành master plan Unified Modular Recommendation (chỉ tài liệu), 13 file/60 task; kiểm lại 11 nhóm tĩnh sau khi đồng bộ dataset/model/policy JSON examples; thêm F-25/F-26 từ đối chiếu source/contract; đồng bộ dòng Trạng thái P07/P08, giữ AI DEFERRED và trạng thái kết nối hiện hữu | Nhánh `docs/intelligence-modular-recommendation-plan`, commit `0df6399` |
| 23/10/2026 01:05 | Merge frontend v4 (`feature/frontend-floria-v4-refinement`) vào cấu trúc progress BE/FE; xóa `progress/` cũ còn trong nhánh FE; đối chiếu lại kết nối BE ↔ FE trên UI mới: 0 ✅, 27 🟡, 9 ❌; hạ P02-09, P03-07 xuống `PARTIAL`; thêm F-20…F-24. Sửa giờ hai dòng 22/10 bên dưới (trước ghi nhầm giờ UTC) | Merge `eed140a`, nhánh `docs/progress-frontend-v4-merge` |
| 22/10/2026 23:50 | Tách progress thành `progress_be.md` và `progress_fe.md`; thêm mục 9 trạng thái kết nối BE ↔ FE cho 172 API | Nhánh `docs/progress-be-fe-split` |
| 22/10/2026 23:25 | Gộp toàn bộ progress vào một file `PROGRESS.md`, sắp theo phase; xóa thư mục `progress/`; thêm F-14…F-19; P03 ghi đúng `PARTIAL` theo từng task (bản cũ ghi `NOT_STARTED` trong thân) | Nhánh `docs/progress-single-file` |
| 21/10/2026 11:00 | P03 phạm vi không AI, tooling P03, tắt AI mặc định; CI 11/11 PASS | PR #20, `c1e8e29` |
| 20/10/2026 15:32 | Đối chiếu source với progress, thêm quy tắc ghi progress, findings F-01…F-11 | PR #19, `3e20d63` |
| 16/10/2026 | Ổn định test DLQ và cấp port Catalog trong CI | PR #17, `9f4beca` |
| 15/10/2026 | P02: Gateway, môi trường kết nối, frontend nghiệp vụ | PR #16, `14b342c` |
| 15/10/2026 | P01: Identity vòng đời, Catalog, Community, Trip, Ingestion, Intelligence, Gateway + frontend client | PR #9–#15 |
| 14/10/2026 | Identity hộp thư thông báo | PR #8, `cb44518` |
| 10/10/2026 | P01 M1 storage/runtime; Identity xác thực, preferences, admin | PR #5–#7 |
| 10/10/2026 | Cấu hình database cloud | PR #4, `5319942` |
| 08/10/2026 | P00 nền tảng; quy tắc Git; landing frontend | PR #1–#3 |

- [ ] Chuẩn bị PR tích hợp — **BLOCKED** · Codex, nhánh `feature/travel-timeline-account-integration`, source `4e6651e`, checkout dirty chỉ do `.env`/`.ai-memory/` chưa theo dõi. Java 21: Identity `mvn -f backend/services/identity-service/pom.xml test -q` 66/0/0/44; Trip `mvn -f backend/services/trip-service/pom.xml test -q` 54/0/0/41 (run/failed/errors/skipped); chỉ unit/security, DB/broker bị skip, không dùng đóng gate. `python backend/platform/validate_contracts.py` PASS: 184 HTTP, 23 event/command, 1 additive contract. Quét secret: không có credential thật; hai chuỗi mật khẩu synthetic trong test. GitHub cổng 443 timeout, chưa fetch/push/PR/CI; Codex tiếp tục đồng bộ main và tạo PR khi kết nối phục hồi. `origin/main` cache lệch 19 commit so với baseline; chưa tích hợp cache vì chưa xác nhận remote mới nhất.
