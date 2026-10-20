# Bàn giao P01 lên GitHub — 14/10/2026

| Trường | Nội dung |
|---|---|
| Ngày ghi | 14/10/2026; cập nhật trạng thái merge ngày 20/10/2026 |
| Revision nền | `main` tại `cb44518` (sau PR #8) |
| Commit ghi nhận | `b9bc25e docs(progress): record sequential Phase01 GitHub delivery` |
| Người merge | To Quang Truong (theo Git log); merge **không** thay chữ ký reviewer READY_FOR_INTEGRATION |
| Tên file cũ | `progress/PHASE01_GITHUB_DELIVERY.md`, chuyển và dịch ngày 20/10/2026 |

Các nhóm P01 còn lại được push tuần tự lên các nhánh feature độc lập, mỗi nhánh tách từ `main` tại `cb44518` và target `main`. Không tự động merge. Phần auth/preferences/admin (PR #6, #7) và notification inbox (PR #8) đã merge trước đợt này.

Checkout làm việc gốc còn chứa thay đổi P02/P03 và được giữ nguyên. Các nhánh bàn giao **không** gồm live session exchange, orchestration đã kết nối, màn hình frontend nghiệp vụ và tooling P03. Fixture dùng chung được đưa vào từng nhánh service để mỗi nhánh build độc lập được.

| Nhóm | Nhánh | PR | Merge commit (15/10/2026) | Kiểm thử local | CI remote lúc bàn giao |
|---|---|---|---|---|---|
| Identity lifecycle | `feature/identity-phase01-lifecycle` | [#9](https://github.com/24521914-ux/SmartTravel_VN/pull/9) | `a9ab23a` | 60 tests; PostgreSQL/RabbitMQ; 0 failure/error/skip | 9/9 PASS |
| Catalog | `feature/catalog-phase01-business` | [#10](https://github.com/24521914-ux/SmartTravel_VN/pull/10) | `d799fa2` | 26 tests; PostGIS/RabbitMQ; 0 failure/error/skip | 9/9 PASS sau khi sửa smoke/readiness |
| Community | `feature/community-phase01-business` | [#11](https://github.com/24521914-ux/SmartTravel_VN/pull/11) | `0d46262` | 30 tests; MongoDB/RabbitMQ; 0 failure/error/skip | 9/9 PASS |
| Trip | `feature/trip-phase01-planning` | [#12](https://github.com/24521914-ux/SmartTravel_VN/pull/12) | `33b2627` | 40 tests; PostgreSQL/RabbitMQ; 0 failure/error/skip | 9/9 PASS sau khi retry Mongo baseline startup |
| Ingestion | `feature/ingestion-phase01-pipeline` | [#13](https://github.com/24521914-ux/SmartTravel_VN/pull/13) | `7e4f8ce` | 38 tests; PostgreSQL/RabbitMQ; 0 failure/error/skip | 9/9 PASS |
| Intelligence | `feature/intelligence-phase01-recommendations` | [#14](https://github.com/24521914-ux/SmartTravel_VN/pull/14) | `61f6c2e` | 35 tests; PostgreSQL/RabbitMQ; 0 failure/error/skip | **Chưa ghi** (lúc bàn giao ghi "xem PR checks") |
| Gateway + API/auth client | `feature/platform-phase01-gateway-client` | [#15](https://github.com/24521914-ux/SmartTravel_VN/pull/15) | `42eac23` | Gateway 12 tests, client 7 tests, build frontend và image Gateway PASS; npm audit 0 vulnerabilities | **Chưa ghi** (lúc bàn giao là draft PR) |

**Lưu ý về độ tin cậy:**

- Cột "CI remote" là snapshot lúc bàn giao. Kết quả CI cuối cùng trước merge của từng PR chưa được ghi run ID.
- Lần CI fail của PR #10 và #12 được giải thích ở [2026-10-16-ci-historical-failure-fixes.md](2026-10-16-ci-historical-failure-fixes.md).
- Số test ở bảng là số trên nhánh bàn giao. Lượt quét 20/10/2026 trên `main` đếm được nhiều hơn (Identity 61, Catalog 27, Trip 41, Intelligence 38) do PR #16/#17 thêm test.

**Phương pháp kiểm thử:**

- Identity chạy `test-local.py --transport --isolated-source` để tránh lỗi Maven launcher trên Windows khi đường dẫn tuyệt đối có ký tự Unicode.
- Các service khác dùng database và broker disposable do runner sở hữu.
- Credential, key sinh ra, evidence local và build artifact không được commit.

Tổng local: **229 tests** trên sáu nhánh service, 0 failure/error/skip trong full suite có dependency disposable. Gateway và frontend client thêm **19 tests**. Số liệu này áp dụng cho source bàn giao, không thay số liệu nghiệm thu lịch sử của checkout gốc.

**Các sửa đổi kèm theo, vẫn giữ nguyên guard cấu hình:**

- Storage smoke local chọn fixture profile tường minh.
- Runner Catalog chờ listener TCP cuối của PostgreSQL.
- Fixture Catalog validate tổng hợp của Community bổ sung trường `public` bắt buộc.
- CI dùng chung chọn runner của từng service và bắt buộc transport mode khi runner hỗ trợ.

Thứ tự merge khuyến nghị lúc bàn giao: merge từng PR service sau review, PR platform merge cuối. Thực tế ngày 15/10/2026 cả bảy PR đã merge theo thứ tự #9 → #15.

Đợt push này công bố source để review. Nó **không** thay đổi việc người dùng chấp nhận P01 trên checkout gốc ngày 11/10/2026, và không chứng nhận P02/P03.
