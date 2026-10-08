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
6. [Lộ trình các phase](phases/README.md).
7. [Kết quả kiểm tra và giới hạn của thiết kế](VALIDATION.md).

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

- **Bản chức năng cơ bản:** tài khoản; địa điểm và dịch vụ địa phương; tìm/lọc; recommendation theo luật; review/rating/favorite; lịch sử tương tác; trip; bản đồ/khoảng cách; admin. Hoàn thành P00–P07 và các tiêu chí tích hợp ở P09 trước phát hành P10.
- **Phần mở rộng đã có trong bảng nguồn:** collections, contribution, business claims/change requests, ingestion nhiều nguồn và vòng đời dataset/training/model. Có kế hoạch và database tương ứng; ML training/model activation hoàn thiện tại P08. Recommendation cơ bản không phụ thuộc việc huấn luyện ML.
- **Ngoài phạm vi tài liệu:** đặt phòng/đặt tour, thanh toán, tồn kho, tối ưu tuyến sâu, chatbot/RAG, mạng xã hội follow/chat. Không tự đưa các chức năng này thành yêu cầu bắt buộc. Dependency vector store hiện tại không đồng nghĩa sản phẩm cần RAG.

## Quyết định còn cần chốt khi bắt đầu P00

Quy mô nhóm, ngân sách hạ tầng, lưu lượng mục tiêu, provider bản đồ/email, chính sách lưu giữ dữ liệu và có database monolith thực tế hay không. Các ngưỡng SLO và retention trong tài liệu là mục tiêu đề xuất, chưa phải số đo thực nghiệm. Không gắn tiến độ với ngày lịch khi chưa có năng lực đội.

Các phiên bản Java/Spring hiện tại trong `backend/pom.xml` chỉ được ghi nhận là trạng thái repository. P01 phải xác minh compatibility BOM, artifact availability và phiên bản hỗ trợ trước khi khóa stack cho sáu service.
