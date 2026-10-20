# CI lỗi trong lịch sử PR: chẩn đoán và phòng ngừa — 16/10/2026

| Trường | Nội dung |
|---|---|
| Ngày | 16/10/2026 (ngày merge, theo Git log; bản gốc không ghi ngày) |
| PR / merge | PR #17, squash commit `9f4beca fix(ci): stabilize dead-letter tests and catalog port allocation (#17)` |
| Người merge | To Quang Truong |
| CI sau sửa | **Chưa ghi run ID** (finding F-09) |
| Tên file cũ | `progress/CI_HISTORICAL_FAILURE_FIXES.md`, chuyển và dịch ngày 20/10/2026 |

## Bằng chứng lỗi

- PR #10, run `38766417925`: test Identity `malformedDlqMetadataIsRetainedAndOperatorCredentialIsRestricted` kỳ vọng DLQ có 1 message ready, nhưng ngay sau requeue thấy 0.
- PR #12, run `38766514050`: Catalog `p01.py up` không bind được `127.0.0.1:56432` vì host port đã bị chiếm. Log còn lưu không cho biết process/container nào chiếm port.
- PR #12 còn lộ race trong assertion phân quyền bất đồng bộ của Trip. PR #16 đã sửa bằng cách chờ broker đóng channel với mã từ chối 403.

## Thay đổi khắc phục

- **Identity** (test): xác nhận publish, chờ message tới trước khi replay, assert đúng nguyên nhân gốc malformed-metadata, chờ nack requeue bất đồng bộ về trạng thái ready, rồi kiểm operator bị giới hạn vẫn nhận đúng payload gốc. Ngữ nghĩa replay production không đổi.
- **Catalog** (CI): yêu cầu Docker cấp port loopback ephemeral thay vì giả định 56432 còn trống. P01 smoke tự phát hiện port và truyền cho Java probe. Mặc định của developer và P02 giữ nguyên. Không dừng listener không liên quan, không xóa dữ liệu persistent.

## Kiểm chứng

- Ba regression Python về phát hiện port/mặc định/binding sai PASS ([backend/infra/test_p01_ports.py](../../backend/infra/test_p01_ports.py)).
- Bảy kiểm tra service layout PASS ([backend/platform/test_service_layout.py](../../backend/platform/test_service_layout.py)).
- Maven verify của Identity và full GitHub CI mới là điều kiện bắt buộc trước merge. PR đã merge ngày 16/10/2026, nhưng run ID chưa được ghi.
- Docker local không có lúc sửa; broker/database/image/integration thật được kiểm trong GitHub Actions, gồm đúng test Identity bị ảnh hưởng.

Các run fail trong lịch sử và badge của merge commit cũ được giữ làm evidence lịch sử. Bản sửa mới không viết lại các commit đó và không che giấu lỗi của chúng.
