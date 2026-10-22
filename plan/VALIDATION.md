# Kiểm tra bộ thiết kế ngày 08/10/2026

Đây là kiểm tra tĩnh của tài liệu và DDL tham khảo. Backend chưa được triển khai thành sáu service, SQL chưa được chạy trên PostgreSQL và chưa có benchmark hay test nghiệp vụ runtime.

## Phạm vi đã kiểm tra

- Đọc các bảng trong DOCX nguồn; đối chiếu đủ **42/42 bảng**, không thiếu tên bảng nguồn trong mapping.
- Có đủ **6 service** theo danh sách người dùng xác nhận. Lộ trình hiện hành gồm **P00–P04**, trong đó P01 có sáu gói phát triển/kiểm thử độc lập song song; checklist mã cũ P01–P10 giữ chức năng, task, contract, UI integration, tiêu chí nghiệm thu và rollback, được quy đổi trong [README phase](phases/README.md).
- Kiểm parser PostgreSQL (`pglast`) cho **6 file SQL, 187 statement**: không lỗi cú pháp.
- Kiểm **73 FK nội bộ**: bảng/cột đích tồn tại, số cột tương ứng và khóa đích là PK/UNIQUE; không có FK xuyên schema/service.
- **97 bảng đặc tả**: Identity 18, Catalog 28, Community 16, Trip 11, Intelligence 14, Ingestion 10. Mỗi service gồm 4 bảng kỹ thuật; tổng nghiệp vụ/read model là 73. Đây là thiết kế đầy đủ có mở rộng chuẩn hóa, không phải 97 bảng đã có dữ liệu.
- Kiểm các liên kết Markdown nội bộ và source-to-target mapping. Các đường dẫn `backend/services/...`, `contracts/...`, `PROGRESS.md` là đầu ra tương lai, không giả định đã tồn tại.
- Thay đổi của lượt làm việc nằm trong `plan/`; không sửa source backend, frontend hoặc tài liệu Word nguồn.

## Còn phải kiểm chứng khi triển khai

1. Chạy Flyway trên PostgreSQL/PostGIS thật đúng version đã chốt; parser không xác nhận extension, quyền, query plan hay application invariants.
2. Kiểm constraints với dữ liệu hợp lệ/không hợp lệ, concurrent updates và dataset nguồn thực; xác minh migration/cutover theo nhánh có monolith hay triển khai mới.
3. Hoàn thiện OpenAPI/JSON Schema, authorization, transaction/state machine, dispatch/replay và các test của từng phase.
4. Đo SLO/retention/RPO/RTO đã chốt; các con số trong kế hoạch là mục tiêu đề xuất, không phải kết quả đo.

Các bảng kỹ thuật và thiết kế mở rộng được nêu tại [quy ước database](03-database-conventions.md); các invariant liên hàng không giả định được bảo đảm chỉ bằng CHECK SQL.
