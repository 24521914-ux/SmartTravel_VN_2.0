# Lịch sử nội dung P03 local — 21/10/2026

Cập nhật lần cuối: 21/10/2026 · Revision nguồn: `0bcdca4` · Người cập nhật: coding agent. Nguồn nguyên văn: `plan/phases/P03-system-verification.md`. Tuyên bố nghiệm thu/gate bên dưới giữ làm lịch sử, thay thế bởi PARTIAL trong checklist chính; không thay chữ ký owner/reviewer.

---

# P03 Tích hợp sáu service và kiểm nhận chất lượng

**20/10/2026 — P03 không AI: COMPLETE / P03_NON_AI_VERIFIED.** Đã nghiệm thu toàn bộ phạm vi không AI theo yêu cầu người dùng; F05/F08, quản trị model/dataset, ML và AI quality là **DEFERRED_BY_USER**. Full SYSTEM_VERIFIED chưa được cấp; P04 vẫn NOT_STARTED. Chi tiết và số đo: [bàn giao P03 không AI](../../docs/P03_NON_AI_ACCEPTANCE.md).

- [x] P03-01/02/03/04/05/06/07/08/11: hoàn thành phạm vi không AI, có đủ bằng chứng current-source và gate đạt.
- [ ] P03-09/10 và các phần AI lồng trong task khác: DEFERRED_BY_USER, để thực hiện sau.
- [x] Gate phạm vi người dùng yêu cầu: P03_NON_AI_VERIFIED; full SYSTEM_VERIFIED và P04 không được cấp.

216 service test; 94 tooling test (93 pass, 1 skip Windows); 532 security request; 8 browser nhóm/36 responsive; load 1.200 HTTP 200, 50 tài khoản, p95 tổng 232,16 ms; application restore 183,92 giây.

Các checklist và checkpoint cũ bên dưới lưu lịch sử/phạm vi đầy đủ trước khi người dùng hoãn AI; trạng thái hiện hành nằm ở block 20/10 này.

---

Trạng thái: **IN_PROGRESS**, full acceptance **NO_GO**. Đã có công cụ và evidence probe local; chưa đủ SYSTEM_VERIFIED. Dependency: P02 kết nối hoàn tất sau gate 6/6 READY_FOR_INTEGRATION của P01. Các service thật đã chạy cùng nhau; không còn stub giữa sáu service. Mục tiêu: chứng minh nghiệp vụ, resilience, security, hiệu năng và phục hồi trước release. P04 vẫn **NOT_STARTED**, phụ thuộc gate P03.

## Công việc

- [ ] P03-01: Contract producer/consumer/frontend và old/new version compatibility; enum/error/schema evolution.
- [ ] P03-02: E2E register→preferences→search→favorite/review→moderate→recommend→trip→map; luồng business/import/ML riêng.
- [ ] P03-03: Broker/downstream outage, crash/retry, duplicate/out-of-order, DLQ replay, rating/feature reconciliation và snapshot đọc được.
- [ ] P03-04: Ma trận authorization toàn endpoint, BOLA/IDOR, refresh reuse, claim/user revoke, upload, rate limit, secret/PII redaction.
- [ ] P03-05: Load test theo lưu lượng/dataset P00; EXPLAIN hot query, index/pool/timeout/backpressure, slow consumer; ghi metric thực tế.
- [ ] P03-06: Backup/restore sáu DB+objects và rebuild projections theo watermark; retention/deletion/license revoke exercises.
- [x] P03-07: Frontend user/admin/business: responsive/accessibility, keyboard form, loading/error/empty/map; trạng thái async không báo hoàn tất trước ack.
- [ ] P03-08: Release evidence, findings severity/fix, trace IDs, dashboards, runbook và owner vận hành.

## Chất lượng dữ liệu và mô hình thực

- [ ] P03-09: Nhập dữ liệu thực được phép, kiểm provenance/license/consent; chạy dataset/train/evaluation trên holdout với sample size và chống leakage.
- [ ] P03-10: So chất lượng model với Basic baseline theo gate P00; chưa đạt thì giữ Basic, ghi QUALITY_PENDING và không kích hoạt model production. Không gọi phần implementation chưa làm là đã hoàn tất.
- [ ] P03-11: Ghi rõ provider thật/sandbox, coverage frontend user/admin/business và trạng thái SYSTEM_VERIFIED theo evidence từng service.

## Chỉ tiêu đề xuất để hiệu chuẩn

Frozen P00 load gate: read p95 <=500ms, write p95 <=800ms, Basic Recommendation p95 <=1000ms. Mục tiêu đề xuất chặt hơn cho Basic p95 <800ms không thay thế frozen gate. Projection lag <10s ở tải bình thường đã chốt P00. Map/email external latency đo riêng. Đây là mục tiêu đề xuất, chưa được đo; báo số liệu thực thay vì coi ngưỡng là bằng chứng đạt. Chốt RPO/RTO ở P00 và diễn tập restore ở đây.

Kiểm schema triển khai với đặc tả 97 bảng (73 domain/read model + 24 kỹ thuật); bảng chưa thuộc release scope phải được ghi rõ. Kiểm gateway route collision, caching private data, pagination và If-Match. Không chỉ chạy validator của ag-kit rồi coi ứng dụng đạt chuẩn.

## Cổng hoàn thành

- [ ] F01–F11 có evidence pass; scope mở rộng có gate riêng nếu phát hành đầy đủ; fixture ML tại P01 chỉ chứng minh pipeline, chưa chứng minh chất lượng trên dữ liệu thực.
- [ ] Không còn critical/high lỗi phân quyền/mất dữ liệu; vấn đề hoãn có owner và release decision.
- [ ] Reconciliation/count/checksum đúng, core E2E pass, restore đạt RPO/RTO được chốt.
- [ ] Có runbook replay/rollback/restore/deletion và người nhận cảnh báo. Sáu owner không phải đọc chéo DB để vận hành.

Đầu ra: test/load/security/restore reports và release candidate đã kiểm chứng. Fail gate thì chặn phát hành, sửa hoặc rollback feature/model/image; không cutover chỉ vì UI đã xong.

## Evidence checkpoint — 11 October 2026

Runbook và phạm vi: [P03_README](../../backend/infra/P03_README.md). Công cụ `p03_verify.py` kiểm frozen contracts bằng validator chính thức, denial toàn protected endpoint cho guest/malformed JWT và load catalog chỉ đọc. `p03_quality.py` kiểm holdout offline, không kích hoạt model. `p03_gate.py` fail closed khi thiếu release identity đồng nhất, timestamp mới, source hash hiện hành hoặc operations linkage review.

Probe ban đầu: 183 HTTP operations/23 messages và checksum pass; security 334 denial checks pass, 22 anonymous operations bỏ qua có lý do; load 600 requests/30s, zero errors, 19.976 rps, p95 141.895ms, 50 paced virtual users nhưng peak inflight4. Không xem đây là đạt full P03-04/P03-05: chưa full role/BOLA/upload/rate-limit matrix và chưa dataset/mix P00. Reports private ở `backend/infra/.local/p03`; báo cáo mới ghi timestamp/source hashes.

P03-07 hoàn thành theo browser scope đã đo; các full task/gate khác giữ chưa hoàn thành. Thiếu real licensed data/model quality, full traffic mix/dataset, application DR/projection recovery, complete E2E/resilience/browser/provider scope và vận hành/release linkage được review. Storage restore hoặc browser probe chỉ được ghi pass theo kết quả cụ thể; không suy ra SYSTEM_VERIFIED hoặc production release.

Browser checkpoint: frontend53 checks PASS, zero failures/gaps; 36 responsive cases cover user map, business and admin review at320/390/768/1280. Real OSM response200 and MapLibre zoom; verification/claim pending, moderation, import QUEUED with refresh, labels/keyboard focus/loading/error/empty states observed. P03-07 complete for this measured scope/basic accessibility; no broad WCAG certification claimed. Evidence release_id p03-local-20261011-a466c6d, timestamp2026-10-11T11:19:38.038Z, five current source hashes. Frontend build37 modules and contracts7 checks PASS. Full P03 gate remains NO_GO.

Final isolated storage checkpoint: restore-report.json PASS exit0, release p03-local-20261011-a466c6d, UTC2026-10-11T11:26:51.630878+00:00. Restore125.301558s, checkpoint age678.592985s; source hashes unchanged during run. Six DB row/document counts, Mongo options/indexes and full PostgreSQL schema against same-engine archive-only reference MATCH. Fifteen backup artifacts pass integrity validation;17 restore safety tests PASS. Six object volumes each contain0 files: nonempty object recovery remains unverified. All exercise-owned containers/volumes removed; original seven apps ready. Application DR, Mongo auth roles/topology, PostgreSQL ownership/ACL, encryption/offsite backup and production RPO/RTO remain unverified; P03-06 remains unchecked.

Final sequential candidate checkpoint:45 P03 tooling unit tests PASS and independent review APPROVE for scoped local tooling, no high/critical findings in that review scope. Frozen contracts183 HTTP operations/23 messages PASS; security504 checks PASS (full role matrix still incomplete). Final isolated mixed run600/600 HTTP200 over30.1706s,19.8869rps, zero errors/dropped slots, aggregate p95472.484ms/max591.568ms, peak6 inflight,50 virtual users sharing ONE principal. Class counts/p95: Catalog300/178.435ms, Basic120/554.207ms, Trip90/81.913ms, writes90/62.305ms. Fixture profile recovered. Source hashes match current candidate; previous3-Basic-error report retained in private raw archive with concurrency context, cause unproven. Local mixed latency passes; frozen dataset/distinct-principal load acceptance remains false. P03 remains IN_PROGRESS / NO_GO; P04 NOT_STARTED.


??ng b? giao code 20/10/2026: tooling v? runner ph?m vi kh?ng AI ?? c? trong source; tr?ng th?i ki?m nh?n l? **PARTIAL**, c?n CI revision PR cu?i v? ch? k? owner/reviewer. Tuy?n b? nghi?m thu local l?u t?i [l?ch s?](../../progress/evidence/2026-10-20-local-checklist-history.md); kh?ng t? ??ng gate ??y ??.
