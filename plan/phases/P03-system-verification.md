# P03 Tích hợp sáu service và kiểm nhận chất lượng

Trạng thái (30/10/2026): **PARTIAL**; P03-07 kiểm lại browser UI hiện tại LOCAL_VERIFIED với P02. Chưa chạy lại toàn bộ gate trên revision cuối, chưa CI/chữ ký; AI DEFERRED. Bằng chứng: [progress](../../progress_be.md). Không cấp SYSTEM_VERIFIED/mở P04.

## Công việc

- [ ] P03-01: Contract producer/consumer/frontend và old/new version compatibility; enum/error/schema evolution.
- [ ] P03-02: E2E register→preferences→search→favorite/review→moderate→recommend→trip→map; luồng business/import/ML riêng.
- [ ] P03-03: Broker/downstream outage, crash/retry, duplicate/out-of-order, DLQ replay, rating/feature reconciliation và snapshot đọc được.
- [ ] P03-04: Ma trận authorization toàn endpoint, BOLA/IDOR, refresh reuse, claim/user revoke, upload, rate limit, secret/PII redaction.
- [ ] P03-05: Load test theo lưu lượng/dataset P00; EXPLAIN hot query, index/pool/timeout/backpressure, slow consumer; ghi metric thực tế.
- [ ] P03-06: Backup/restore sáu DB+objects và rebuild projections theo watermark; retention/deletion/license revoke exercises.
- [ ] P03-07: Frontend user/admin/business: responsive/accessibility, keyboard form, loading/error/empty/map; trạng thái async không báo hoàn tất trước ack.
- [ ] P03-08: Release evidence, findings severity/fix, trace IDs, dashboards, runbook và owner vận hành.

## Chất lượng dữ liệu và mô hình thực

- [ ] P03-09: Nhập dữ liệu thực được phép, kiểm provenance/license/consent; chạy dataset/train/evaluation trên holdout với sample size và chống leakage.
- [ ] P03-10: So chất lượng model với Basic baseline theo gate P00; chưa đạt thì giữ Basic, ghi QUALITY_PENDING và không kích hoạt model production. Không gọi phần implementation chưa làm là đã hoàn tất.
- [ ] P03-11: Ghi rõ provider thật/sandbox, coverage frontend user/admin/business và trạng thái SYSTEM_VERIFIED theo evidence từng service.

## Chỉ tiêu đề xuất để hiệu chuẩn

Search/detail p95 <500ms, Basic Recommendation p95 <800ms, projection lag <10s ở tải bình thường đã chốt P00. Map/email external latency đo riêng. Đây là mục tiêu đề xuất, chưa được đo; báo số liệu thực thay vì coi ngưỡng là bằng chứng đạt. Chốt RPO/RTO ở P00 và diễn tập restore ở đây.

Kiểm schema triển khai với đặc tả 97 bảng (73 domain/read model + 24 kỹ thuật); bảng chưa thuộc release scope phải được ghi rõ. Kiểm gateway route collision, caching private data, pagination và If-Match. Không chỉ chạy validator của ag-kit rồi coi ứng dụng đạt chuẩn.

## Cổng hoàn thành

- [ ] F01–F11 có evidence pass; scope mở rộng có gate riêng nếu phát hành đầy đủ; fixture ML tại P01 chỉ chứng minh pipeline, chưa chứng minh chất lượng trên dữ liệu thực.
- [ ] Không còn critical/high lỗi phân quyền/mất dữ liệu; vấn đề hoãn có owner và release decision.
- [ ] Reconciliation/count/checksum đúng, core E2E pass, restore đạt RPO/RTO được chốt.
- [ ] Có runbook replay/rollback/restore/deletion và người nhận cảnh báo. Sáu owner không phải đọc chéo DB để vận hành.

Đầu ra: test/load/security/restore reports và release candidate đã kiểm chứng. Fail gate thì chặn phát hành, sửa hoặc rollback feature/model/image; không cutover chỉ vì UI đã xong.
