# P01-IN Intelligence Service — nhóm F

> **Thứ tự đã chốt tại P00:** owner N2, reviewer N1. Hoàn thiện/kiểm thử interaction/history/features/Basic trước; sau nghiệm thu Basic mới triển khai dataset/training/model/pgvector. Release cuối có ML; gate P01 cuối yêu cầu pipeline fixture đạt, quality production kiểm ở P03. Không thực hiện Basic và ML đồng thời theo hướng dẫn cũ. Storage: PostgreSQL + pgvector, Redis chỉ cache. Xem [P00-DECISIONS.md](../../P00-DECISIONS.md).

Trạng thái (20/10/2026): **11/12 task LOCAL_VERIFIED (Basic + ML pipeline trên fixture); IN-12 (handoff/reviewer N1) còn PARTIAL; chất lượng model thật thuộc P03**. Code đã merge vào `main` (PR #14, merge `61f6c2e`); người dùng chấp nhận P01 ngày 11/10/2026, chưa có chữ ký reviewer. Evidence chính thức tại [progress](../../../progress_be.md); checkbox trong file này là yêu cầu, không phải trạng thái. Dependency: P00, không chờ năm service còn lại. Scope F05/F08 và toàn bộ cơ chế dataset/training/model. Reviewer: A.

[Database Intelligence](../../database/intelligence.md) · [DDL](../../database/sql/intelligence.sql) · [Contract](../../04-api-events.md) · [Gate](README.md). Owner: `backend/services/intelligence-service/**`, gồm worker Python nếu cần; vẫn một service nghiệp vụ.

## Dependency được giả lập

| Đối tác | Thay thế P01 | Case |
|---|---|---|
| Identity | Test JWT/JWKS, preference/status/consent/deletion fixtures | Consent on/off, stale preference, guest |
| Catalog | Snapshot/validate/batch HTTP stub + events | Public/hidden/unknown price/no location/timeout |
| Community | Rating/favorite/review event fixtures | Duplicated/out-of-order, review CREATED khác MODERATED |
| Trip | item.added fixture | User/place/request attribution, dedup |
| Ingestion | Source-policy batch stub + policy events | Training allowed/revoked/license version changed |
| Dataset/artifact | Dataset synthetic hoặc dữ liệu local được phép, local object storage | Checksum/schema/split/reproducibility, artifact lỗi |

Feature/scoring/interaction/ML pipeline đều implement thật trên input giả lập có chủ đích. Synthetic dataset kiểm cơ chế, không chứng minh accuracy hoặc hiệu quả model production.

## M1 Database và local runtime

- [ ] P01-IN-01: Flyway 10 domain + 4 technical, IDs/dedup/version/index/lineage; 5 bảng baseline và 5 bảng ML đều được chuẩn bị.
- [ ] P01-IN-02: Local app/workers/security/log/health/image/CI, HTTP stubs/event harness/object storage; không cần chạy Ingestion để có dữ liệu test.

## M2 Nghiệp vụ

- [ ] P01-IN-03: Interaction SEARCH/PLACE_VIEW từ client; loại còn lại từ server fixture, dedup/event validation/rate/retention/history ownership và consent.
- [ ] P01-IN-04: Profile/place feature projections có catalog/rating version riêng, snapshot rebuild; scoring hard filters trước điểm, missing values/cold-start, stable Top N/explanation/fallback.
- [ ] P01-IN-05: Dataset version/checksum/criteria/feature schema/source/license/consent; builder đọc snapshots local/fixture qua adapter, không query DB service khác.
- [ ] P01-IN-06: Training job params/code/seed/status/cancel/log/artifact; model validation/metrics, active-per-use-case/rollback, inference deadline và fallback Basic.
- [ ] P01-IN-07: Source policy/consent revoke/deletion impact lên features/dataset/model; định nghĩa quality gate thật để áp dụng sau. Fixture test model đạt pipeline gate không tự bật production deployment.

API: recommendations, interactions/batch, me/history theo scope, admin datasets/jobs/models/validate/deploy/rollback; internal rebuild và policy handlers. Basic API chạy độc lập ML; không tự thêm RAG/chatbot.

## M3 Biên giao tiếp

- [ ] P01-IN-08: HTTP Catalog final visibility/source policy clients trỏ stub; tất cả input event qua handler thật, outbox/inbox/dedup/retry; publish model.deployed và deletion ack.
- [ ] P01-IN-09: Provider contract tests recommendation response có request/version/score/data_as_of/fallback; schema change và revocation không bị event cũ đảo ngược.

## M4 Kiểm nhận và bàn giao

- [ ] P01-IN-10: Golden cases hard filter/currency/cold start/no consent/unknowns/tie-break/hidden place; cùng input+snapshot+version cho cùng kết quả, không duplicate/NaN.
- [ ] P01-IN-11: Không đếm đôi client/server events; dataset forbidden bị chặn; checksum mismatch, two concurrent model activation, timeout fallback, rollback và reproducibility trên fixture pass.
- [ ] P01-IN-12: Handoff code/image/migrations/API/events/scoring config/fixture datasets/test report/local-run/model pipeline runbook; tách rõ bằng chứng cơ chế và chất lượng dữ liệu/model còn phải đo thật.

**Gate:** F/A xác nhận READY_FOR_INTEGRATION cho baseline **và cơ chế ML trong scope**, không bỏ pipeline vì chưa có dữ liệu từ E. Nếu scope phát hành chỉ Basic, việc hoãn ML phải là quyết định scope rõ tại P00, không tự đánh dấu phần chưa làm là hoàn tất.

## Chỉ làm ở P02 và P03

P02 nối năm service thật, snapshot bootstrap/delta và policy; P03 đánh giá dataset/model thực trên holdout với sample size, kiểm chất lượng so Basic rồi mới cho model production active. Nếu chất lượng chưa đủ, giữ Basic; implementation pipeline vẫn đã bàn giao. Không rollback consent để làm test pass.
