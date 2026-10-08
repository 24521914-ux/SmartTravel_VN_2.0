# Kế hoạch SmartTravel VN với 6 microservice

Ngày lập: 08/10/2026. Trạng thái: thiết kế để triển khai, chưa áp dụng vào database hay thay đổi backend.

Phạm vi được chốt gồm **Identity, Catalog, Community, Trip, Intelligence và Ingestion Service**. Ingestion là service thứ sáu do người dùng xác nhận. API Gateway, message broker, object storage và hệ thống observability là hạ tầng hỗ trợ, không tính thêm vào sáu service nghiệp vụ.

Nguồn nghiệp vụ: `C:\Users\FPT SHOP\Downloads\Chức năng + Database.docx`, gồm 11 nhóm chức năng và 42 bảng. Nội dung tài liệu được dùng làm đầu vào yêu cầu; thiết kế bổ sung được ghi rõ trong bộ kế hoạch. Backend hiện tại chỉ có `DemoApplication`, cấu hình tên ứng dụng và khai báo dependency. Chưa thấy entity, API nghiệp vụ, migration hoặc dữ liệu monolith để thực hiện chuyển đổi vật lý.

## Đọc theo thứ tự

1. [Kiến trúc và quyền sở hữu dữ liệu](01-architecture.md).
2. [Ánh xạ 42 bảng và 11 nhóm chức năng](02-source-mapping.md).
3. [Quy ước database và ràng buộc chung](03-database-conventions.md).
4. [Hợp đồng API, event và xử lý nhất quán](04-api-events.md).
5. [Chuyển đổi dữ liệu và cutover](05-migration-cutover.md).
6. [Lộ trình và hướng dẫn hoàn thành từng phase](phases/README.md).
7. [Phân công nhiều người, review và bàn giao](06-work-assignment.md).
8. [Kết quả kiểm tra và giới hạn của thiết kế](VALIDATION.md).

## Hướng dẫn triển khai theo phase

Sau chuẩn bị chung, sáu nhóm **Identity, Catalog, Community, Trip, Ingestion, Intelligence** cùng phát triển và kiểm thử trên môi trường riêng. Mỗi nhóm có thể chia chức năng cho nhiều người theo [bảng phân công](06-work-assignment.md). Chỉ khi cả sáu service đạt kiểm thử độc lập mới kết nối runtime với nhau; sau kết nối vẫn phải kiểm thử toàn hệ thống trước phát hành.

| Phase và hướng dẫn | Cách thực hiện | Điều kiện hoàn thành | Chú thích |
|---|---|---|---|
| [P00 Chuẩn bị](phases/README.md#p00-guide) | Các owner cùng chốt scope/contract/fixture; platform dựng template local/CI | Sáu nhóm có đầu vào cùng revision, DB riêng và hướng dẫn chạy độc lập | Chốt tên người, reviewer và file ownership trước khi nhận task |
| [P01 Phát triển song song và kiểm thử](phases/README.md#p01-guide) | Chia chức năng trong từng service; triển khai API/DB/adapter và kiểm thử ngay trong nhóm | 6/6 service đạt `READY_FOR_INTEGRATION`, có manifest và test report | Đối tác dùng stub; domain code và DB service phải chạy thật |
| [P02 Kết nối](phases/README.md#p02-guide) | Các cặp owner nối HTTP/events/Gateway; chạy lại các luồng với đối tác thật | Các luồng bắt buộc đạt, không còn stub giữa sáu service; trạng thái `CONNECTED` | Liên kết độc lập có thể làm song song sau khi auth/hạ tầng sẵn sàng |
| [P03 Kiểm thử hệ thống](phases/README.md#p03-guide) | Chia nhóm kiểm E2E/UI, security, lỗi phụ thuộc, tải/restore và ML quality | Release candidate có evidence đạt scope, SLO/RPO/RTO và trạng thái `SYSTEM_VERIFIED` | Load/outage/restore cần dữ liệu hoặc môi trường riêng để tránh ảnh hưởng nhau |
| [P04 Phát hành](phases/README.md#p04-guide) | Chuẩn bị deployment/migration theo domain; diễn tập, triển khai, smoke và bàn giao | Release/cutover evidence, rollback, người vận hành; trạng thái `RELEASED` | Chọn nhánh triển khai mới hoặc chuyển dữ liệu monolith thực |

**Cách dùng:** mở hướng dẫn phase ở bảng trên, nhận task trong file chi tiết, ghi người thực hiện/reviewer và bằng chứng vào progress khi bắt đầu triển khai. Chỉ đánh dấu hoàn thành khi đạt gate của phase. Các mã P01–P10 trong tài liệu cũ được [quy đổi sang lộ trình hiện hành](phases/README.md#legacy-codes), giữ nguyên phạm vi nghiệp vụ.

**Chú thích:** `gate` là điều kiện chuyển phase; `contract` là thỏa thuận API/event; `stub` mô phỏng service đối tác; `fixture` là dữ liệu kiểm thử đã chốt; `manifest` ghi revision, kết quả kiểm thử và cấu hình bàn giao. M1–M4 là mốc nội bộ từng nhóm, các nhóm tiến hành độc lập theo dependency của mình.

## Thiết kế database

Mỗi service có database và tài khoản riêng. Tên schema trong SQL biểu thị namespace nội bộ; sáu file được áp dụng vào **sáu database khác nhau**, không phải gom thành một database dùng chung. File SQL là đặc tả DDL tham khảo cho Flyway sau này, chưa được thực thi. Các bảng hạ tầng chung được mô tả tại [quy ước database](03-database-conventions.md).

| Service | Thiết kế chi tiết | DDL |
|---|---|---|
| Identity | [Identity](database/identity.md) | [identity.sql](database/sql/identity.sql) |
| Catalog | [Catalog](database/catalog.md) | [catalog.sql](database/sql/catalog.sql) |
| Community | [Community](database/community.md) | [community.sql](database/sql/community.sql) |
| Trip | [Trip](database/trip.md) | [trip.sql](database/sql/trip.sql) |
| Intelligence | [Intelligence](database/intelligence.md) | [intelligence.sql](database/sql/intelligence.sql) |
| Ingestion | [Ingestion](database/ingestion.md) | [ingestion.sql](database/sql/ingestion.sql) |

## Phạm vi phát hành

- **Bản chức năng cơ bản:** tài khoản; địa điểm và dịch vụ địa phương; tìm/lọc; recommendation theo luật; review/rating/favorite; lịch sử tương tác; trip; bản đồ/khoảng cách; admin. Sau P00, sáu nhóm service hoàn thiện và kiểm thử chức năng độc lập song song; chỉ khi qua gate mới kết nối tại P02, kiểm thử hệ thống tại P03 và phát hành tại P04. Chi tiết trong [lộ trình](phases/README.md).
- **Phần mở rộng đã có trong bảng nguồn:** collections, contribution, business claims/change requests, ingestion nhiều nguồn và vòng đời dataset/training/model. Có kế hoạch và database tương ứng; pipeline ML được phát triển/kiểm thử độc lập song song trong gói P01-IN (checklist chi tiết P08), còn chất lượng model trên dữ liệu thực được kiểm nhận ở P03. Recommendation cơ bản không phụ thuộc việc huấn luyện ML.
- **Ngoài phạm vi tài liệu:** đặt phòng/đặt tour, thanh toán, tồn kho, tối ưu tuyến sâu, chatbot/RAG, mạng xã hội follow/chat. Không tự đưa các chức năng này thành yêu cầu bắt buộc. Dependency vector store hiện tại không đồng nghĩa sản phẩm cần RAG.

## Quyết định còn cần chốt khi bắt đầu P00

Quy mô nhóm, ngân sách hạ tầng, lưu lượng mục tiêu, provider bản đồ/email, chính sách lưu giữ dữ liệu và có database monolith thực tế hay không. Các ngưỡng SLO và retention trong tài liệu là mục tiêu đề xuất, chưa phải số đo thực nghiệm. Không gắn tiến độ với ngày lịch khi chưa có năng lực đội.

Các phiên bản Java/Spring hiện tại trong `backend/pom.xml` chỉ được ghi nhận là trạng thái repository. P00 xác minh compatibility BOM, artifact availability và phiên bản hỗ trợ để bàn giao template chung cho sáu nhóm triển khai P01.
