# Tiến độ Backend (BE) — SmartTravel VN

Cập nhật: **29/10/2026 15:07** (GMT+7)

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
| **P01** Phát triển độc lập | 6 service có nghiệp vụ thật, test với DB thật + stub đối tác | 61/67 task `LOCAL_VERIFIED`; 6 task bàn giao `PARTIAL` | Local DB/broker thật + CI PASS cho 5 service | Chữ ký reviewer từng service; xác nhận ánh xạ CI → task | N1 review Community/Trip/Intelligence; N2 review Identity/Catalog/Ingestion |
| **P02** Kết nối thật | Gateway, HTTP, broker giữa 6 service, frontend qua Gateway | `PARTIAL` 11/15 task | Local + CI `connected` PASS (UI cũ) | P02-01, P02-08, P02-09, P02-14; chữ ký | Làm F-01 (consumer Identity), object storage/tracing, test schema evolution |
| **P03** Kiểm thử hệ thống | E2E, bảo mật, lỗi phụ thuộc, tải, restore, browser | `PARTIAL`, phạm vi **không AI** đạt gate local trên UI cũ; P03-07 hạ `PARTIAL` sau khi FE thiết kế lại; AI `DEFERRED` | Local (checkout dirty) + CI tooling/connected PASS | Chạy lại gate trên commit sạch của `main`; chữ ký; phần AI | Chạy `p03_gate.py --scope non-ai` trên `main` sạch; N1/N2 ký |
| **P04** Phát hành | Triển khai mới, rollback, bàn giao vận hành | `NOT_STARTED` | — | Toàn bộ; bị chặn bởi gate P03 | Chuẩn bị target triển khai, domain, credential provider |
| **Kết nối BE ↔ FE** | Mỗi API public/admin có màn FE gọi qua Gateway và được test | 0 ✅ · 27 🟡 · 9 ❌ · 121 ⚪ · 14 ⏸️ (mục 9) | UI mới (merge 23/10/2026) chưa chạy test FE qua Gateway | 9 API lỗi; test FE cho UI mới; 121 API chưa có màn | Sửa F-22/F-23 (FE gửi sai contract, báo thành công giả); cập nhật và chạy lại `test:browser`, `test:gateway` |

**Tóm tắt một dòng:** backend 6 service và Gateway đã code xong, nối với nhau và qua kiểm thử hệ thống phạm vi không AI ở local; chưa phase nào được đóng gate chính thức vì thiếu chữ ký N1/N2. Phần AI (recommendation, lịch sử tương tác, ML) đang tạm hoãn theo quyết định người dùng. Frontend vừa được thiết kế lại (merge 23/10/2026): UI mới gọi 36 API không AI, trong đó 9 API lỗi; chưa API nào được test lại qua Gateway (mục 9).

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
| 🟡 Đã nối, chưa kiểm | FE có màn hình gọi API nhưng chưa có test FE nào chạy qua | Cần thêm bước vào `browser-nonai.mjs` hoặc `gateway-smoke.mjs` |
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
| FLOW-03 | Tìm kiếm địa điểm | `GET /places?q&lat&lon&radiusM&categoryId&minPrice&maxPrice&minRating&cursor` → bỏ dấu tiếng Việt + alias + PostGIS → trang kết quả, cursor ổn định | F02–F04 | CI PASS |
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

- [x] P01-ID-03: Đăng ký/xác minh/login/logout/refresh/đặt lại/đổi mật khẩu, rate limit — **LOCAL_VERIFIED** · `AuthDatabaseTests`.
- [x] P01-ID-04: Hồ sơ, preferences, consent, admin user/status/role, API batch nội bộ — **LOCAL_VERIFIED** · `PreferencePatchTests`, `CategoryClientTests`.
- [x] P01-ID-05: Hộp thư thông báo, gửi email có retry; yêu cầu xóa và thu ack — **LOCAL_VERIFIED** · `deletionRevokesAndTombstonesAtomicallyButRequiresAllSixAcknowledgements`.
- [x] P01-CA-03: Phân cấp địa lý (chống vòng), taxonomy, vòng đời địa điểm + lịch sử — **LOCAL_VERIFIED** · `hierarchyCycleEffectiveOverlapAndEventPublishScheduleAreRejected`.
- [x] P01-CA-04: Tìm tiếng Việt/alias, lọc, cursor ổn định, khoảng cách mét, lọc rating — **LOCAL_VERIFIED** · `cursorRejectsTamperingAndChangedFiltersAndPagesWithoutDuplicates`. Hiệu năng alias: F-04.
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
- [x] P01-CA-09: Phát event địa điểm/visibility/destination/category/claim; snapshot API — **LOCAL_VERIFIED** · `BrokerDatabaseTests` (5).
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
- [ ] **Gate P01** (6/6 `READY_FOR_INTEGRATION` có chữ ký) — **PARTIAL** · Thiếu: chữ ký N1/N2 cho 6 gói.

---

## 6. P02 — Kết nối các service

Yêu cầu: `plan/phases/P02-service-integration.md` · Trạng thái phase: **`PARTIAL`** 11/15 task (P02-09 hạ ngày 23/10/2026).

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
- [ ] P02-09: Frontend gọi Gateway thật; lỗi/pending có UI rõ; provider sandbox ghi rõ — **PARTIAL** (hạ từ `LOCAL_VERIFIED` ngày 23/10/2026) · Bằng chứng cũ: `test:gateway`, `test:browser` PASS trên UI cũ, CI run 39540804333 · Lý do hạ: UI mới (merge FE v4) báo thành công khi API lỗi và gửi sai body/path ở 5 API (F-22, F-23); test FE chưa chạy lại · Next: sửa F-22/F-23, chạy lại hai test. Trạng thái từng API: mục 9.
- [x] P02-10: Route Gateway, chặn internal/actuator, đổi token theo service đích — **LOCAL_VERIFIED** · `GatewayRoutingTests`, `PrincipalExchangeFilterTests`.
- [x] P02-11: Snapshot + watermark + delta + chống trùng — **LOCAL_VERIFIED** · `SnapshotRebuildTests` · Chỉ local; AI DEFERRED.
- [x] P02-12: Outbox/inbox/retry/DLQ/replay, crash sau commit — **LOCAL_VERIFIED** · CI resilience PASS.
- [x] P02-13: Không trỏ stub/issuer test/fixture — **LOCAL_VERIFIED**.
- [ ] P02-14: Tương thích schema cũ/mới — **NOT_STARTED** · Chưa có revision contract thứ hai (F-07) · Next: làm cùng contract `1.1.0`.
- [ ] **Gate P02** (6/6 `CONNECTED`) — **PARTIAL** · Thiếu: P02-01, P02-08, P02-09, P02-14, chữ ký.

---

## 7. P03 — Kiểm thử hệ thống

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
- [ ] P03-07: Browser user/business/admin — **PARTIAL** (hạ từ `LOCAL_VERIFIED` ngày 23/10/2026) · Bằng chứng cũ (UI cũ): `browser-nonai.mjs` 8 nhóm, 36 case responsive, CI PASS · UI mới chỉ có test giả lập API (`test:ui`, `test:ui:editorial`) trên checkout dirty · Thiếu: chạy lại test trình duyệt với Gateway trên UI mới, sửa F-22/F-23, LCP (F-21). Chi tiết `progress_fe.md`.
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

Bảng dưới là trạng thái nối giữa từng API public/admin của backend và frontend web, theo định nghĩa ở mục 2.2. Nguồn API: `backend/contracts/openapi/*.yaml` (171 operation không tính 12 API `/internal`, thêm 1 API media ngoài contract).

**Đối chiếu ngày 23/10/2026 trên UI mới** (merge `feature/frontend-floria-v4-refinement`, entry `src/app/App.tsx` + `src/features/*`):
- Không còn API nào ✅: test FE qua Gateway (`gateway-smoke.mjs`, `browser-nonai.mjs`) PASS lần cuối trên UI cũ (CI run 39540804333) và chưa chạy lại trên UI mới.
- 9 API ❌: FE gửi body/path sai contract hoặc form báo thành công mà không gọi API (F-22). Khi API lỗi, nhiều màn tạo bản ghi giả và vẫn báo thành công (F-23), nên lỗi không hiện ra khi dùng thử.
- 12 API UI cũ đã dùng nay không còn màn gọi (về ⚪): `POST /auth/register`, `POST /auth/verify-email`, `PATCH /me`, `GET/PUT /me/preferences`, `POST /me/deletion-requests`, `GET /places/{place_id}`, `GET /businesses/{business_id}`, `GET /me/collections/{collection_id}`, `POST /collections/{collection_id}/items`, `GET /trips/{trip_id}`, `PATCH /trips/.../items/{item_id}`, `GET /admin/import-jobs/{job_id}`.
- API mới được nối: `GET /categories`, `GET /places/{place_id}/offerings`, `DELETE /me/favorites/{place_id}`.

**Ưu tiên tiếp theo:**
1. Bỏ toàn bộ fallback "bản ghi giả + báo thành công" (F-23) và sửa 5 lời gọi sai contract (F-22).
2. Cập nhật `browser-nonai.mjs` theo UI mới, chạy lại `test:browser` và `test:gateway` với stack P02 để đưa API 🟡 lên ✅.
3. Khôi phục 12 chức năng bị mất (đăng ký, xác minh email, preferences, xóa dữ liệu, thêm item collection, khóa item trip, theo dõi import job…).
4. Sửa ❌ `GET /media/{id}` (F-14) để hiển thị ảnh.

| Service | ✅ Hoàn thiện | 🟡 Đã nối, chưa kiểm | ❌ Lỗi | ⚪ Chưa thực hiện | ⏸️ Hoãn | ➖ Không áp dụng | Tổng |
|---|---|---|---|---|---|---|---|
| Identity | 0 | 6 | 1 | 14 | 0 | 1 | 22 |
| Catalog | 0 | 7 | 5 | 51 | 0 | 0 | 63 |
| Community | 0 | 9 | 0 | 21 | 0 | 0 | 30 |
| Trip | 0 | 4 | 2 | 23 | 0 | 0 | 29 |
| Ingestion | 0 | 1 | 1 | 12 | 0 | 0 | 14 |
| Intelligence | 0 | 0 | 0 | 0 | 14 | 0 | 14 |
| **Tổng** | **0** | **27** | **9** | **121** | **14** | **1** | **172** |

#### Identity

| API | Trạng thái kết nối | Màn hình FE / ghi chú |
|---|---|---|
| `POST /auth/register` | ⚪ Chưa thực hiện | — |
| `POST /auth/login` | 🟡 Đã nối, chưa kiểm | Tài khoản: Đăng nhập (AuthProvider) |
| `POST /auth/refresh` | 🟡 Đã nối, chưa kiểm | Tự động khi token hết hạn |
| `POST /auth/logout` | 🟡 Đã nối, chưa kiểm | Tài khoản: Đăng xuất |
| `POST /auth/verify-email` | ⚪ Chưa thực hiện | — |
| `POST /auth/forgot-password` | ⚪ Chưa thực hiện | — |
| `POST /auth/reset-password` | ⚪ Chưa thực hiện | — |
| `GET /me` | 🟡 Đã nối, chưa kiểm | AuthProvider tải hồ sơ |
| `PATCH /me` | ⚪ Chưa thực hiện | — |
| `PUT /me/password` | ❌ Lỗi | Tab Bảo mật: form báo "Đã cập nhật mật khẩu" nhưng không gọi API (F-22) |
| `GET /me/preferences` | ⚪ Chưa thực hiện | — |
| `PUT /me/preferences` | ⚪ Chưa thực hiện | — |
| `GET /preference-options` | ⚪ Chưa thực hiện | — |
| `GET /me/sessions` | ⚪ Chưa thực hiện | — |
| `DELETE /me/sessions/{session_id}` | ⚪ Chưa thực hiện | — |
| `GET /me/notifications` | 🟡 Đã nối, chưa kiểm | Thông báo |
| `PATCH /me/notifications/{notification_id}/read` | 🟡 Đã nối, chưa kiểm | Thông báo: Đánh dấu đã đọc |
| `POST /me/deletion-requests` | ⚪ Chưa thực hiện | — |
| `GET /admin/users` | ⚪ Chưa thực hiện | — |
| `PATCH /admin/users/{user_id}/status` | ⚪ Chưa thực hiện | — |
| `PUT /admin/users/{user_id}/roles` | ⚪ Chưa thực hiện | — |
| `GET /.well-known/jwks.json` | ➖ Không áp dụng | Gateway dùng nội bộ, FE không gọi |

#### Catalog

| API | Trạng thái kết nối | Màn hình FE / ghi chú |
|---|---|---|
| `GET /admin/places` | 🟡 Đã nối, chưa kiểm | Kiểm duyệt: địa điểm |
| `POST /admin/places` | ⚪ Chưa thực hiện | — |
| `GET /admin/places/{place_id}` | ⚪ Chưa thực hiện | — |
| `PATCH /admin/places/{place_id}` | ⚪ Chưa thực hiện | — |
| `DELETE /admin/places/{place_id}` | ⚪ Chưa thực hiện | — |
| `GET /places` | 🟡 Đã nối, chưa kiểm | Khám phá, Bản đồ, chọn địa điểm cho trip (F-15) |
| `GET /places/{place_id}` | ⚪ Chưa thực hiện | — |
| `PUT /admin/places/{place_id}/status` | 🟡 Đã nối, chưa kiểm | Kiểm duyệt: đổi trạng thái; lỗi bị báo thành công (F-23) |
| `GET /admin/geographic-units` | ⚪ Chưa thực hiện | — |
| `POST /admin/geographic-units` | ⚪ Chưa thực hiện | — |
| `GET /admin/geographic-units/{id}` | ⚪ Chưa thực hiện | — |
| `PATCH /admin/geographic-units/{id}` | ⚪ Chưa thực hiện | — |
| `DELETE /admin/geographic-units/{id}` | ⚪ Chưa thực hiện | — |
| `GET /geographic-units` | ⚪ Chưa thực hiện | — |
| `GET /admin/destinations` | ⚪ Chưa thực hiện | — |
| `POST /admin/destinations` | ⚪ Chưa thực hiện | — |
| `GET /admin/destinations/{destination_id}` | ⚪ Chưa thực hiện | — |
| `PATCH /admin/destinations/{destination_id}` | ⚪ Chưa thực hiện | — |
| `DELETE /admin/destinations/{destination_id}` | ⚪ Chưa thực hiện | — |
| `GET /destinations` | ⚪ Chưa thực hiện | — |
| `GET /admin/categories` | ⚪ Chưa thực hiện | — |
| `POST /admin/categories` | ⚪ Chưa thực hiện | — |
| `GET /admin/categories/{id}` | ⚪ Chưa thực hiện | — |
| `PATCH /admin/categories/{id}` | ⚪ Chưa thực hiện | — |
| `DELETE /admin/categories/{id}` | ⚪ Chưa thực hiện | — |
| `GET /categories` | 🟡 Đã nối, chưa kiểm | Khám phá: bộ lọc danh mục |
| `GET /admin/tags` | ⚪ Chưa thực hiện | — |
| `POST /admin/tags` | ⚪ Chưa thực hiện | — |
| `GET /admin/tags/{id}` | ⚪ Chưa thực hiện | — |
| `PATCH /admin/tags/{id}` | ⚪ Chưa thực hiện | — |
| `DELETE /admin/tags/{id}` | ⚪ Chưa thực hiện | — |
| `GET /tags` | ⚪ Chưa thực hiện | — |
| `GET /admin/amenities` | ⚪ Chưa thực hiện | — |
| `POST /admin/amenities` | ⚪ Chưa thực hiện | — |
| `GET /admin/amenities/{id}` | ⚪ Chưa thực hiện | — |
| `PATCH /admin/amenities/{id}` | ⚪ Chưa thực hiện | — |
| `DELETE /admin/amenities/{id}` | ⚪ Chưa thực hiện | — |
| `GET /amenities` | ⚪ Chưa thực hiện | — |
| `GET /admin/offerings` | ⚪ Chưa thực hiện | — |
| `POST /admin/offerings` | ⚪ Chưa thực hiện | — |
| `GET /admin/offerings/{offering_id}` | ⚪ Chưa thực hiện | — |
| `PATCH /admin/offerings/{offering_id}` | ⚪ Chưa thực hiện | — |
| `DELETE /admin/offerings/{offering_id}` | ⚪ Chưa thực hiện | — |
| `GET /offerings` | ⚪ Chưa thực hiện | — |
| `GET /places/{place_id}/offerings` | 🟡 Đã nối, chưa kiểm | Chi tiết địa điểm: dịch vụ |
| `GET /businesses` | 🟡 Đã nối, chưa kiểm | Doanh nghiệp |
| `POST /businesses` | ❌ Lỗi | Doanh nghiệp: Tạo — gửi thêm registration_number/contact_* ngoài schema → 400, UI vẫn báo thành công với bản ghi giả (F-22, F-23) |
| `GET /businesses/{business_id}` | ⚪ Chưa thực hiện | — |
| `PATCH /businesses/{business_id}` | ⚪ Chưa thực hiện | — |
| `DELETE /businesses/{business_id}` | ⚪ Chưa thực hiện | — |
| `GET /businesses/{business_id}/members` | 🟡 Đã nối, chưa kiểm | Doanh nghiệp: thành viên |
| `POST /businesses/{business_id}/members` | ⚪ Chưa thực hiện | — |
| `GET /businesses/{business_id}/members/{member_id}` | ⚪ Chưa thực hiện | — |
| `PATCH /businesses/{business_id}/members/{member_id}` | ⚪ Chưa thực hiện | — |
| `DELETE /businesses/{business_id}/members/{member_id}` | ⚪ Chưa thực hiện | — |
| `POST /businesses/{business_id}/verification` | ❌ Lỗi | Doanh nghiệp: form xác minh báo thành công nhưng không gọi API (F-22) |
| `POST /businesses/{business_id}/claims` | ❌ Lỗi | Doanh nghiệp: form claim báo thành công nhưng không gọi API (F-22) |
| `POST /claims/{claim_id}/change-requests` | ⚪ Chưa thực hiện | — |
| `POST /admin/claims/{id}/review` | ⚪ Chưa thực hiện | — |
| `POST /admin/change-requests/{id}/review` | ⚪ Chưa thực hiện | — |
| `POST /admin/business-verifications/{id}/review` | ❌ Lỗi | Kiểm duyệt: form xét duyệt KYC báo thành công nhưng không gọi API (F-22) |
| `POST /admin/media/{id}/review` | ⚪ Chưa thực hiện | — |
| `GET /media/{id}` (ngoài contract) | ❌ Lỗi | Ảnh cần JWT qua Gateway, `<img>` không tải được (F-14) |

#### Community

| API | Trạng thái kết nối | Màn hình FE / ghi chú |
|---|---|---|
| `GET /places/{place_id}/reviews` | 🟡 Đã nối, chưa kiểm | Chi tiết địa điểm, showcase landing |
| `POST /places/{place_id}/reviews` | 🟡 Đã nối, chưa kiểm | Chi tiết địa điểm: Viết đánh giá; chưa có ảnh (F-14) |
| `PATCH /reviews/{review_id}` | ⚪ Chưa thực hiện | — |
| `DELETE /reviews/{review_id}` | ⚪ Chưa thực hiện | — |
| `POST /reviews/{review_id}/reports` | ⚪ Chưa thực hiện | — |
| `GET /me/favorites` | ⚪ Chưa thực hiện | — |
| `PUT /me/favorites/{place_id}` | 🟡 Đã nối, chưa kiểm | Khám phá, chi tiết: Lưu yêu thích; ở trang chi tiết lỗi bị báo thành công (F-23) |
| `DELETE /me/favorites/{place_id}` | 🟡 Đã nối, chưa kiểm | Khám phá, chi tiết: Bỏ lưu (F-23) |
| `GET /me/collections` | 🟡 Đã nối, chưa kiểm | Bộ sưu tập |
| `POST /me/collections` | 🟡 Đã nối, chưa kiểm | Bộ sưu tập: Tạo; lỗi bị báo thành công (F-23) |
| `GET /me/collections/{collection_id}` | ⚪ Chưa thực hiện | — |
| `PATCH /me/collections/{collection_id}` | ⚪ Chưa thực hiện | — |
| `DELETE /me/collections/{collection_id}` | ⚪ Chưa thực hiện | — |
| `GET /collections/{collection_id}` | ⚪ Chưa thực hiện | — |
| `GET /collections/{collection_id}/items` | 🟡 Đã nối, chưa kiểm | Bộ sưu tập: địa điểm |
| `POST /collections/{collection_id}/items` | ⚪ Chưa thực hiện | — |
| `GET /collections/{collection_id}/items/{item_id}` | ⚪ Chưa thực hiện | — |
| `PATCH /collections/{collection_id}/items/{item_id}` | ⚪ Chưa thực hiện | — |
| `DELETE /collections/{collection_id}/items/{item_id}` | ⚪ Chưa thực hiện | — |
| `PUT /collections/{collection_id}/items/order` | ⚪ Chưa thực hiện | — |
| `POST /contributions` | ⚪ Chưa thực hiện | — |
| `GET /me/contributions` | ⚪ Chưa thực hiện | — |
| `PATCH /contributions/{contribution_id}` | ⚪ Chưa thực hiện | — |
| `POST /contributions/{contribution_id}/withdraw` | ⚪ Chưa thực hiện | — |
| `GET /admin/reviews` | 🟡 Đã nối, chưa kiểm | Kiểm duyệt: đánh giá |
| `POST /admin/reviews/{id}/moderate` | 🟡 Đã nối, chưa kiểm | Kiểm duyệt: duyệt/ẩn; lỗi bị báo thành công (F-23) |
| `GET /admin/contributions` | ⚪ Chưa thực hiện | — |
| `POST /admin/contributions/{id}/moderate` | ⚪ Chưa thực hiện | — |
| `GET /admin/reports` | ⚪ Chưa thực hiện | — |
| `POST /admin/reports/{id}/moderate` | ⚪ Chưa thực hiện | — |

#### Trip

| API | Trạng thái kết nối | Màn hình FE / ghi chú |
|---|---|---|
| `GET /me/trips` | 🟡 Đã nối, chưa kiểm | Chuyến đi |
| `POST /me/trips` | ❌ Lỗi | Chuyến đi: Tạo — gửi budget_estimate, thiếu timezone/currency → 400, UI tạo trip giả (F-22, F-23) |
| `GET /trips/{trip_id}` | ⚪ Chưa thực hiện | — |
| `PATCH /trips/{trip_id}` | ⚪ Chưa thực hiện | — |
| `DELETE /trips/{trip_id}` | ⚪ Chưa thực hiện | — |
| `PUT /trips/{trip_id}/state` | ⚪ Chưa thực hiện | — |
| `GET /trips/{trip_id}/destinations` | ⚪ Chưa thực hiện | — |
| `POST /trips/{trip_id}/destinations` | ⚪ Chưa thực hiện | — |
| `GET /trips/{trip_id}/destinations/{segment_id}` | ⚪ Chưa thực hiện | — |
| `PATCH /trips/{trip_id}/destinations/{segment_id}` | ⚪ Chưa thực hiện | — |
| `DELETE /trips/{trip_id}/destinations/{segment_id}` | ⚪ Chưa thực hiện | — |
| `GET /trips/{trip_id}/days` | 🟡 Đã nối, chưa kiểm | Chuyến đi: ngày |
| `POST /trips/{trip_id}/days` | 🟡 Đã nối, chưa kiểm | Chuyến đi: Thêm ngày; lỗi tạo ngày giả (F-23) |
| `GET /trips/{trip_id}/days/{day_id}` | ⚪ Chưa thực hiện | — |
| `PATCH /trips/{trip_id}/days/{day_id}` | ⚪ Chưa thực hiện | — |
| `DELETE /trips/{trip_id}/days/{day_id}` | ⚪ Chưa thực hiện | — |
| `GET /trips/{trip_id}/days/{day_id}/items` | 🟡 Đã nối, chưa kiểm | Chuyến đi: địa điểm trong ngày |
| `POST /trips/{trip_id}/days/{day_id}/items` | ❌ Lỗi | Chuyến đi: Thêm địa điểm — gửi start_time, thiếu locked/recommendation_request_id → 400, UI thêm item giả (F-22, F-23) |
| `GET /trips/{trip_id}/days/{day_id}/items/{item_id}` | ⚪ Chưa thực hiện | — |
| `PATCH /trips/{trip_id}/days/{day_id}/items/{item_id}` | ⚪ Chưa thực hiện | — |
| `DELETE /trips/{trip_id}/days/{day_id}/items/{item_id}` | ⚪ Chưa thực hiện | — |
| `PUT /trips/{trip_id}/days/{day_id}/items/order` | ⚪ Chưa thực hiện | — |
| `GET /trips/{trip_id}/transfers` | ⚪ Chưa thực hiện | — |
| `POST /trips/{trip_id}/transfers` | ⚪ Chưa thực hiện | — |
| `GET /trips/{trip_id}/transfers/{transfer_id}` | ⚪ Chưa thực hiện | — |
| `PATCH /trips/{trip_id}/transfers/{transfer_id}` | ⚪ Chưa thực hiện | — |
| `DELETE /trips/{trip_id}/transfers/{transfer_id}` | ⚪ Chưa thực hiện | — |
| `POST /trips/{trip_id}/route-estimates` | ⚪ Chưa thực hiện | — |
| `POST /trips/{trip_id}/snapshots/refresh` | ⚪ Chưa thực hiện | — |

#### Ingestion

| API | Trạng thái kết nối | Màn hình FE / ghi chú |
|---|---|---|
| `GET /admin/data-sources` | 🟡 Đã nối, chưa kiểm | Quản trị: nguồn dữ liệu |
| `POST /admin/data-sources` | ⚪ Chưa thực hiện | — |
| `GET /admin/data-sources/{source_id}` | ⚪ Chưa thực hiện | — |
| `PATCH /admin/data-sources/{source_id}` | ⚪ Chưa thực hiện | — |
| `DELETE /admin/data-sources/{source_id}` | ⚪ Chưa thực hiện | — |
| `PATCH /admin/data-sources/{source_id}/policy` | ⚪ Chưa thực hiện | — |
| `POST /admin/data-sources/{source_id}/import-jobs` | ❌ Lỗi | Quản trị: gọi sai path .../jobs và body run_mode/dry_run (contract: mode) → lỗi, UI tạo job giả (F-22, F-23) |
| `GET /admin/import-jobs/{job_id}` | ⚪ Chưa thực hiện | — |
| `GET /admin/import-jobs/{job_id}/items` | ⚪ Chưa thực hiện | — |
| `GET /admin/import-jobs/{job_id}/errors` | ⚪ Chưa thực hiện | — |
| `GET /admin/import-jobs/{job_id}/candidates` | ⚪ Chưa thực hiện | — |
| `POST /admin/import-jobs/{job_id}/retry` | ⚪ Chưa thực hiện | — |
| `POST /admin/import-jobs/{job_id}/cancel` | ⚪ Chưa thực hiện | — |
| `POST /admin/import-items/{item_id}/decision` | ⚪ Chưa thực hiện | — |

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

| ID | Mức | Phase | Vấn đề | Người xử lý | Trạng thái |
|---|---|---|---|---|---|
| F-01 | Cao | P01/P02 | Identity chưa nhận `catalog.contribution.applied/rejected.v1` và `intelligence.model.deployed.v1` dù registry khai báo; message bị bỏ trong môi trường kết nối | N1 + N2 | OPEN |
| F-02 | Trung bình | P00 | 9 endpoint ngoài contract: Identity `security/exchange`, `security/session`, preferences snapshot; Catalog `features-snapshot`, `POST /admin/media`, `GET /media/{id}`; Trip interactions snapshot; Intelligence `features/rebuild`, `events` | N1, N2 | OPEN |
| F-03 | Thấp | P01 | Seed category chưa có `homestay` | N1 | OPEN |
| F-04 | Thấp | P03 | Tìm alias dùng `LIKE '%q%'`, không có index trigram | N1 | OPEN |
| F-05 | Trung bình | P00 | Gate P00 chưa đóng nhưng P01–P03 đã merge | Điều phối | OPEN |
| F-06 | Trung bình | P02 | Chưa có object storage và distributed tracing | N1 | OPEN |
| F-07 | Trung bình | P02/P03 | Chưa test tương thích schema cũ/mới | Owner producer/consumer | OPEN |
| F-09 | Trung bình | P01/P02 | PR #14–#17 không có run ID CI riêng; đã có CI cho cây file sau PR #20 | Người merge | PARTIAL |
| F-14 | Cao | P00/P03 | User/doanh nghiệp không có API upload ảnh (review nhận `media_keys` nhưng chỉ admin upload được); `GET /media/{id}` cần đăng nhập qua Gateway nên khách không xem được ảnh | N1 + N2 | OPEN |
| F-15 | Trung bình | P00 | Response Place trong contract thiếu `address`, `description`, `rating_avg`, `review_count`, `media`; code vẫn trả các trường này | N1 | OPEN |
| F-16 | Trung bình | P00 | Thiếu API liệt kê hàng chờ duyệt cho admin (claim, yêu cầu sửa, xác minh doanh nghiệp, media) và cho doanh nghiệp (claim của mình); màn admin phải nhập ID tay | N1 | OPEN |
| F-17 | Trung bình | — | Plan chưa có scope di động: push/device token, deep link email, lưu token trên thiết bị, ảnh thu nhỏ/CDN | Người dùng quyết định | OPEN |
| F-18 | Trung bình | P03 | UI mới gọi 36/157 API không AI (27 🟡, 9 ❌); 121 API chưa có màn; 12 API UI cũ đã dùng nay bị mất. Chi tiết mục 9 | N2 + N1 | OPEN |
| F-19 | Thấp | — | Plan lệch: còn ô `[x]` trong `plan/`; "Reviewer: A–F" thay vì N1/N2; SLO Basic recommendation P03 (< 800 ms) khác P00 (≤ 1 giây). Đã đồng bộ riêng dòng Trạng thái P07/P08 theo progress ngày 29/10/2026; hướng dẫn song song cũ cần đọc theo quyết định Basic trước ML tại P00 | Điều phối | OPEN |

| F-20 | Trung bình | P03 | Danh mục public ở Gateway local chỉ có bản ghi kiểm thử P02/P03; cần dữ liệu du lịch thật và media có giấy phép. FE giữ tên gốc kèm nhãn dữ liệu kiểm thử (nhánh FE ghi là F-14, đánh số lại vì trùng ID) | N1 (Catalog) | OPEN |
| F-21 | Trung bình | P03 | Lighthouse preview production local: Performance 80, LCP 4,0 s (mục tiêu < 2,5 s) trên UI editorial (nhánh FE ghi là F-15, đánh số lại vì trùng ID) | N2 | OPEN |
| F-22 | Cao | P02/P03 | UI mới gọi sai contract: `POST /businesses` gửi `registration_number`, `contact_*`; `POST /me/trips` gửi `budget_estimate`, thiếu `timezone`, `currency`; `POST .../items` gửi `start_time`, thiếu `locked`, `recommendation_request_id`; import job gọi `.../jobs` với `run_mode`/`dry_run` thay vì `.../import-jobs` với `mode`. Form đổi mật khẩu, gửi xác minh, claim, duyệt KYC báo thành công nhưng không gọi API | N2 + N1 | OPEN |
| F-23 | Cao | P02/P03 | Khi API lỗi, UI mới tạo bản ghi giả (`mockBiz`, `mockCol`, `mockTrip`, `mockItem`, `mockDay`, `mockJob`) hoặc đảo trạng thái và vẫn báo thành công (doanh nghiệp, collection, trip, ngày, item, import, kiểm duyệt, favorite ở trang chi tiết). Người dùng tưởng đã lưu nhưng dữ liệu không có trên server | N2 | OPEN |
| F-24 | Thấp | P03 | Code FE cũ không còn dùng (`TravelApp.tsx`, `OperationalPanels.tsx`, `TripEditor.tsx`, `ScreenGuide.tsx`, `LiquidGlassNav.tsx`/`Icon.tsx` ở gốc `src`, `clay.css`, `travel.css`, `styles.css`, `tokens.css` ở gốc `src`); `browser-nonai.mjs`, `clay-ui-check.mjs` chưa khớp UI mới | N2 | OPEN |
| F-25 | Trung bình | P00/P01 | OpenAPI `POST /api/v1/interactions/batch` khai báo `security: []` nhưng `SecurityConfiguration` Intelligence yêu cầu `intelligence:write`; chưa thống nhất contract/provider security. Khảo sát tĩnh tại `89eb8cb`, chưa thay code/quyền | N2 + N1 review contract | OPEN |
| F-26 | Trung bình | P01/P03 (AI) | `BasicRepository.candidates` lấy 1.000 PUBLISHED theo UUID trước bộ lọc, có thể bỏ sót ứng viên hợp lệ; `persist` lấy `data_as_of` max trên candidate pool, chưa phản ánh freshness bảo thủ của kết quả thực dùng. Khảo sát tĩnh `BasicRepository.java:86,115` tại `89eb8cb`; cần regression >1.000 place và mixed freshness trong RC-G1-08/11, chưa có runtime evidence | N2 + N1 review | OPEN |

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
