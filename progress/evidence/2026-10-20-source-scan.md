# Quét source đối chiếu tiến độ — 20/10/2026

| Trường | Nội dung |
|---|---|
| Ngày | 20/10/2026 (Asia/Ho_Chi_Minh) |
| Người thực hiện | Coding agent (Claude Code) theo yêu cầu người dùng; **không phải review của N1/N2** |
| Revision | `main` = `9f4beca` (sau PR #17), checkout sạch trên nhánh `docs/progress-source-sync` |
| Môi trường | Windows 11, Java 25.0.4 (project yêu cầu Java 21), Node 24.15.0; **không có Docker, không có Python** |
| Phạm vi | Toàn bộ `backend/services/*`, `backend/platform/api-gateway`, `backend/contracts`, `backend/infra`, `frontend`, `.github/workflows`, lịch sử Git PR #1–#17 |

## 1. Lệnh đã chạy và kết quả

| Lệnh | Kết quả | Ghi chú |
|---|---|---|
| `backend/mvnw.cmd -B -f backend/services/pom.xml verify` | **BUILD SUCCESS**, reactor 6/6 | 235 tests: 0 failure/error, **165 skipped** (suite DB/broker cần Docker + `DOMAIN_DB_TESTS`/`IDENTITY_DB_TESTS`). Chỉ 70 test unit/security/HTTP thực sự chạy. **Không** coi đây là DB/broker PASS. |
| `backend/mvnw.cmd -B -f backend/platform/api-gateway/pom.xml verify` | **BUILD SUCCESS** | 14 tests, 0 failure/error/skip |
| `npm ci` → `npm audit` → `npm run test:contracts` → `npm run build` (thư mục `frontend/`) | Tất cả exit 0 | audit **0 vulnerabilities**; contract tests **7/7 PASS**; build Vite thành công |
| Kiểm checksum `backend/contracts/checksums.json` bằng Node (SHA-256 sau chuẩn hóa CRLF→LF, cùng thuật toán `validate_contracts.py`) | **66/66 khớp** | Chưa chạy được validator đầy đủ (jsonschema/openapi-spec-validator) vì không có Python |
| Đếm OpenAPI/registry | **183 operations**, **23 messages**, revision `1.0.0-candidate` | Identity 25, Catalog 66, Community 32, Trip 29, Ingestion 17, Intelligence 14 |

Số test mỗi service theo Maven (`Tests run` / `Skipped`): Identity 61/41, Catalog 27/20, Community 30/16, Trip 41/31, Ingestion 38/29, Intelligence 38/28.

Không chạy được tại lượt này: `test-local.py`/`check-local.py` từng service, `p01.py`, `p02.py smoke`, `p02_faults.py`, `p02_privacy_test.py`, `p02_transport_test.py`, `p02_import_ack_test.py`, browser smoke, build image. Evidence của các lệnh này là evidence lịch sử, được ghi ở checklist kèm ngày và nguồn.

## 2. Đối chiếu API với contract

Quét `@*Mapping` trong controller và so với `paths` của OpenAPI:

- **183/183 operation có controller thật**. Catalog gom taxonomy vào `TaxonomyController` (`/api/v1/admin/{kind}`) và route public/validate vào `CatalogController` dùng nhiều path trên một mapping.
- **9 endpoint ngoài contract candidate**, được P02_README mô tả là "private additions":
  - Identity: `POST /internal/v1/security/exchange`, `POST /internal/v1/security/session`, `GET /internal/v1/users/preferences/snapshot`.
  - Catalog: `GET /internal/v1/places/features-snapshot`, `POST /api/v1/admin/media`, `GET /api/v1/media/{id}`.
  - Trip: `GET /internal/v1/interactions/snapshot`.
  - Intelligence: `POST /internal/v1/features/rebuild`, `POST /internal/v1/events`.

  Hai endpoint media Catalog không phải `/internal`. Xem finding F-02.

## 3. Đối chiếu event/command với registry

So `backend/contracts/registry.json` với chuỗi event type trong source và binding transport của từng service:

| Service | Message phải consume theo registry | Thiếu binding/handler |
|---|---|---|
| Identity | 8 | **3**: `catalog.contribution.applied.v1`, `catalog.contribution.rejected.v1`, `intelligence.model.deployed.v1` |
| Catalog | 6 | 0 |
| Community | 6 | 0 |
| Trip | 5 | 0 |
| Ingestion | 4 | 0 |
| Intelligence | 12 | 0 |

Tất cả producer đã phát đúng message của mình. `domain.user-data-deleted.v1` được phát ở cả 5 service đối tác.

Chi tiết Identity: queue `identity.inbox` chỉ bind 5 routing key ([IdentityTransportConfiguration.java](../../backend/services/identity-service/src/main/java/vn/smarttravel/identity/infrastructure/transport/config/IdentityTransportConfiguration.java)), và listener `default ->` reject. Trong P02, `p02.py` tạo binding exchange `catalog.events`/`intelligence.events` → `identity.inbound` cho cả 3 message, nhưng không có queue nhận nên message bị bỏ ở `identity.inbound`. Producer vẫn coi là routed vì `platform.audit` bind `#`. Xem finding F-01.

## 4. Kiểm source khác

- Không có `TODO`/`FIXME`/`NotImplemented` nghiệp vụ trong `src/main`. Các `UnsupportedOperationException` duy nhất là `setReadListener` của `RequestSizeFilter`, chủ ý cho endpoint JSON đồng bộ.
- Migrations:
  - Identity V1–V7, Catalog V1–V8, Trip V1–V7, Ingestion V1–V8, Intelligence V1–V10.
  - Community Mongo V1–V3.
  - Catalog V2 có 28 bảng (24 domain + 4 kỹ thuật). Intelligence V2 có 14 bảng (5 baseline + 5 ML + 4 kỹ thuật).
- Catalog search: bỏ dấu tiếng Việt bằng `Normalizer` NFD + `tsvector('simple')` + alias `LIKE '%q%'`; GiST cho location. Alias `LIKE` có wildcard đầu, không có index trigram. Xem F-04.
- Seed Catalog V4 có category `attraction/restaurant/hotel/museum`; **không có `homestay`**. Xem F-03.
- P02 local: media/model artifact lưu trên Docker volume filesystem, chưa có object storage. Observability gồm correlation ID + `monitor.json`/`dashboard.html`, chưa có distributed tracing. Xem F-06.
- [Ingestion README](../../backend/services/ingestion-service/README.md) ghi "all18 operations", trong khi contract và controller đều có 17. Cần owner sửa README.
- File `plan/phases/P01-services/*.md` ghi "Reviewer: A–F" (mã gói), trong khi [phân công](../../plan/06-work-assignment.md) dùng N1/N2. Progress dùng N1/N2.
- CI: `p00-template.yml` (verify, frontend), `p01-services.yml` (service matrix, contracts, platform), `p02-integration.yml` (connected).
- Lịch sử merge: PR #1–#17 đều do `To Quang Truong` merge. Commit message không chứa CI run ID. Repo private và máy không có `gh`, nên **chưa xác minh được kết quả CI remote của PR #14–#17 từ máy này**.

## 5. Findings

| ID | Mức | Mô tả | Owner đề xuất | Việc cần làm |
|---|---|---|---|---|
| F-01 | Cao | Identity không consume 3 message mà registry khai báo; message bị bỏ âm thầm trong P02 | N1 (Identity) + N2 (Intelligence) | Quyết định: thêm handler/notification + binding, hoặc sửa registry qua contract revision. Thêm test monitor phát hiện message không có queue nhận. |
| F-02 | Trung bình | 9 endpoint ngoài contract `1.0.0-candidate`, trong đó 2 endpoint media Catalog là public/admin | N1 (Catalog/Identity), N2 (Trip/Intelligence) | Đưa vào contract revision tiếp theo hoặc ghi rõ phạm vi private; cập nhật checksums sau review |
| F-03 | Thấp | Seed không có category `homestay` dù P01-CA-06 nêu restaurant/hotel/homestay | N1 (Catalog) | Thêm seed qua migration mới (không sửa V4) hoặc ghi rõ tạo qua admin taxonomy API |
| F-04 | Thấp (P03) | Alias search `LIKE '%q%'` không dùng được index | N1 (Catalog) | Đo EXPLAIN/load ở P03-05; cân nhắc `pg_trgm` |
| F-05 | Trung bình | Gate P00 (N1/N2 ký, freeze contract) chưa đóng, trong khi P01/P02 đã merge vào `main` | Điều phối | N1/N2 ký và freeze revision, hoặc ghi quyết định chấp nhận rủi ro |
| F-06 | Trung bình | P02-01 thiếu object storage và distributed tracing | N1 (platform) | Bổ sung hoặc ghi N/A kèm quyết định scope |
| F-07 | Trung bình | P02-14 chưa có test tương thích schema old/new (mới có reject schema không hỗ trợ trong từng service) | Owner producer/consumer | Thêm test khi có revision contract thứ hai |
| F-08 | Thấp | `plan/README.md`, `plan/06-work-assignment.md`, `plan/phases/*.md` ghi trạng thái lỗi thời (NOT_STARTED/IN_PROGRESS M1/Chưa triển khai) | Điều phối | Đã cập nhật dòng trạng thái trong lượt này |
| F-09 | Trung bình | Không có link CI run cho PR #14–#17 trong progress | Người merge | Bổ sung run ID/link vào evidence tương ứng |
| F-10 | Thấp | PR #3 (frontend landing) và #4 (cloud DB Neon/MongoDB Atlas) chưa được ghi trong progress | Người làm PR | Đã bổ sung mục trong COMPLETED_WORK_CHECKLIST; cần owner xác nhận evidence |
| F-11 | Thông tin | Môi trường scan dùng Java 25 thay vì 21 và không có Docker/Python | — | Chạy lại đầy đủ trên Java 21 + Docker trước khi ký gate |
