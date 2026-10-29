# Rủi ro, quyết định và điểm cần xác nhận

[Mục lục](00-readme.md) · [Hiện trạng source](01-current-state.md) · [Roadmap](06-implementation-roadmap.md). Bảng dưới là phân tích thiết kế, không là danh sách trạng thái vận hành. Issue đang mở/đã đóng và evidence duy nhất ở [progress BE mục10](../../progress_be.md#10-vấn-đề-đang-mở); không quản lý bản sao F-xx trong thư mục này.

## 1. Quyết định kiến trúc

| ID | Quyết định | Cơ sở và lý do | Hệ quả/thay thế đã cân nhắc | Cần xác nhận trước code? |
|---|---|---|---|---|
| D01 | Unified Modular Recommendation, một pipeline | Người dùng chốt trong đề bài29/10/2026 | Từng scorer thay Rule/ML độc lập, không xây hai engine riêng | Không hỏi lại kiến trúc chính thức |
| D02 | Intelligence owner; không thêm microservice | Source có domain/lifecycle/DB/outbox/worker ở Intelligence | Reuse service và adapter; Python worker cùng owner nếu cần, không platform hóa sớm | Phân công N2/N1 theo plan hiện có |
| D03 | Rule MVP hoàn chỉnh trước ML production | P00 quyết định Basic trước ML; data real readiness chưa chứng minh | CF có thể OFF, Content/CF/Hybrid ML chỉ sau eval, không bật vì pipeline fixture chạy | Không thay release ML requirement nếu chưa owner quyết định |
| D04 | Strict v1 giữ; thêm `/api/v2/**` | v1 additionalProperties:false, extension tùy tiện phá contract | Adapter vào cùng pipeline; không đổi Gateway prefix convention | N1/N2 review contract version/freeze |
| D05 | v2 bắt buộc destination UUID; hard rules fail safe | Sai địa bàn/hidden/budget/time không được scorer/LLM sửa | V1 scope legacy giữ để tương thích; v2 không ngầm fallback toàn quốc | Owner chốt destination semantics/membership |
| D06 | Purpose/current consent và final fences | Projection/event có latency, canonical Identity sở hữu quyền | Unknown→không cá nhân hóa; JWT/session invalid không hạ thành guest; training cần rights riêng | Purpose policy/owner API phải duyệt |
| D07 | Hard filter trước điểm và final Catalog hiện hành | ML/LLM có thể rank sai, projection stale | Endpoint Catalog v2 validation được đề xuất; mismatch drop/recompute bounded; outage503 | Owner Catalog contract/hard evidence |
| D08 | Weighted Hybrid làm default, Learned optional | Dễ giải thích/test, data ít và score scales khác nhau | Calibration/version/masks; learned model không mặc định tốt hơn | Weights/prior là benchmark targets |
| D09 | CF item-item Rule trước ALS/LTR | Reuse implicit events nhưng support/review rating wire còn thiếu | Không giả review5sao; OFF khi cold/sparse; explicit CF cần owner snapshot | Support/quality gate và rights được chốt |
| D10 | Một UUID mỗi immutable policy bundle; active slot generation riêng | Tránh trộn semantic model version, target lifecycle và deployment concurrency | New UUID khi đổi module; CAS pointer+history+audit atomic; v1 admin không bypass | Control-plane API schema review |
| D11 | Dataset PIT/temporal split, exposed feedback, synthetic tách real | Current fixture trainer dùng public rating-derived labels | Mechanics success không đủ quality, no future features leak, offline không causal | Label horizon/benchmark cohort real |
| D12 | Artifact private, checksum, module/input/calibration signature | pgvector3 và SGD fixture không là semantic/CF/LTR deployable | PREPARE_PRETRAINED ghi provenance thật; không fake training, không arbitrary code import | Model/license/runtime choice qua benchmark |
| D13 | Request không là impression; signed exposure token | Chống giả click/attribution/replay; không dùng result row làm exposure | OFF/noanalytics không token; click trước impression retryable precondition | Purpose grants/UI consent |
| D14 | Agent tool không chọn strategy, không viết DB | Ranking và canonical business rules thuộc service owners | Draft schedule cần validator khác; Trip write yêu cầu quyền và user confirmation | Agent provider/owner/scope chưa có runtime |
| D15 | Module budget chung dưới Gateway deadline | Code deadline3s khác Gateway2s, SLO cũ lệch | Đề xuất1500 ms tổng,100 ms/module,200 ms ML tổng,reserve300 ms,p95800 ms | Cần benchmark, không tự gọi SLO đã đạt |

## 2. Rủi ro và biện pháp thực tế

| Rủi ro | Tác động/cách nhận biết | Giảm thiểu | Nhóm task/test chịu trách nhiệm |
|---|---|---|---|
| Cold-start user/item | CF không score hoặc head items lặp; no-history coverage thấp | Request-only Content/Baseline prior, CF OFF; đo cold slices riêng, không random user factor | G2-01/02/03,T12–T14 |
| Data sparsity | Similarity từ 1 user, train/test rất nhỏ, confidence rộng | Distinct support/shrinkage, threshold benchmark, temporal holdout, QUALITY_PENDING | G2-03,G3-04/10,G4-03 |
| Thiếu dữ liệu training | Dataset build thành công nhưng không nhãn thật | Inventory count/purpose/license; public pretrained Content eval trước, không ALS/LTR cưỡng ép | G1-01,G3-10,G4-01 |
| Popularity bias | Catalog head chiếm exposure/CF self-reinforce, tail coverage giảm | Log-normalize/smoothing, head-tail metrics, ablation, diversity bounded, exploration chỉ có consent | G2-01/04/05,G3-06 |
| Data leakage | Dùng current rating cho lịch sử, cùng request qua2split, later event lọt cutoff | PIT+received cutoff, temporal embargo, immutable group split, future-item exclusion | G3-03/05,T28/T30 |
| Feedback loops/position bias | Model học thứ tự model cũ thay taste thực | Exposure thật, logged policy/rank, no shadow impressions; không coi unseen là dislike; IPS chỉ có propensities đúng | G3-01/04,G5-08/09 |
| Place data quality | Wrong destination/timezone/price/closure; empty sau hard filter | Per-field evidence/provenance, Catalog owner contract, licensed dataset curation; unknown fail safe | G1-04/08,G2-05,T01–T08 |
| Consent/privacy | Delayed revoke, cross-user data, loggingGPS/query/token | Current purpose/fence, no-consent request-only, purpose-minimal storage, purge lineage/model, token binding | G1-05/11,G3-02,G4-09,T21–T25 |
| Model drift | Metric giảm theo mùa/địa bàn, support mới khác train | Slice metrics/score/fallback, delayed-label window, freeze/challenger review; Rule remains | G4-07,G5-06/08/10 |
| Feature drift | Category dictionary đổi, embedding dim/calibrator khác, missing tăng | Schema/hash/version checks, compatibility manifest, no mixedvectorindex, rollback eligible | G1-09,G3-08,G4-02/06,T17 |
| Inference latency/OOM | Request qua Gateway timeout, thread pool không hồi phục | Bounded executor/deadline/cancel/circuit breaker, precompute, budget reserve, model cap | G2-07,G4-02/04,G5-10,T19/T40 |
| Microservice availability | Catalog/Identity down, retry chain nhân thời gian | HTTP bounded, local projection+freshness, consent unknown OFF; Catalog final down503, no stale public fallback | G1-05/07,G2-05/07,T20/T21 |
| Chi phí ML vận hành | GPU/storage/deps phức tạp vượt đồ án | Start Java Rule+DB, optional small CPU encoder/ALS, private artifacts, reuse worker; no managed platform requirement | G3-09,G4-01/08,G5-10 |
| Trùng logic/pipelines | Filter Rule khác ML/Agent, contract kiểm hai lần không đồng nhất | One pipeline shared invariants, v1/v2 adapters; Agent gọi API, no duplicate ranking in prompts | G1-03,G2-05,G6-03/07 |
| Overengineering | Registry/plugin/service abstractions nhiều hơn use case | Map registry/MVP config; G5 optional advanced; no DSL/plugin loader/FeatureStore service | G1-10,G5-01/02,D02 |
| Fallback không tương thích | Content Rule fallback vào Learned được train bằng ML, mask khác | Input signature, calibrator/version pin, Weighted certified fallback; test timeout chain | G2-07,G4-06,G5-04,T18 |
| Score calibration | Raw dot/logit/cosine khác scale, missing bị thành0 | Fixed utility/calibrator train-only, masks/effective weights, histogram và full-policy eval | G2-04,G4-07,T16/T17 |
| Nhiều model kết hợp | Đổi một version phá full pipeline, khó tái hiện | Immutable bundle/actual trace/snapshot, atomic CAS, eval từng configuration, no all-scorer default | G3-08,G5-02/05/07 |
| Canonical ownership bị phá | Intelligence sửa user/place hoặc foreign DB JOIN | Owner APIs/events only, DB credentials scope, architecture tests/review | G1-04/05/07,T23/T38 |
| Historical rebuild thiếu log | Outbox/feature history purge sớm, không tái tạo labels | Align replay horizon, tombstones, source snapshot/watermark, occurrence keys A→B→A | G1-07,G3-02/03,T27/T30 |
| License/provenance thiếu | Public/place import cho storage nhưng không cho train; derivative invalid | Current Ingestion check, per-field source refs, conservative revoke, manual/UGC policy mapping | G1-04,G3-02/03,G4-09,T29 |
| Concurrent activate/revoke | Hai active model, serving pointer stale, rollback resurrect rights | Slot counter/CAS tx/outbox, recheck epoch trước publish, in-flight fence; old policy current valid | G5-02/05/06,T22/T32/T33 |
| Fake exposure/click | CTR cao giả, model học spam hoặc cross-user token | Signed result/session/subject/expiry token, dedup/rate, viewport policy, exposure-before-click retry | G3-01,T25/T26 |
| Misleading freshness | data_as_of=max toàn pool che feature cũ trong returned set | min conservative actual-used sources; per-stream as_of/validated_at evidence | G1-07/11,G2-06 |
| Agent hallucination/prompt injection | Bịa place, bỏ budget/hidden, gọi admin tool | Strict tool schema/delegated scope, server business validation, no directDB, no strategy override | G6-01/02/06/07,T38 |
| Candidate ≠ feasible itinerary | Top places cùng giờ nhưng không thể di chuyển/chi phí vượt trip | Trip schedule validator/routing/duration/budget check; user confirm write, Recommendation không gọi optimize sâu | G6-04/05,T39 |
| Quy tắc AI-deferred bị hiểu sai | Plan mới làm người khác bật cờ AI/đánh gate hoàn thành | Document-only scope, progress giữ trạng thái, new tasks chỉ requirements; gate có owner/reviewer | G1-01/12,G2-10,D03 |

## 3. Assumptions có kiểm soát

| Giả định để ước lượng thiết kế | Điều đã kiểm được | Nếu sai phải điều chỉnh gì |
|---|---|---|
| Quy mô đồ án có thể chạy Rule/ML nhỏ trên CPU | Runtime Java21/JDBC/worker/private volume có source | Benchmark xác định cap; không tự tăng infra hoặc hứa latency |
| Catalog có thể cung cấp hard-field contract | Canonical có nhiều trường hơn wire nhưng confidence/cost basis chưa đủ | G1-04 chốt missing/estimate semantics; capability thiếu→422/empty, không giả data |
| Có owner duyệt purpose/retention | Identity có personalization boolean+version, chưa đủ independent grants | G1-05 chốt purpose; personal training/feedback không mở trước |
| Có thể thu thập real interactions hợp lệ | Source ingestion/client/server mechanisms có; số thực chưa đo | G3-10 đánh giá từng model; giữ Rule khi QUALITY_PENDING |
| Agent không phải service thứ 7 bắt buộc | Không có orchestration tool runtime trong repo khảo sát | G6-01 quyết định provider/trusted backend trước, không tự thêm chatbot/RAG |
| Retention90/180 ngày đủ cho horizon test | Một số current retention code có nhưng chưa được duyệt toàn bộ | Điều chỉnh tables/TTL/backups/splits/replay trước rollout, giữ privacy upper bounds |

## 4. Điểm cần xác nhận trước phần triển khai tương ứng

Các mã Q là câu hỏi thiết kế, không trạng thái issue F-xx và không có checkbox hoàn thành ở đây. Câu trả lời/owner decision khi triển khai phải ghi vào progress và sửa spec tương ứng trong cùng PR.

| Q | Nội dung cần xác nhận | Đề xuất mặc định / việc vẫn làm được | Ai và trước task nào |
|---|---|---|---|
| Q01 | Báo cáo gốc SmartTravel/UC09/UC10 nằm ở đâu, phiên bản nào? | Dùng plan source mapping như nguồn thứ cấp, không xác nhận đúng bản Word chưa đọc; không map UC09=F09 | Người dùng/N1/N2, G1-01 |
| Q02 | Consent analytics/training/personalization có purpose riêng hay dùng mapping nào? | Không thu/train purpose chưa được duyệt; request OFF không telemetry định danh; public Rule làm được | Người dùng + Identity ownerN1, G1-05/G3-01 |
| Q03 | Destination scope, cost per-place/person/group, opening/accessibility confidence do ai xác nhận? | v2 destination UUID bắt buộc, VND, unknown hard exclude; không price_min=total | Catalog ownerN1 + N2, G1-04/08 |
| Q04 | Số lượng licensed real places/users/interactions/sources hiện có? | Inventory readonly counts/slices khi được cấp environment; synthetic_only không thay real | N1 data Catalog/Ingestion, N2 behavior, G1-01/G3-10 |
| Q05 | Retention/backup/purge purpose policy và current-check freshness bound nào được duyệt? | Proposed durations ở 04; deny unsafe data, preserve minimal fences; không khẳng định compliance pháp lý | Người dùng/N1/N2, G1-05/G3-02 |
| Q06 | Contract release number, compatibility window v1/v2 và event version nào? | v1 unchanged; v2 proposed, atomic consumer updates; deployed-event v1 enum giữ | N1/N2, G1-02/G5-05 |
| Q07 | Hardware/traffic mục tiêu và SLO800 ms vs1s? | Budget thiết kế1500 ms/service dưới2s Gateway; workload phải benchmark | N1 infra + N2, G2-09 |
| Q08 | ML nào thật cần cho release và quality margin nào phù hợp cohort? | Content đầu tiên đáng thử, CF/LTR chỉ đủ dữ liệu; no automatic ML superiority | Người dùng + N2 owner/N1review, G3-10/G4-01 |
| Q09 | Model license/revision, inference runtime và private artifact storage target? | CPU/offline/pretrained allowlist, worker cùng Intelligence; không cài dependency lúc lập plan | N2/N1, G3-08/G4-01 |
| Q10 | Agent provider, tool runtime, trusted backend/delegation và ranh giới schedule optimization? | G6 chỉ contract; dùng user-authorized API, draft trước confirm; no new microservice | Người dùng + N1/N2, G6-01 |
| Q11 | Reviewer thực tế và nơi lưu written approvals/CI evidence? | N2 owner Intelligence, N1review; không ký hộ; lưu refs tại progress | Điều phối/N1/N2, mọi handoff |

## 5. Quy trình review thiết kế trước triển khai

Đã dùng các vai trò khảo sát source, kiểm contract và phản biện failure modes để hoàn thiện bộ spec. Những điểm cần kiểm lại ở mọi revision: policy identity/lifecycle/active_generation riêng; pretrained preparation provenance; retention result30 ngày không cascade mất exposure90 ngày; click-before-impression không fabricate; version mismatch không hợp thức stale scores; MMR sau final filter không sort lại score; no-consent không log linked criteria.

Đây là checklist thiết kế, không là reviewer acceptance hay gate signoff. Khi thay một quyết định phải tìm toàn13 file và cập nhật công thức/API/backlog/dependencies cùng nhau. Mọi kết luận về số tests/CI/deployment vẫn chỉ ghi ở progress, không thêm report trạng thái thứ ba vào docs.

## 6. Nguồn kỹ thuật

Các thuật toán/flow là lựa chọn riêng cho SmartTravel, không trích nguồn như bằng chứng chất lượng của dự án. [Google Rules of ML](https://developers.google.com/machine-learning/guides/rules-of-ml) hỗ trợ cách xây nền tảng và mô hình đơn giản trước, đo training-serving skew; từ đó tài liệu ưu tiên Rule champion và immutable feature contracts. [Sentence Transformers documentation](https://www.sbert.net/docs/sentence_transformer/pretrained_models.html) được dùng để xem xét semantic embeddings, không để chốt model thắng trên tiếng Việt của dự án. [pgvector upstream](https://github.com/pgvector/pgvector) là tài liệu kỹ thuật cho exact/approximate vector search; việc đã có extension không chứng minh đã có learned embeddings. Chi tiết nguồn thuật toán/evaluation tại [07](07-ml-training-evaluation.md#16-tài-liệu-nguồn-đối-chiếu).
