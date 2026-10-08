# P00 — Quyết định và thông tin cần chốt

## Database theo yêu cầu người dùng

Giữ sáu service, không tạo thêm service chỉ vì tên gọi khác nhau:

| Tên người dùng | Service trong repo | Database | Trạng thái |
|---|---|---|---|
| Tourism & Geo | Catalog | PostgreSQL + PostGIS | Đã xác nhận bắt buộc |
| Auth | Identity | PostgreSQL | Đã chốt theo phương án đề xuất |
| Trip | Trip | PostgreSQL | Đã chốt theo phương án đề xuất |
| UGC | Community | MongoDB | Đã xác nhận; phải thiết kế lại model/transaction/index và migration |
| AI & Recommendation | Intelligence | PostgreSQL + pgvector | Đã chốt: PostgreSQL lưu metadata, pgvector là index vector khi triển khai ML |
| Ingestion | Ingestion | PostgreSQL | Đã chốt cho job/checkpoint/outbox và JSONB raw metadata |
| Cache | Từng service | Redis riêng theo service | Đã xác nhận chỉ cache; không dùng Redis làm vector index/nguồn dữ liệu chuẩn |

Vector database là index phục vụ tìm kiếm ngữ nghĩa, không tự thay thế kho interaction, dataset, training job/model metadata. Basic recommendation phải hoạt động khi vector search không khả dụng. Chưa chốt embedding model, số chiều hoặc khoảng cách similarity; không tạo cột vector cố định trước khi có quyết định.

## MongoDB Community — yêu cầu chuyển thiết kế

`plan/database/community.md` và `plan/database/sql/community.sql` là baseline PostgreSQL cũ, không được chạy SQL đó cho Community mới.

- Chuyển entity thành document/collection, giữ external UUID và API/event độc lập storage.
- Thiết kế unique index, schema validation, version/concurrency, collection privacy và rating summary.
- MongoDB cần replica set để transaction review + rating + outbox/inbox atomic. Không giả định standalone hỗ trợ transaction.
- Không chuyển FK/CHECK/UNIQUE DEFERRABLE sang MongoDB một cách máy móc; invariant phải được bảo vệ bởi index/transaction/domain policy.
- MongoDB không tự bảo đảm throughput cao; cần load test P03.
- Quản lý phiên bản/index/backfill theo migration dành cho MongoDB, không dùng Flyway SQL.

## Nền tảng P00 đã triển khai kỹ thuật

- Máy hiện có Java 21 và Maven Wrapper 3.9.16. Backend gốc khai báo Java 25/Spring Boot 4.1.1/Spring AI 2.0.1; chưa xác minh compatibility của cấu hình gốc.
- Tạo một template riêng dùng Java 21/Spring Boot 3.5.13 để kiểm chứng, không sửa âm thầm backend gốc hoặc bắt sáu service dùng các dependency AI/JPA/Redis không cần thiết.
- Compose P00 đã có sáu DB domain, DB platform thử nghiệm và sáu Redis tách service. PostgreSQL/PostGIS cho Catalog, PostgreSQL cho Identity/Trip/Ingestion, PostgreSQL/pgvector cho Intelligence và MongoDB replica set cho Community đã được probe trên runtime thật.
- Docker Desktop đã khởi động; đã kiểm chứng sáu DB domain, PostGIS spatial query, pgvector cosine, MongoDB replica-set commit/rollback, sáu Redis cache và template Flyway/app startup. Evidence/lệnh tại `backend/platform/README.md`.
- Đã tạo sáu OpenAPI (183 operation), 23 event/command schema, fixtures/checksum và stubs/harness đầy đủ; agent technical review/schema/HTTP/policy tests PASS. Revision `1.0.0-candidate` còn cần N1/N2 phê duyệt/nhận gói và điều phối freeze, không tự ghi chữ ký con người.

## Phân công hai người

Người dùng xác nhận dùng N1/N2 để phân công, không cần tên/GitHub username để tiếp tục P00:

| Người | Service | Công việc kiêm nhiệm | Reviewer |
|---|---|---|---|
| N1 | Identity, Catalog, Ingestion | Platform/Maven/CI/Gateway; UI auth/search/business/admin ingestion | N2 |
| N2 | Community, Trip, Intelligence | Frontend shell; UI community/trip/recommendation/admin model; ML sau Basic | N1 |

N1 và N2 review chéo; không tự duyệt phần mình. N1 quản lý file chung, N2 review. Sáu service độc lập về kiến trúc nhưng hai người làm theo capacity, không yêu cầu sáu luồng code đồng thời. Ưu tiên Identity/Catalog và Community/Trip, rồi Ingestion/Intelligence Basic; không nối runtime thật trước gate P01.

## Phạm vi và thứ tự Basic → ML

- Có frontend; triển khai mới, không CDC/backfill monolith.
- Release cuối có ML nhưng **hoàn thiện và kiểm thử recommendation Basic trước khi bắt đầu implementation ML**.
- Trong P01, N2 hoàn thiện interaction/history/features/Basic, adapters và golden tests trước. Sau nghiệm thu Basic, tiếp tục dataset/training/model/vector search trong cùng gói Intelligence.
- Gate P01 cuối vẫn yêu cầu sáu service đạt READY_FOR_INTEGRATION và ML pipeline được kiểm chứng độc lập bằng fixture. Chất lượng ML trên dữ liệu thực kiểm ở P03; fixture không chứng minh chất lượng production.
- Không có yêu cầu phát hành Basic riêng ở thời điểm này. Nếu muốn phát hành Basic trước ML, cần chốt scope release riêng và cập nhật gate.
- Các hướng dẫn cũ yêu cầu Basic/ML cùng phát triển được thay bằng thứ tự trên. Không bỏ scope ML, không đánh dấu N/A các task ML.

## Phương án vận hành mặc định

Các giá trị dưới đây là baseline thiết kế, không phải số đo đạt được hoặc cam kết SLA nhà cung cấp. Cần load/restore test P03 để xác nhận.

- Frontend: React + TypeScript + Vite; N2 quản lý cấu hình chung, mỗi người làm màn thuộc service mình.
- Local/staging: Docker Compose; chưa cần Kubernetes. PostgreSQL 16/PostGIS 3.5, MongoDB 8 replica set, Redis 7.4 cache riêng và RabbitMQ làm broker. Production MongoDB cần replica set và auth/TLS, không dùng cấu hình dev hiện tại.
- Bản đồ: MapLibre GL JS để hiển thị, Geoapify cho tiles/routing qua adapter (kiểm quota/terms trước dùng thật). Email dev dùng Mailpit, production dùng Resend qua adapter. Không gửi token trong chat/commit.
- Ingestion ban đầu dùng fixture và dữ liệu được phép do owner cung cấp, không tự crawl nguồn chưa rõ license.
- AI: pgvector + cosine similarity; embedding thử nghiệm ưu tiên `intfloat/multilingual-e5-small` (384 chiều), version/model/license và chất lượng tiếng Việt phải kiểm chứng ở bước ML; chưa tạo migration vector cố định trong P00.
- Mục tiêu nghiệm thu ban đầu: 50 người dùng đồng thời, 20 request/giây; p95 API đọc <= 500 ms, API ghi <= 800 ms, recommendation Basic <= 1 giây; đo riêng thời gian provider ngoài.
- Availability mục tiêu 99,5%/tháng; RPO <= 24 giờ, RTO <= 4 giờ. Backup DB/object hằng ngày, giữ 14 ngày; diễn tập restore trước release. Production topology phải đủ đáp ứng mục tiêu, không coi một máy Compose dev là HA.
- Retention baseline: raw ingestion 30 ngày, interaction 90 ngày, log ứng dụng 14 ngày, audit 180 ngày. Deletion/consent/license revoke được ưu tiên hơn retention; cần rà soát yêu cầu pháp lý trước production.
- Bắt đầu dev/staging trên máy local; trước production N1 lập dự toán host/managed DB/storage/provider dựa trên báo giá hiện hành để người dùng duyệt. Không tự mua dịch vụ hoặc giả định ngân sách đã có.

## Thông tin/thao tác vẫn cần trước nghiệm thu

1. N1/N2 được dùng làm định danh owner/reviewer theo xác nhận người dùng; không yêu cầu GitHub username để chia việc.
2. Docker Desktop đã bật và runtime probes pass; không còn blocker Docker trong lượt này. N1/N2 vẫn cần review/xác nhận bàn giao trước khi đóng gate.
3. Khi kết nối provider: tự tạo credential và domain email; cấu hình qua secret/environment, không gửi secret cho agent trong chat.
4. Trước production: duyệt ngân sách, domain/host và nguồn dữ liệu có quyền sử dụng. N1 lập dự toán; N2 xác minh model/dataset/license.

Không cần người dùng chốt lại database/scope hoặc cung cấp GitHub username. Triển khai kỹ thuật P00 đã đủ contract candidate, fixture, thiết kế MongoDB và evidence sáu skeleton/runtime; còn bước review/nhận gói và freeze theo `backend/platform/P00_HANDOFF.md` để đóng gate chính thức.

## Nguồn kỹ thuật để đối chiếu khi triển khai

Không tuyên bố đã tra cứu trực tuyến trong lượt này; các liên kết dưới là tài liệu chính thức cần đối chiếu:

- PostgreSQL/PostGIS: https://postgis.net/documentation/
- MongoDB transaction: https://www.mongodb.com/docs/manual/core/transactions/
- pgvector: https://github.com/pgvector/pgvector
- Spring Boot: https://docs.spring.io/spring-boot/system-requirements.html

P00 chỉ được đóng khi hoàn thành checklist và có evidence thực tế, không đóng chỉ vì các đề xuất đã được ghi ra.
