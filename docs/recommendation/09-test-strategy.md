# Kiểm thử, quality gates và nghiệm thu

[Mục lục](00-readme.md) · [Module](03-module-design.md) · [ML protocol](07-ml-training-evaluation.md) · [Backlog](11-implementation-backlog.md). Đây là yêu cầu kiểm thử tương lai, không phải báo cáo test đã chạy. Kết quả, run ID, trạng thái và chữ ký chỉ ghi tại [progress BE](../../progress_be.md) / [progress FE](../../progress_fe.md).

## 1. Phân lớp và môi trường

| Lớp | Đối tượng | Dependency | Đầu ra yêu cầu |
|---|---|---|---|
| Unit | Filters/features/scorers/rankers/context/calibration/policy | Pure fixture, frozen Clock, fixed dictionary và seed | Phép tính chính xác, invariants, edge cases, không I/O ngầm |
| Component/integration | Candidate/audit/projection/feedback/model registry/worker | PostgreSQL16+pgvector thật, RabbitMQ thật khi suite transport, HTTP owner stub chỉ cho isolate | Transaction/constraint/version/idempotence/restart thực |
| Contract | Request/response/event v1/v2; owner hard-field/consent extensions | JSON Schema/OpenAPI registry + fixtures; provider và consumer tests | Strict schema, old/new compatibility, đủ headers/scopes/errors |
| Connected | Catalog/Identity/Community/Trip/Ingestion/Intelligence + Gateway | Sáu service thật, DB riêng thật, broker thật | Không direct DB hoặc stub đối tác trong kết luận connected |
| Algorithm/golden | Baseline/content/CF/hybrid/context + 5 flows | Fixture số độc lập, random property inputs bounded | Output finite, eligible, reproducible; đúng cả unavailable mask |
| Data quality | Snapshot/PIT/labels/consent/source lineage | Immutable fixtures + dataset real có quyền riêng | Count/hash/cutoff đúng; reject leakage/invalid policy |
| Offline ML | Baseline vs challenger full policy | Real holdout và real sample counts; synthetic riêng | P/R/NDCG/coverage/diversity/cohort/CI/latency, gate outcome |
| Security/privacy | JWT/object authorization/consent/token/model access | Valid/invalid principal, scopes và concurrent revoke thật | Không leak/cross-user/forged feedback, audit sanitized |
| Resilience/load | Timeouts/DLQ/worker restart/CAS/rollback/resource caps | Dependency failure injection isolated, fixed hardware/profile | Fallback bounded, final validation fail closed, latency/resource measured |
| Browser/E2E | FE request/render/viewport click/Trip attribution/Agent tool | Browser thật→Gateway→service; không UI mock success | Actual calls, error/empty/degraded, không duplicate impressions |

Runtime chuẩn microservices: **Java21**, Maven wrapper của repo, PostgreSQL/pgvector và RabbitMQ versions theo environment/CI hiện hành. `backend/pom.xml` legacy Java25 không phải build target sáu service. Unit pass không chứng minh DB/broker pass; stub contract pass không chứng minh connected. Không tạo quality test chỉ assert output tự sinh bằng chính công thức implementation.

## 2. Ma trận invariant và regression

ID ở đây là test requirement, không task progress. File test mới đều dưới `backend/services/intelligence-service/src/test/java/vn/smarttravel/intelligence/`, trừ nơi ghi FE/Gateway. Existing `BasicDatabaseTests`, `SnapshotRebuildTests`, `BrokerDatabaseTests`, security tests phải được giữ regression.

| ID | Scenario và input quan trọng | Expected / mức | Test/file dự kiến |
|---|---|---|---|
| T01 | PUBLISHED/HIDDEN/ARCHIVED/DRAFT trong projection và Catalog | Chỉ PUBLISHED validated; HIDDEN cập nhật giữa ranking và response bị loại / U+I | `recommendations/FinalValidationTests`, Catalog connected case |
| T02 | Place D2 ở gần GPS nhưng request D1 | Không sai destination; inactive destination không được dùng / U+I+C | `candidates/HardConstraintFilterTests` |
| T03 | 1.500+ published items, eligible D1 nằm sau1.000 UUID đầu | Có thể retrieve eligible bằng pushdown/page; truncation được audit / I+load | `candidates/CandidateDatabaseTests` |
| T04 | Budget0/150k; unknown/null price, price_min thấp nhưng actual estimate cao; currency khác | Không diễn giải unknown=free hoặc price_min là total; hard không rõ→loại / U+C | `context/BudgetRuleTests` |
| T05 | Radius boundary, lat/lon zero, gần180°, invalid NaN, half location | Inclusive boundary versioned; invalid→400; no coords hard→loại / U+C | `candidates/GeoRuleTests` |
| T06 | Visit xuyên nửa đêm/ngày nghỉ/holiday exception/timezone missing; request thiếu offset | Kiểm toàn interval, exception ưu tiên, missing hard→loại, invalid→400 / U+I | `context/OpeningHoursTests` |
| T07 | open_now + visit, party.mobility_required unknown | Request mơ hồ→400; required accessibility unknown→loại / U+C | `context/ContextValidationTests` |
| T08 | Weather timeout/stale, không có provider; closure có authority | Bỏ soft forecast thiếu; closure hard không bị ML override / U+I | `context/ContextRerankerTests` |
| T09 | Duplicate candidate pages / Top N larger than valid pool | Unique IDs/ranks; trả ít hơnN, không nới hard constraints / U+I | `recommendations/TopNTests` |
| T10 | Score NaN/Infinity/out-of-range/unknown item ID/duplicate scorer ID | Module fail typed; fallback hợp lệ, không persist invalid numeric / U+C | `ranking/ScoreBatchContractTests` |
| T11 | Tie scores full precision, thứ tự scorer hoàn thành khác nhau | Same input/snapshot/version→same ordering UUID / U+property | `ranking/DeterminismTests` |
| T12 | Bayesian n0/n1/high count, rating sum invalid, pop Q95 zero, trend insufficient support | Tính đúng/availability đúng; không fabricated quality / U | `ranking/BaselineRuleScorerTests` |
| T13 | Cosine example, zero norm, tags OOV, dictionary permutation | Numeric reference tolerance; no divide0; schema stable / U | `ranking/ContentRuleScorerTests` |
| T14 | CF user/item cold, only2 neighbors when gate3, review event không rating | CF OFF; không tự tạo labels/factors/neighbor / U+I | `ranking/CollaborativeRuleScorerTests` |
| T15 | Favorite add/remove/replay; review pending→approved→hidden; Trip duplicated snapshot/event | Net state/dedup đúng, không double-count client/server / I+broker | `feedback/ImplicitStateDatabaseTests` |
| T16 | B0,7 C0,8 CF0,4, CF missing vs CF=0 | H0,66; missing0,771429; zero giữ weight / U | `ranking/WeightedHybridRankerTests` |
| T17 | Raw logit/Cosine khác miền, calibrator sai version | Reject input hoặc compatibility fallback; không cộng raw scores / U+C | `ranking/CalibrationCompatibilityTests` |
| T18 | Content ML timeout, Learned signature chỉ chấp nhận Content ML | Content Rule, Hybrid Weighted, CF giữ nguyên, actual trace đúng / U+I | `ranking/ModuleFallbackTests` |
| T19 | Model corrupt/hash mismatch/OOM/stuck executor/saturation | Typed failure, bounded resources/deadline; no endless retries / I+fault | `models/InferenceFailureTests` |
| T20 | Catalog final batch2 lỗi, version mismatch, candidate vừa hidden | Batch failure→503; mismatch drop/hydrate recompute bounded; no stale score proof / I+connected | `recommendations/FinalValidationDatabaseTests` |
| T21 | Consent false/unknown/Identity event lag/invalid JWT | False/unknown→request-only; invalid token 401, session unavailable không pretend guest / I+security | `security/RecommendationConsentTests` |
| T22 | Revoke đến trong inference, stale opt-in event sau revoke, delete rồi replay old event | Final consent fence chặn personal output; không hồi sinh user/history/model / I+broker | `projections/ConsentFenceTests` |
| T23 | UserA đọc history/token/request results UserB; Agent sửa user_id/scope | 403/404 phù hợp; API không accept body user_id / C+security | `security/SubjectIsolationTests` |
| T24 | No analytics grant, backend log/audit/token/retries | Không user-linked criteria/GPS/history; không impression token, deletion không replay cached PII / I+log inspection | `feedback/ConsentRetentionTests` |
| T25 | Feedback signed token bị sửa/expiry/cross-session/subject/request/place; cùng event ID khác payload | Reject token; dedup same hash;409 different; no false impression / U+I+C | `feedback/FeedbackTokenTests` |
| T26 | CLICK đến trước IMPRESSION hoặc cùng batch out of order | Batch xử exposure trước; chưa recorded→409 retryable; không fabricate exposure / I | `feedback/FeedbackOrderingTests` |
| T27 | Request/results hết hạn30 ngày, impressions vẫn giữ 90 ngày | Xóa sanitized parent không cascade mất exposure/labels; linked attribution snapshot vẫn đủ / I | `feedback/RetentionDatabaseTests` |
| T28 | Dataset future rating/current features gắn historical request; nhận late event sau cutoff | Dataset reject hoặc exclude, không leakage / I+data | `models/PointInTimeDatasetTests` |
| T29 | Source allow_storage=true,allow_training=false; user revoke sau snapshot trước publish | Không READY/train/activate; derivative revoked; no permission downgrade loophole / I+connected | `models/DatasetGovernanceTests` |
| T30 | Same snapshot/seed/code build twice, manifest metadata created_at khác | Logical content hash/rows/splits tái lập; run metadata hash có thể khác / I | `models/ReproducibilityTests` |
| T31 | Synthetic fixture model metrics cao, real holdout missing | QUALITY_PENDING, không production validation/activation / U+I | `models/QualityGateTests` |
| T32 | Concurrent deploy Content/Hybrid/policy, stale If-Match/active generation | Một winner/slot;409 loser; không hai pointer lệch / I+DB | `models/PolicyActivationDatabaseTests` |
| T33 | Rollback target revoked source/user, feature signature sai | Reject target hoặc Rule emergency bundle, API schema giữ nguyên / I+security | `models/PolicyRollbackTests` |
| T34 | Worker killed/lease expired/cancel request in-flight/retry | No double publish; cancellation ack đúng; no partial artifact serving / I+fault | `models/TrainingLeaseTests` |
| T35 | Unknown event schema/outbox send-confirm failure/DLQ replay duplicate | Retry/DLQ observable, dedup đúng, không silently drop / broker+contract | `infrastructure/transport/integration/BrokerDatabaseTests` mở rộng |
| T36 | v1 client strict schema và mới v2; Gateway anonymous matcher/AI disabled | v1 unchanged; v2 supported đúng route; AI disabled503; no internal expose / C+Gateway | `GatewayHttpTests`, `GatewayRoutingTests`, new v2 contract fixtures |
| T37 | FE viewport re-render/scroll/retry; API lỗi favorite/Trip | Không duplicate exposure, không tạo success giả; empty/error rõ / browser | `frontend/scripts/browser-smoke.mjs` mở rộng hoặc script AI mới được review |
| T38 | Agent prompt injection: bỏ hard filter/đọc DB/tự chọn model; tool timeout | Tool schema reject, auth scoped, không directDB, safe fallback / security+E2E | Proposed `agent/RecommendationToolTests`, caller integration |
| T39 | Trip add suggestion attribution duplicate; route schedule impossible | Trip owner auth/version/idempotency; request ID không là quyền ghi; Trip validator vẫn kiểm / connected | Trip `recommendationAttributionIsPersistedAndEmittedOnce` mở rộng |
| T40 | Load warm/cold + one dependency slow, resources fixed | p95/p99/error/fallback/resource counts, no constraints leak, timeout bounded / load | New AI load scenario trong infra, không sửa non-ai gate thành pass AI |

## 3. Golden tests và property tests

Golden fixtures tách input thô, expected tính độc lập và current contract schemas. Năm flow tại [ví dụ](10-examples.md) assert scores/ranks/actual trace/fallback/explanation evidence; không dùng chính implementation sinh expected. Float tolerance đề xuất1e-9 trước round,1e-6 cho response6 chữ số; sorting dùng full precision và tie key. Matrix factorization nondeterministic phải công bố tolerance/runtime/seed, không hứa bitwise reproduction trên mọi GPU/BLAS.

Property tests trên bounded random fixtures: output⊆eligible input, no duplicate, all score finite, topN bound, adding hidden candidate không thay valid set, same version→same result cho Rule, changing unrelated user không leak, `a=0` khác `score=0`, positive weight scaling đồng thời không đổi Weighted Hybrid. Monotonicity chỉ áp cho feature không bị context/diversity coupling; không assert “tăng score một item không đổi mọi rank” khi MMR có tương tác.

## 4. Quality gates cho sáu giai đoạn

| Gate thiết kế | Điều kiện bắt buộc | Cần data thật? | Quyết định khi chưa đạt |
|---|---|---|---|
| G1 Foundation | Owner contracts/purpose/hard fields rõ; v1 golden; projection/version/replay/consent/filter/registry seams có tests và CI đúng revision | Không cần interaction real để chứng minh mechanics; cần kiểm inventory source/licensed data để mở serving hữu ích | Không bật personalization/ML; vẫn làm Rule fixture tests |
| G2 Rule MVP | Baseline/Content/Weighted/context/final validation chạy không ML; CF support gated; Gateway/FE real connected; T01–T24/T35–T37 đúng phần G2 PASS (T18/19 bằng fake adapter seam, T37 chỉ recommendation/error/Trip, chưa exposure); measured perf | Có catalog du lịch licensed đủ đại diện để user acceptance; CF quality vẫn pending nếu chưa data | Không ép CF; không auto nhận MVP khi chỉ demo synthetic |
| G3 Evaluation Ready | Snapshot/PIT/labels/lineage/splits/version/metrics/job/cancel đúng; T25–T30 và phần exposure T37 ở G3; real-vs-synthetic tách; data sufficiency và CI rõ | Real data cần cho quality readiness; technical pipeline có thể nghiệm thu fixture riêng | QUALITY_PENDING cho ML nếu chưa đủ samples; Rule vẫn hoạt động |
| G4 Selected ML | Module compatibility + full-policy paired holdout/ablations/cohort/guardrails/privacy/perf; T18–T34 đúng phạm vi | Bắt buộc real licensed/consented relevance/feedback đủ statistical power | Giữ Rule/module OFF; không buộc Context ML hoặc LTR |
| G5 Control Plane | Atomic generation/CAS, activation/rollback/revoke tests; actual audit/admin; safe rollout và operational runbook | Real traffic chỉ cần khi kết luận online uplift; không cần A/B để có rollback mechanism | Không bật experiment thiếu sample; giữ single bundle |
| G6 Agent/Trip | Scope owner duyệt, delegated auth, tool strict, no hard bypass, candidate vs schedule separation, errors/confirmation/idempotence | Demo mechanics có fixture; user utility cần evaluation riêng | Recommendation/Trip API vẫn dùng được trực tiếp, không tự thêm chatbot production |

Các gate này là nhóm acceptance kỹ thuật của master plan, **không thay P00–P04 hoặc tự cấp chữ ký**. Muốn đóng gate dự án phải đáp ứng [phase requirements](../../plan/phases/README.md), `CI_VERIFIED` đúng revision và chữ ký owner/reviewer. Agent không tự đặt ACCEPTED.

## 5. Ngưỡng đo dự kiến và cơ sở

Hard violation/privacy leak/duplicate/NaN/Infinity/invalid activation: **0**, vì là invariant đúng sai, không lấy chất lượng trung bình thay. Functional test suite:0 failure,0error; skips không được coi pass. ML numeric metric targets và sample adequacy theo [07](07-ml-training-evaluation.md#12-thiết-kế-so-sánh-confidence-và-quality-gate), không đặt accuracy90% không căn cứ.

Performance đề xuất: service p95≤800 ms, p99≤1.500 ms ở workload/hardware đã ghi, Gateway2s; warm internal p95≤500 ms là mục tiêu con, không dùng warm-only che cold latency. ML≤100 ms/module, tổng≤200 ms và reserve final≥300 ms; fallback error rate theo all requests và theo ML attempts, chủ động OFF không tính error. Ngưỡng này dựa nhu cầu UX và margin timeout hiện tại, **chưa benchmark và chưa đạt**; F-19 theo dõi lệch SLO cũ.

Protocol benchmark: pin commit/dataset/bundle/hardware/Java21/container limits, warmup riêng rồi đo ít nhất5 phút steady state và cold-start riêng. Dùng3 mức concurrency1/10/30 để khám phá saturation, không coi đó traffic sản phẩm đã đo. Ghi count, achieved RPS, p50/p95/p99, CPU/RAM/DB queries/HTTP calls/queue depth, error/fallback/zero-result slices. Kiểm subset returned items với owner data hoặc toàn bộ khi nhỏ. Một lỗi correctness dừng rollout dù latency đẹp. Không retry load run fail rồi chỉ công bố run pass; log mọi attempt ngắn trong progress.

## 6. Lệnh kiểm tra khi triển khai

Các lệnh dưới đã đối chiếu tên file/script hiện có; chúng không được chạy trong nhiệm vụ chỉ tạo tài liệu này. Chạy từ root repo với Java21/Docker phù hợp và environment disposable; không dùng credential hay DB production.

```powershell
.\backend\mvnw.cmd -B -f backend/services/intelligence-service/pom.xml verify
python backend/services/intelligence-service/test-local.py
python backend/services/intelligence-service/test-local.py --transport
python backend/platform/validate_contracts.py
```

Lệnh Maven đơn lẻ có thể skip suite DB/broker; ghi đúng run/fail/error/skip. Runner `test-local.py --transport` tạo PostgreSQL/pgvector và RabbitMQ disposable, không dựa stub để gọi DB/broker pass. New v2 fixtures/CI paths sẽ được thêm trong task code tương lai, không giả validator hiện đã hiểu v2.

FE từ `frontend/`:

```powershell
npm run test:contracts
npm run build
npm run test:gateway
npm run test:browser:ai
```

Các runner AI hiện có phải được đọc/cập nhật theo UI và contract mới trước khi dùng làm evidence; không chỉ bật cờ rồi coi test non-ai đã bao phủ AI. Môi trường có `AI_ENABLED=false` trả FEATURE_DEFERRED là đúng scope hiện tại, không phải functional recommendation pass. Không chạy `p03_gate.py --scope non-ai` rồi dùng để đóng ML gate.

## 7. Cách ghi evidence và Definition of Done

Mỗi task chỉ được nâng trạng thái theo [AGENTS](../../AGENTS.md#104-tiêu-chuẩn-một-lần-test-được-tính-là-pass): command/test name, run/fail/error/skip, commitSHA, clean/dirty,Java21/dependency thật/stub, CI runID nếu có. Ghi ngắn ngay task tại progress, không tạo evidence Markdown riêng trong thư mục này. Unit/static checks của tài liệu không là bằng chứng Recommendation pass.

DoD chung: requirement/contract đúng revision, source tests appropriate pass, không secret/PII/debug artifacts, backward compatibility rõ, migration backward/rollback plan, purpose/data retention enforceable, API/client/progress cập nhật cùng PR; riêng progress-only commit dùng `docs(progress): ...`. Owner/reviewer ký bằng xác nhận riêng, agent không ký hộ. Mẫu cho reviewer: “Tôi xác nhận task RC-G2-xx trên SHA..., CI run..., scope..., ngoại lệ...” được ghi tham chiếu ở progress, không tự điền tên người thật khi chưa có.

## 8. Kiểm tra riêng bộ tài liệu

Trước bàn giao master plan: đủ 13 file, link nội bộ resolve, source paths hiện hữu tách proposed paths, fenced JSON parse được, Mermaid syntax checked ở mức có công cụ, tổng 60 task không trùng/mất ID, dependency không cycle, effort sums khớp, năm ví dụ arithmetic/rank đúng, API field/error/retention/policy identity nhất quán. Không cài parser/render dependency chỉ để kiểm tài liệu nếu môi trường chưa có; báo rõ phần chưa render thay vì giả PASS.
