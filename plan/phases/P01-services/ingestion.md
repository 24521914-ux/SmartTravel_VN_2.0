# P01-IG Ingestion Service — nhóm E

Trạng thái: **NOT_STARTED**. Dependency: P00, không chờ Catalog/Identity/Intelligence. Scope source/job/raw/normalize/dedup/provenance. Reviewer: F.

[Database Ingestion](../../database/ingestion.md) · [DDL](../../database/sql/ingestion.sql) · [Contract](../../04-api-events.md) · [Gate](README.md). Owner: `backend/services/ingestion-service/**`.

## Dependency được giả lập

| Đối tác | Thay thế P01 | Case |
|---|---|---|
| Identity | Test JWKS/admin token | Admin/user/expired/wrong audience |
| Nguồn ngoài | File fixture và HTTP connector stub | Pagination/cursor, malformed, duplicate, changed hash, quota/timeout |
| Catalog | Candidate lookup stub, capture command + inject applied/rejected | CREATE/UPDATE/conflict/retry/missing ack |
| Intelligence | Capture source-policy event ở sink | Schema/version/revocation, không cần training service |

Raw/job/checkpoint/mapping/policy và pipeline normalize/match là implementation thật. Fake Catalog ack có dữ liệu hợp contract và chỉ được dùng test/dev.

## M1 Database và local runtime

- [ ] P01-IG-01: Flyway 6 domain + 4 technical, unique raw hash/link/command, một active job/source; source registry và fixture đã xác định quyền sử dụng.
- [ ] P01-IG-02: Local app/workers/DB/security/log/health/CI/image và connector/Catalog stub; secret reference thay secret plaintext.

## M2 Nghiệp vụ

- [ ] P01-IG-03: Registry/license/version/policy/admin APIs; full/incremental/replay/cancel jobs và source locking; chặn raw khi allow_storage=false.
- [ ] P01-IG-04: Fetch/cursor/rate/size limit, canonical hash, raw revisions, normalize name/address/coordinate/currency/hour/category, quarantine lỗi.
- [ ] P01-IG-05: Source link match trước, candidate sau; NEEDS_REVIEW/reviewer quyết định; threshold có fixture ground truth, không tự nhận chính xác production.
- [ ] P01-IG-06: Import item + fixed command/proposed UUID, expected Catalog version, retry/dedup/derived counts; checkpoint chỉ tiến khi ack đủ. Không auto-delete place vì record vắng.

API: admin sources/policy/jobs/items/candidates/retry/cancel; internal policy/batch/source-link lookup. Admin UI examples cho progress/errors/review; errors được redact.

## M3 Biên giao tiếp

- [ ] P01-IG-07: Publish upsert-requested/source-policy; handle Catalog results bằng inbox/transaction, ack mới update source_place_links; reject/conflict/manual review đúng state.
- [ ] P01-IG-08: Candidate HTTP client trỏ stub, broker harness có duplicate/delay/crash; provider policy APIs của Ingestion phải implement thật để Catalog/Intelligence dùng sau.

## M4 Kiểm nhận và bàn giao

- [ ] P01-IG-09: Cùng input hai lần giữ raw/link/item accounting đúng; command replay giữ UUID; missing ack không báo SUCCEEDED.
- [ ] P01-IG-10: PARTIAL không bỏ item lỗi, retry không tăng counter hai lần, policy revoke chặn xử lý; protected-field conflict được báo thay vì overwrite.
- [ ] P01-IG-11: Handoff schema/API/event/image/test/local-run, connector fixtures, checkpoint/quarantine/replay runbook; nêu nguồn chưa kiểm thật.

**Gate:** E/F xác nhận READY_FOR_INTEGRATION; đã chứng minh phía Ingestion độc lập, chưa khẳng định Catalog thật không tạo duplicate cho tới P02.

## Chỉ làm ở P02

Nối command/result/lookup với Catalog thật, policy với Intelligence và nguồn/sandbox được cấp quyền. Rollback bằng pause connector/checkpoint replay; không xóa place có dữ liệu user/business. Kiểm end-to-end provenance trên dữ liệu thật ở P03.
