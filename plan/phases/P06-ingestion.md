# P06 Ingestion Service và nguồn dữ liệu

Trạng thái: **Chưa triển khai**. Dependency: P01/P02/P03, nguồn và quyền sử dụng đã xác nhận. Mục tiêu: import lặp lại an toàn, có provenance tới canonical Place.

## Công việc

- [ ] P06-01: [Ingestion migration](../database/ingestion.md), registry/license/secret reference, một connector nguồn/file hợp lệ trước.
- [ ] P06-02: Fetch timeout/rate limit/pagination/cursor; chặn lưu raw khi allow_storage=false; canonical hash và raw revision bất biến.
- [ ] P06-03: Normalize name/address/coordinate/currency/hour/category, validation report/quarantine bản ghi thiếu dữ liệu.
- [ ] P06-04: Match theo source link trước, fuzzy candidate sau; ground truth nhỏ để chọn threshold; NEEDS_REVIEW nếu mơ hồ.
- [ ] P06-05: Persist item+outbox, fixed command/proposed UUID; Catalog expected version/protected field precedence; ack mới ghi source link.
- [ ] P06-06: Job full/incremental/replay/cancel; checkpoint an toàn khi PARTIAL/FAILED, retry item và counts derive, không auto-delete place vì record vắng một lần.
- [ ] P06-07: Revoke source policy tới Catalog/Intelligence; lineage cho P08; admin job/errors/candidate/retry.

## Contract và dữ liệu

6 bảng domain + 4 kỹ thuật. UNIQUE source/external/hash, link source/external, một job QUEUED/RUNNING/source. Admin API data-sources/import-jobs/items/candidates/retry/cancel; internal policy batch/lookup. Publish upsert command/source-policy; consume Catalog applied/rejected. Worker không có Catalog credential.

Frontend: admin nguồn/license, trạng thái job, counts/errors có redact, so sánh candidate và manual decision.

## Kiểm nhận

- [ ] Cùng input chạy hai lần không tăng place; crash sau Catalog commit trước ack vẫn replay về cùng UUID.
- [ ] Hash thay đổi cập nhật đúng version; importer không đè field admin/business đã xác nhận.
- [ ] PARTIAL cursor không bỏ record lỗi; duplicate retry không tăng counter; không hai active job cùng nguồn.
- [ ] Nguồn revoke chặn storage/training tương ứng; secret không vào payload/log/DB ngoài secret_ref.
- [ ] Một nguồn chạy hết fetch→normalize→dedup→Catalog→ack; 100% item có trạng thái/accounting, không silently drop.

Đầu ra: connector/normalizer/matcher, APIs/events/migrations/UI, fixture hợp lệ và replay/crash tests, runbook source policy/checkpoint/retry. Rollback bằng pause connector và corrective Catalog versions theo provenance; không xóa hàng loạt place có UGC/business data.
