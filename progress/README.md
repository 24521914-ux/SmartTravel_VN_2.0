# Folder progress

Cập nhật lần cuối: **23/10/2026** · Revision: `544dd08` (nhánh `feature/frontend-floria-v4-refinement`) · Người cập nhật: Truong102006.

Nơi ghi **trạng thái thực tế** của dự án. Kế hoạch và tiêu chí nằm trong `plan/`; checklist trong `plan/` là yêu cầu, không phải bằng chứng. Quy tắc ghi bắt buộc: [AGENTS.md mục 10](../AGENTS.md#10-quy-tắc-ghi-progress).

| File | Vai trò | Ai cập nhật |
|---|---|---|
| [PHASE_TASK_CHECKLIST.md](PHASE_TASK_CHECKLIST.md) | **Nguồn trạng thái chính**: bảng tổng quan, từng task P00–P04, gate, findings đang mở | Owner service cập nhật task của mình; điều phối cập nhật bảng tổng quan, gate, findings |
| [COMPLETED_WORK_CHECKLIST.md](COMPLETED_WORK_CHECKLIST.md) | Tóm tắt artifact/chức năng đã làm theo mốc thời gian, mới nhất ở trên | Người làm PR thêm mục khi merge |
| `evidence/YYYY-MM-DD-<scope>-<topic>.md` | Nhật ký evidence chi tiết: lệnh, kết quả, môi trường, revision, CI run, giới hạn | Người chạy kiểm thử hoặc bàn giao |

## Evidence hiện có

- [Frontend visual refinement V4 (Floria Art Direction) — 22/10/2026](evidence/2026-10-22-frontend-floria-v4-refinement.md): Header transparent-to-floating glass, typography Playfair italic + Be Vietnam Pro, bố cục editorial bất đối xứng, thu gọn empty state, 8 contract tests và 32 editorial UI checks PASS; P03-07 giữ PARTIAL.

- [Frontend cinematic V3 — 22/10/2026](evidence/2026-10-22-frontend-cinematic-v3.md): A/B/C, build, 8 contract tests, 22 cinematic checks và 32 regression checks; P03-07 giữ PARTIAL.

- [Navbar và landing travel editorial — 22/10/2026](evidence/2026-10-22-frontend-travel-editorial.md): Taste Skill, API search/cursor, ảnh có giấy phép, 8 contract tests, 32 kiểm tra giao diện, Lighthouse và giới hạn F-14/F-15; P03-07 vẫn PARTIAL.

| Ngày | File | Nội dung |
|---|---|---|
| 10/10/2026 | [2026-10-10-p01-m1-identity-community-history.md](evidence/2026-10-10-p01-m1-identity-community-history.md) | Lịch sử P01 M1, Identity auth/preferences, sửa CI PR #6, refactor layout, Community EOL (chuyển nguyên văn) |
| 14/10/2026 | [2026-10-14-p01-github-delivery.md](evidence/2026-10-14-p01-github-delivery.md) | Bàn giao P01 qua PR #9–#15 |
| 15/10/2026 | [2026-10-15-p02-github-delivery.md](evidence/2026-10-15-p02-github-delivery.md) | Bàn giao P02 qua PR #16 |
| 16/10/2026 | [2026-10-16-ci-historical-failure-fixes.md](evidence/2026-10-16-ci-historical-failure-fixes.md) | CI fail lịch sử PR #10/#12 và sửa ở PR #17 |
| 20/10/2026 | [2026-10-20-source-scan.md](evidence/2026-10-20-source-scan.md) | Quét source đối chiếu tiến độ, findings F-01…F-11 |

Evidence runtime do runner sinh ra (`smoke-report.json`, `manifest.json`, `.local/`, …) bị Git ignore. Muốn dùng làm bằng chứng thì phải chép **kết quả đã lọc secret** (lệnh, số test, PASS/FAIL, revision) vào file evidence ở đây.

- [Lịch sử checklist local — 20/10/2026](evidence/2026-10-20-local-checklist-history.md): giữ nguyên nguồn, chưa xác nhận tuyên bố nghiệm thu.

- [Giao code P03 qua GitHub — 20/10/2026](evidence/2026-10-20-phase03-github-delivery.md): tổng hợp lỗi mã hóa, thay thế bởi evidence21/10.

- [Giao code và xử lý CI — 21/10/2026](evidence/2026-10-21-github-delivery-ci.md): revision, số test/skip, lịch sử lỗi và giới hạn artifact; thay thế phần tổng hợp lỗi mã hóa ngày20/10.
- [Lịch sử nội dung P03 local — 21/10/2026](evidence/2026-10-21-plan-p03-history.md): bảo toàn nguyên văn khi trả plan về yêu cầu và trạng thái PARTIAL.

- [Thiết kế lại frontend claymorphism — 22/10/2026](evidence/2026-10-22-frontend-clay-redesign.md): giao diện các màn, kiểm tra giả lập và giới hạn P03-07.
