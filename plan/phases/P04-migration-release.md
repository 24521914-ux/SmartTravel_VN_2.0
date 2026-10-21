# P04 Migration cutover và phát hành

Trạng thái: **NOT_STARTED**, bị chặn bởi P03 **IN_PROGRESS / NO_GO**; chưa có SYSTEM_VERIFIED. Dependency: P03; nếu DB monolith thật tồn tại, hoàn tất M01–M04 trong [migration-cutover](../05-migration-cutover.md).

## Công việc

- [ ] P04-01: Chọn nhánh A triển khai mới hoặc B chuyển dữ liệu; không dựng CDC cho nguồn chưa tồn tại.
- [ ] P04-02: Nhánh B backfill 42 mapping, UUID/role/owner conversions, quarantine/checksum/object migration; delta có một writer, không dual-write độc lập.
- [ ] P04-03: Rehearsal staging đo lag/time/restore, chốt go/no-go và người phụ trách từng service.
- [ ] P04-04: Freeze writer cũ theo domain, drain delta, xác minh watermark, bật writer mới và route traffic. Canary write phải pin ownership theo aggregate/user.
- [ ] P04-05: Lỗi sau có write mới thì reverse-sync hoặc forward-fix theo runbook; không chỉ quay route về DB cũ.
- [ ] P04-06: Theo dõi stability window, DLQ/quarantine, revoke credential cũ khi decommission; archive audit/error logs trước gỡ nguồn.
- [ ] P04-07: Bàn giao thực tế triển khai, cost/metrics/backup schedule, access và backlog; cập nhật progress bằng evidence.

## Database API và UI

Migrate qua Flyway từng service, không chạy trực tiếp file SQL đặc tả trên production. Migration tooling/ID map/checkpoint có quyền riêng và không chứa dump/PII trong Git. Giữ compatibility endpoint để frontend chuyển; feature flag đã test, session và notification hoạt động qua cutover. Giữ replay window/consumer watermark cùng checkpoint.

## Kiểm nhận

- [ ] 100% dữ liệu trong scope được đối chiếu tại cùng checkpoint hoặc quarantine có cách giải quyết được duyệt; không âm thầm bỏ record.
- [ ] Post-deploy smoke user/admin/business/recommendation/trip/map pass; queue lag/error/p95 trong giới hạn đã chốt.
- [ ] Đã diễn tập rollback bao gồm write mới sau switch; không còn hai writer/domain.
- [ ] Nhánh A: sáu service chạy core flows và operational gates. Nhánh B: thêm bằng chứng không mất dữ liệu/mapping.
- [ ] Không còn caller/job dùng schema monolith đã đóng; backup/archive/audit còn truy được.

Đầu ra: release/cutover log, checkpoint/reconciliation evidence, deployment versions và runbooks. Rollback tuân M06; không DROP dữ liệu hoặc xóa bản backup để giải phóng dung lượng trong ngày đầu.

## Release checkpoint — 11 October 2026

P00 chọn **nhánh A: triển khai mới**. Nhánh B/CDC/backfill monolith là **N/A** do không có nguồn monolith trong release scope; đây là quyết định phạm vi, không phải evidence migration PASS. P04-01 giữ chưa hoàn thành vì rehearsal/deployment decision thuộc P04 chưa diễn ra. Không cutover, production deploy, stability-window acceptance hoặc bàn giao RELEASED khi P03 chưa qua gate.

Local storage restore nếu PASS chỉ chứng minh checkpoint trong môi trường cô lập; không thay thế application recovery/projection watermark, production RPO/RTO hoặc rollback có write mới. Release cần deployment target/domain, provider credentials và quyền dữ liệu hợp lệ, người vận hành/nhận cảnh báo, version pinning và reviewed release linkage. Xem [P03 runbook](../../backend/infra/P03_README.md) và [execution record](P03-P04-execution.md).
