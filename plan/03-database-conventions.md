# Quy ước database và chuẩn hóa

## Mục tiêu thiết kế

Chuẩn hóa dữ liệu giao dịch tới 3NF khi phù hợp: role và preference nhiều giá trị dùng bảng nối; category/tag/amenity dùng taxonomy; thông tin nguồn import tách khỏi place; schedule tách khỏi offering; media gắn bằng bảng quan hệ cụ thể. JSONB chỉ dành cho raw payload, snapshot, metadata provider, event, model config và bản diff; không dùng JSON thay quan hệ cần FK/unique/query thường xuyên.

Rating summary, feature projections, trip place snapshot, counters và cache là dữ liệu phi chuẩn hóa có chủ đích. Owner, version/as_of, cách rebuild và giới hạn sử dụng phải rõ. Không coi projection là nguồn gốc để ghi ngược dữ liệu.

## Quy ước kiểu dữ liệu

| Nội dung | Quy tắc |
|---|---|
| ID nghiệp vụ | UUID do ứng dụng sinh; giữ nguyên UUID của nguồn khi migrate; không phụ thuộc extension sinh ID |
| Log interaction lớn | bigint identity nội bộ + event_id UUID UNIQUE để dedup |
| Thời điểm | timestamptz lưu thời điểm tuyệt đối; hiển thị theo IANA timezone, mặc định Asia/Ho_Chi_Minh |
| Ngày du lịch | date; giờ mở cửa là time địa phương + day_of_week 0=Chủ nhật…6=Thứ bảy + end_day_offset |
| Tiền | numeric(14,2), currency char(3), không float; không cộng khác currency nếu chưa có chính sách chuyển đổi |
| Tọa độ | Catalog geography(Point,4326); boundary geometry(MultiPolygon,4326). Trip lưu lat/lon snapshot có CHECK |
| Text đa ngôn ngữ | name_vi bắt buộc, name_en nullable theo nguồn; mở rộng locales bằng translation table khi thật sự cần |
| Trạng thái | text/varchar + CHECK enum hữu hạn; state transition và quyền thực thi do application kiểm tra |
| Email | canonical lower(trim(email)); UNIQUE canonical; không tự xóa dấu chấm hoặc plus-address của provider |
| Concurrency | version bigint tăng mỗi mutation aggregate; API yêu cầu If-Match/version, trả 409 khi cũ |
| Updated_at | application đặt trong cùng transaction, DEFAULT chỉ xử lý INSERT; không giả định tự cập nhật |

Tất cả cột ngoài `NOT NULL`/PK đều có thể NULL; từng thiết kế giải thích ý nghĩa. UUID tham chiếu service khác không có `REFERENCES`. FK nội bộ dùng RESTRICT mặc định cho dữ liệu chính, CASCADE cho bảng con của aggregate khi purge. Không hard-delete user/place đang được lịch sử nghiệp vụ tham chiếu.

## Bốn bảng kỹ thuật ở mỗi database

Các DDL service được bổ sung cùng cấu trúc dưới schema riêng của service:

| Bảng | Cột chính | Ràng buộc và mục đích |
|---|---|---|
| outbox_events | event_id UUID PK; aggregate_type/id; aggregate_version; event_type; schema_version; payload JSONB; occurred_at; published_at; attempts; available_at | Ghi cùng transaction domain. Worker SKIP LOCKED, retry bounded + DLQ; index pending(available_at,occurred_at) WHERE published_at IS NULL |
| inbox_events | consumer_name, event_id PK kép; processed_at | Dedup và update projection cùng transaction. Retain đủ replay window, không xóa sớm hơn outbox/broker/recovery window |
| audit_logs | audit_id UUID PK; actor_id UUID nullable; actor_type; entity_type/id; action; old_value/new_value JSONB nullable; correlation_id; created_at | Chỉ allowlist trường; không lưu password_hash/token/secret/raw PII. Append-only qua quyền DB; archive theo retention |
| idempotency_records | scope, actor_key, idempotency_key PK kép ba cột; request_hash; response_status/body; created_at; expires_at | Key khác payload → 409; cùng payload → trả lại kết quả; lưu cùng transaction domain để tránh hai write đồng thời. actor_key lấy từ principal đã xác thực |

Idempotency HTTP không thay thế inbox event. Outbox không bảo đảm exactly-once; thiết kế consumer chịu được delivery lặp và đảo thứ tự. Published outbox giữ ít nhất 30 ngày, inbox ít nhất 35 ngày là giá trị đề xuất; replay ngoài window phải reset/rebuild projection có kiểm soát. HTTP idempotency 24 giờ; import command giữ dedup lâu hơn vòng đời import trong bảng import_items và inbox Catalog.

Không cache response chứa access/refresh token, password-reset token hoặc secret trong idempotency_records. Auth/token endpoint dùng transaction và single-use token policy riêng; response_body của endpoint nghiệp vụ phải được allowlist và có giới hạn dung lượng.

## Các ràng buộc không thể giao hết cho CHECK

CHECK chỉ kiểm tra dữ liệu trong hàng hiện tại. Parent-child date range, cycle geo/category, quyền owner/business, tổng số người/chi phí qua nhiều hàng, place còn public và model đủ điều kiện activate cần transaction/service policy hoặc constraint trigger được bổ sung trong migration triển khai. Với thứ tự itinerary và ngày, dùng UNIQUE DEFERRABLE để reorder trong transaction. [PostgreSQL Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html) mô tả giới hạn CHECK.

Purge, update scope và kiểm tra ràng buộc liên hàng phải giữ parent lock (`SELECT ... FOR UPDATE`) hoặc optimistic version; không dùng quy trình check-then-write ngoài transaction. DDL ở đây là baseline cấu trúc, không thay thế authorization/state machine/application validation.

## Index và vận hành

- Index FK thường dùng để join/delete con; index keyset pagination `(created_at,id)`; index filter theo query thực tế. PK/UNIQUE đã tạo index, không tạo bản sao.
- Catalog dùng GiST location và GIN search vector. Search tiếng Việt giai đoạn đầu dùng nội dung chuẩn hóa dấu tại application, cấu hình text search `simple`; kiểm thử bộ tên có/không dấu, alias và tên cũ. Không khẳng định search ranking hoàn chỉnh chỉ từ index.
- Interactions chưa partition trong baseline để giữ UNIQUE event_id toàn bảng. Khi partition theo thời gian, phải thiết kế lại dedup và PK có partition key; không đơn thuần thêm PARTITION BY. [PostgreSQL Partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html).
- Migration riêng từng service, không `db:push` production. Expand → backfill → chuyển reader/writer → contract. Role runtime không có quyền DDL hay đọc database service khác.
- Backup riêng từng DB + object storage; kiểm thử restore theo checkpoint/event watermark để rebuild projection nhất quán. Mục tiêu RPO/RTO được chốt P00, diễn tập P09/P10.

## Quyền riêng tư và retention đề xuất

Chính sách sau là đề xuất sản phẩm cần phê duyệt ở P00: session đến hết hạn + 30 ngày; action token hết hạn + 7 ngày; interaction thô 90 ngày; recommendation log 30 ngày; raw import theo license/nguồn tối đa mặc định 90 ngày; notification 90 ngày; audit 180 ngày. Không tự coi đây là thời hạn pháp luật yêu cầu.

Identity sở hữu personalization_enabled và consent_version. Intelligence chỉ dùng profile và history của user cho personalization khi consent hiện tại cho phép; opt-out phát event, xóa feature cá nhân và ngăn vào dataset mới. Xóa tài khoản dùng workflow có deletion_request_id, ack từ sáu service và theo dõi hoàn tất; audit giữ định danh pseudonym nếu chính sách cho phép. Dataset/model lineage phải hỗ trợ xác định artifact bị ảnh hưởng; xử lý artifact đang train/active theo policy xóa đã chốt, không chỉ xóa bảng users.

DDL không có seed password, secret, credential, danh sách user mẫu hoặc kết nối database thật. PostGIS cần được DBA/platform provision trước migration Catalog. Các file schema dùng CREATE TABLE thuần để review; Flyway sẽ quản lý thứ tự và checksum khi triển khai.
