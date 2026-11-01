# Bản ghi hàng chờ báo cáo vi phạm

`GET /api/v1/admin/reports` giữ ba trường `request_id`, `status`, `version` của ACK để tương thích client hiện có. Các trường bổ sung tùy chọn trong candidate chưa freeze:

| Trường | Ý nghĩa |
|---|---|
| `review_id` | UUID đánh giá bị báo cáo |
| `reason` | Lý do người dùng gửi báo cáo |
| `report_status` | Trạng thái nghiệp vụ `OPEN`, `RESOLVED`, `DISMISSED` |
| `review_content` | Nội dung đánh giá hiện tại, khi đánh giá còn tồn tại |
| `place_id` | UUID địa điểm của đánh giá, khi đánh giá còn tồn tại |

`status=COMPLETED` vẫn là xác nhận đọc theo ACK cũ; giao diện dùng `report_status` để hiển thị trạng thái xử lý. Endpoint chỉ dành cho ADMIN và không trả `reporter_id`. Phần bổ sung không thay đổi body hoặc response của thao tác gửi báo cáo hay xét duyệt báo cáo. Contract được sinh từ `backend/platform/build_contracts.py`; trạng thái và bằng chứng kiểm thử xem [progress_be.md](../../progress_be.md).
