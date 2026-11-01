# Giá dịch vụ chưa biết

Response dịch vụ Catalog cho phép `price: null` khi chưa có giá. `0` biểu thị miễn phí; frontend không chuyển `null` thành `0`. Database và API đã có thể trả giá chưa biết khi tạo dịch vụ không truyền giá.

Candidate response schema được sửa để phản ánh giá trị lưu trữ thật, bao gồm danh sách public/admin, chi tiết và response ghi. Request giữ nguyên: nếu truyền `price`, giá phải là số không âm; PATCH không nhận `null` để xóa giá.

Không thay phiên bản freeze hoặc xác nhận bàn giao. Trạng thái và bằng chứng xem [progress_be.md](../../progress_be.md).
