# Thiết kế module và thuật toán

[Kiến trúc](02-architecture.md) · [Dữ liệu](04-data-design.md) · [Policy](08-ranking-policy-fallback.md) · [Ví dụ số](10-examples.md). Tất cả class, công thức và ngưỡng dưới đây là đề xuất đích, trừ phần ghi rõ legacy. Không mô tả chúng như source đã triển khai.

## 1. Quy ước input và output chung

`RecommendationContext` gồm criteria đã validate, destination scope, hard/soft flags, deadline monotonic, principal đã xác thực (chỉ application layer), consent epoch, policy bundle ID và data snapshot refs. Module chỉ nhận phần context tối thiểu cần dùng; scorer không nhận JWT/credential.

`FeatureBundle` immutable theo request, map place ID đến features và evidence: known/unknown, source/version/as_of/confidence; user preferences chỉ có khi quyền sử dụng hợp lệ. Không gộp Catalog version và rating version thành một watermark số chung. `ScoreBatch` theo [interface](02-architecture.md#5-contract-nội-bộ-tối-thiểu); score finite trong [0,1], availability mask độc lập, calibration version và reason codes. Score là utility đã version hóa, không phải xác suất trừ khi calibrator được kiểm chứng theo nghĩa xác suất.

## 2. Hồ sơ chức năng cho từng module

Hai bảng dưới tạo thành hồ sơ 15 mục: mục tiêu/trách nhiệm, input/output, flow/quy tắc, interface, quan hệ, lưu trữ, lỗi, fallback, quan sát, tests, AC và file. Đường dẫn package tương đối với Java root trong [kiến trúc](02-architecture.md#4-cấu-trúc-code-dự-kiến). U = unit, I = integration DB/HTTP/broker thật phù hợp, C = contract; tên test dưới là tên dự kiến.

| ID, mục tiêu và trách nhiệm | Input → output | Flow, quy tắc và interface | Quan hệ | File dự kiến |
|---|---|---|---|---|
| M01 API: một đầu vào nghiệp vụ, map v1/v2 | JSON + headers → context hoặc error | Schema strict, topN/currency/geo/time validation; `LegacyRecommendationAdapter`, controller v2; không tin user_id | Gọi M02 rồi M03; map kết quả M12 | Sửa `recommendations/controller/IntelligenceController.java`; thêm `controller/RecommendationV2Controller.java`, `application/LegacyRecommendationAdapter.java` |
| M02 Auth/Consent: quyết định quyền đọc và ghi dữ liệu | JWT/guest + Identity state → permitted context + fence | Verify JWT/session/scope; đọc version current, fail safe request-only khi consent lookup lỗi, JWT/session lỗi vẫn 401/503; `ConsentResolver.resolve` | M01, M04, M05, M11, M13 | Thêm `recommendations/application/ConsentResolver.java`; sửa `security/config/SecurityConfiguration.java`, `recommendations/client/DependencyClient.java` |
| M03 Candidate: lấy đúng địa bàn, lọc trước tính điểm | scope + constraints + pages → eligible pool + reserve | Push selective predicates vào query; paginate có keyset, tombstone; `CandidateProvider`, `HardConstraintFilter` | ProjectionRepository, Catalog batch, M04 | Thêm `recommendations/candidates/*`; sửa `recommendations/repository/BasicRepository.java`, `projections/repository/ProjectionRepository.java` |
| M04 Features: tạo đặc trưng đúng schema và quyền | candidates + request criteria + permitted preferences → FeatureBundle | Join dữ liệu local bounded; missing flags, freshness; không HTTP per item; `FeatureBuilder.build` | M02/M03 và M06–M10 | Thêm `recommendations/features/FeatureBuilder.java`, `domain/FeatureBundle.java` |
| M05 Policy/Registry: chọn module khả dụng | immutable bundle + features + consent + budget → execution plan | Allowlist, model/feature/calibrator/support checks; `RankingPolicy.select`, `StrategyRegistry.resolve` | M06–M10, M14 | Thêm `recommendations/ranking/RankingPolicy.java`, `StrategyRegistry.java`; thêm `models/registry/ModelRegistry.java` |
| M06 Baseline: cold-start/public anchor | public aggregate features → score batch | Bayesian rating + bounded popularity/trend, missing renorm; `Scorer.score` | M04, M09 | Thêm `recommendations/ranking/baseline/BaselineRuleScorer.java` |
| M07 Content: khớp ý định/sở thích | request/preference vector + place vector → scores | Rule category/tag cosine; ML adapter optional; `Scorer.score` | M04/M05/M09/M14 | Thêm `ranking/content/ContentRuleScorer.java`, `ContentMLScorer.java` |
| M08 Collaborative: dùng cộng đồng có consent | eligible implicit matrix/explicit authorized snapshot → scores | Item-item mặc định; user-user tham chiếu; support shrinkage; ML ALS optional | M04/M05/M09/M13/M16 | Thêm `ranking/collaborative/CollaborativeRuleScorer.java`, `CollaborativeMLScorer.java` |
| M09 Hybrid: kết hợp đúng thang điểm | ScoreBatches + masks → ranked utility | Weighted renorm; learned input signature; stable tie place_id; `Ranker.rank` | M06–M08, M10 | Thêm `ranking/hybrid/WeightedHybridRanker.java`, `LearnedHybridRanker.java` |
| M10 Context: xử lý điều kiện chuyến đi và diversity | ranked + hard/soft context → eligible reordered | Hard rules giữ nguyên; soft utility + bounded MMR; `ContextReranker.apply` | M03/M09/M11 | Thêm `recommendations/context/ContextReranker.java` |
| M11 Final Validation: xác nhận trước xuất kết quả | ranked reserve + source/consent versions → validated list | Catalog batch current version, consent recheck, dedup/finite/eligibility, refill bounded; `FinalValidator.check` | Catalog/Identity, M12 | Thêm `recommendations/validation/FinalValidator.java`; sửa `recommendations/client/DependencyClient.java` |
| M12 Top-N/Explanation: phản ánh đúng lý do | validated + actual module trace → response | Round khi hiển thị sau sort; reason templates có evidence, không LLM invent; `ExplanationBuilder.build` | M01/M11/M13 | Thêm `recommendations/explanation/ExplanationBuilder.java`, `domain/ReasonCode.java`; sửa persist hiện tại |
| M13 Audit/Feedback: ghi exposure và tín hiệu hợp lệ | permitted decision + token/event → audit/receipt | Request ≠ impression; server signed tokens + dedup; `FeedbackCollector.accept` | FE, M02/M12/M16 | Thêm `feedback/controller/FeedbackController.java`, `service/FeedbackCollector.java`, `repository/FeedbackRepository.java`, `recommendations/repository/RecommendationAuditRepository.java` |
| M14 Model Inference: chạy artifact tương thích có hạn | pinned handle + matrix → raw scores hoặc typed failure | Checksum/schema/warmup/bounded execution; `ModelInferenceAdapter.infer` | M05/M07/M08/M09, ArtifactStore | Thêm `models/inference/ModelInferenceAdapter.java`; sửa `models/artifacts/ArtifactStore.java` |
| M15 Training Worker: xây model từ snapshot hợp lệ | queued job + dataset/params/seed → artifact + job state | Claim lease, verify policy, train/cancel/resource caps, atomic write; `TrainingWorker.run` | ModelRepository/ArtifactStore/M16 | Sửa `models/service/ModelWorker.java`, `models/repository/ModelRepository.java`; thêm `models/training/TrainingWorker.java` |
| M16 Evaluation: đánh giá không leakage và đăng ký kết quả | dataset split + baseline/candidate bundle → immutable metrics | As-of features, eligible candidates, paired slices/CI, quality decision; `EvaluationPipeline.evaluate` | M13/M15/M05 | Thêm `models/evaluation/EvaluationPipeline.java`, evaluation repository/controller |

| ID | Dữ liệu cần lưu | Lỗi và fallback | Logging/monitoring | Tests U/I/C và Acceptance Criteria |
|---|---|---|---|---|
| M01 | Chỉ context sanitized theo consent | 400 sai schema, 401 JWT sai, 429 rate; không sửa input âm thầm | validation code, latency, correlation ID; không raw body | U `RequestValidationTests`; C v1/v2 strict; I Gateway route/AI-off; v1 unchanged, user_id bị reject |
| M02 | Consent projection, monotonic fences, permitted audit | Identity unavailable: tắt personalization, không tắt xác thực; revoked: request-only recompute; session unverifiable không cho user identity giả | consent downgrade count/reason, không log token | U stale revoke; I Identity down/revoke concurrent; C event version; không history khi OFF |
| M03 | Projection/checkpoint, không ghi canonical | Query timeout: eligible cached public pool chỉ khi final revalidate; malformed hard data: loại; không đủ candidates trả thiếu N | counts theo filter, truncation, pagination/freshness lag | U scope/budget/unknown, I >1.000 nơi eligible cuối trang, C owner batch; không sai địa bàn/hidden |
| M04 | Cache features có schema/epoch; user cache hết hạn purge | Missing = mask; không impute hard evidence; feature schema sai reject scorer | missing/confidence ratio, schema mismatch | U vector known/unknown/zero norm; I independent streams; C bundle schema; tái lập với cùng snapshot |
| M05 | Policy/version/active deployment/audit | Invalid bundle reject; ML ineligible → Rule/OFF; registry permission unknown → public plan | chosen/attempted/used, selection reason, low-cardinality counters | U eligibility/signature; I CAS concurrency; C policy; một request một bundle |
| M06 | Aggregates có windows/version, code/config version | No reviews → prior; pop/trend missing renorm, mọi metric missing → neutral deterministic | component availability + hist score, confidence | U Bayesian/log/trend/extreme counts; I snapshot aggregate; C ScoreBatch; không NaN, không gọi model |
| M07 | Dictionary/IDF/model/calibrator version; preference canonical không ở đây | Empty request/preferences → unavailable; ML timeout → Rule, rồi OFF | rule/ML distribution, fallback, OOV | U cosine sample; I adapter timeout; C same score schema; request-only không chạm user profile |
| M08 | Matrix/similarity snapshot lineage; factors khi ML | Sparse/cold/OOV → Rule nếu support, nếu không OFF; không fake neighbors | eligible user/item coverage, support, drift, không neighbor IDs public | U similarity shrink; I dedup/source event; C explicit snapshot nếu thêm; sparse không activate CF |
| M09 | Config/calibration/evaluation signature + effective weights | Learned signature mismatch → Weighted; no scores → neutral baseline hoặc empty | missing masks, weights, score histogram, ablation metrics | U arithmetic/zero denominator/tie; I failed scorer; C schema; không cộng raw logits với cosine |
| M10 | Context cache TTL/provider/source confidence; không lưu GPS thô vào log | Weather missing bỏ soft factor; hard hours unknown loại; không đổi hard thành soft | drop reason, soft factor availability, diversity | U timezone/overnight/closure/currency/MMR; I provider outage; C opening extension; invariant vẫn giữ |
| M11 | Version refs/validated_at; consent epoch dùng | Catalog unavailable → 503; changed place loại/hydrate một lần; no budget không bỏ validate | validated/drop/refill count, final HTTP time | U exact-version; I hide/revoke mid-flight/page2 fail; C Catalog response; không trả unvalidated item |
| M12 | Response/results permitted, algorithm/policy actual | Không evidence → reason trung tính; không bịa weather/rating; map legacy string | zero/partial results, reason counts | U explanation evidence; I v1/v2; C string vs object; score hiển thị khớp sort và provenance |
| M13 | requests/results, permitted impressions/feedback, idempotency | Token sai/khác subject →403; expired→410; duplicate same hash→same receipt; revoke→không ghi personal | accepted/rejected/duplicate counts; không raw search text | U token binding; I viewport exposure + dedup; C feedback v2; không double count server actions |
| M14 | Private artifact/hash/compatibility manifest; ephemeral loaded cache | Corrupt/OOM/timeout → typed failure cho policy; không unsigned remote code | inference/warmup/error by module version | U shape/finite/hash; I killed adapter; C matrix signature; release resource sau deadline |
| M15 | Job lease/heartbeat/params/log ref/checksum/artifact/lineage | Cancel/revoke dừng worker, không publish artifact partial; crash→lease recover; retry attempt mới có audit | queue wait/runtime/fail/resource cap | U state transitions; I worker kill/restart/cancel; C job API; không serving training chưa eval |
| M16 | Dataset/evaluation immutable result + split manifests | Missing labels/sample size insufficient→QUALITY_PENDING, không pass; bad snapshot→FAILED | slice sample sizes, confidence intervals, eval runtime | U metric exact values; I temporal backfill/revocation; C evaluation result; synthetic không đóng real quality gate |

## 3. BaselineRuleScorer

### 3.1. Công thức đề xuất `br-1`

Rating dùng Bayesian prior để 1 review 5 sao không lấn át place có nhiều review tốt:

`R_i = (sum_i + m*C) / (count_i + m) / 5`, với `m=20`, `C=3,5` điểm sao, `sum_i` chỉ APPROVED review. Đây là prior khởi tạo để benchmark, không phải trọng số được học. C có thể tính từ train snapshot toàn vùng nhưng không dùng tương lai; m,C đóng băng theo version. `count=0` thì R=0,7, confidence thấp, không giải thích là được đánh giá tốt. Rating invalid (`sum >5*count`, âm, không finite) bị loại component và tạo data alert.

Popularity dùng unique consenting users hoạt động trên item trong 30 ngày, cap mỗi user/item/day để hạn chế spam: `P_i=min(1, ln(1+u30_i)/ln(1+Q95_u30))`. Q95 từ snapshot có version, tối thiểu 1; không tính percentile lại trên candidate request. No consent analytics thì popularity chỉ dùng aggregate được phép, không lấy log cá nhân bất hợp lệ. Aggregate public rating vẫn dùng được.

Trending đo tăng trưởng, không cộng lại nguyên popularity: `g_i=(u7_i+5)/(u_prev7_i+5)`, `T_i=clamp((g_i-1)/2,0,1)`. Hai window không chồng lắp, mốc cutoff cố định. Smoothing 5 hạn chế bùng nổ từ 0; vẫn cần minimum support đề xuất 10 unique users/current window trước khi T khả dụng. Trending missing không coi là 0, còn g≤1 là T=0 hợp lệ. Không gọi nó là dự báo xu hướng.

`B_i=(0,5*aR*R_i + 0,3*aP*P_i + 0,2*aT*T_i)/(0,5*aR+0,3*aP+0,2*aT)`.

Ví dụ count=5, sum=23: R=(23+70)/25/5=0,744. u30=99, Q95=999: P=ln100/ln1000=0,666667. u7=25, prev7=5: g=3, T=1. B=0,372+0,200+0,200=**0,772**. Nếu trend thiếu: B=(0,372+0,200)/0,8=**0,715**. Nếu cả pop/trend thiếu: B=0,744. Không được cộng bonus full confidence cho prior-only item.

### 3.2. Cold-start, fallback và đánh giá

User mới dùng Baseline theo destination/request criteria. Place mới dùng prior và content; không giả rating=5 hay popularity cao. Mọi aggregate thiếu: baseline utility neutral 0,5, reason `PUBLIC_DATA_LIMITED`, tie UUID ổn định; chỉ dùng candidate đã qua hard validation. Golden tests n=0/1/large, zero Q95, counts âm, equal score. Chất lượng so ranking chỉ theo rating và theo popularity trên cùng eligible pool; báo coverage/new-place exposure và mức độ thiên lệch head/tail. Formula mới khác legacy Bayesian 10 pseudo-reviews; phải có algorithm version mới, không sửa lịch sử decision cũ.

## 4. ContentRuleScorer và ContentMLScorer

### 4.1. Rule features và cosine

Dictionary version gồm category UUID/tag UUID canonical còn active. Place vector nối block category/tag; tags và category phải phân biệt namespace dù tên trùng. User vector là request interests trước, stored preference chỉ dùng khi personalization enabled. V1 category_ids là hard filter; v2 giữ category_ids hard và có thể thêm preference tags trong revision schema tương lai, không lén biến hard filter thành preference.

Trong `cr-1`, category block weight 2, tag block weight 1; nhân vector mỗi block với căn bậc hai weight để dot product áp đúng weight một lần. Optional IDF `ln((N+1)/(df+1))+1` fit từ train/public snapshot có version; dùng IDF=1 lúc MVP để dễ tái lập. Zero norm = unavailable, không chia 0. `C_rule=dot(u,v)/(norm(u)*norm(v))`, cả vector không âm nên score ∈[0,1].

Ví dụ vector đã weighting `u=(2,1,0)`, A=(2,0,1), B=(0,1,1): cos(u,A)=4/(√5*√5)=**0,8**; cos(u,B)=1/(√5*√2)=**0,316228**. Hai vector này chỉ là fixture minh họa sau weighting, không thêm feature giả vào canonical. Tag mới/OOV bỏ khỏi vector và log coverage; không ánh xạ UUID bằng index thay đổi tùy thứ tự đọc DB. Request-only và stored preference conflict: request intent ưu tiên; exclusion/hard category luôn cao hơn profile.

Test cosine bằng số trên, permutation dictionary không đổi kết quả, zero vector/missing/outdated taxonomy, no-consent chỉ request vector. Quality: manually judged request/place relevance theo địa bàn; content NDCG/coverage/cold item, rồi full Hybrid/context. Không dùng synthetic preference tự sinh theo cùng tag rule làm bằng chứng learned model tốt hơn rule.

### 4.2. ML thay thế từng module

Content ML có thể thử pretrained multilingual sentence encoder trên description/category/tag đã cấp phép, không dùng review text hoặc dữ liệu private mặc định. Query vector từ intent được phép; user embedding từ history chỉ khi có consent. Cosine âm không clamp tùy tiện nếu calibrator được train cho miền [-1,1]; dùng calibrator frozen về [0,1], ghi distribution. Embedding dimension/version phải có cột/table mới, **không ghi 384/768 chiều vào `vector(3)` hiện tại**. Không chốt model chỉ dựa kích thước/leaderboard; thử mô hình có license và tiếng Việt, pin revision/tokenizer/dim/normalization.

Activate khi content-specific eval và full candidate policy đạt gate, p95/resource/coverage hợp lệ; compare cùng candidate pool với cr-1. Inference timeout/hash/schema/OOV nghiêm trọng → cr-1; learned hybrid tương thích được kiểm lại. Chi tiết train/eval tại [ML](07-ml-training-evaluation.md), không có yêu cầu bắt buộc fine-tune khi dữ liệu ít.

## 5. CollaborativeRuleScorer và CollaborativeMLScorer

### 5.1. Tín hiệu và quyền

Client SEARCH không có place không vào matrix item; PLACE_VIEW weight 1. Favorite đang active weight 3; APPROVED review intent weight 2; Trip item added weight 4. Các weight này là đề xuất benchmark, không hàm ý cảm nhận thực sự. Review event hiện không chứa sao: không suy rating=5, phải thêm owner contract cho explicit rating nếu muốn dùng. View, favorite, review, Trip của cùng người không được tạo thành bốn người dùng. Favorite remove cập nhật state active về 0, không thêm negative count vô hạn. Review reject/hidden xóa đóng góp tương ứng; trip add không có nghĩa visit completed. Negative explicit 1–2 sao cần schema riêng và signed producer provenance; không cộng thành positive intent.

Đề xuất implicit strength `x_ui = Σ_t w_t * capped_count_ui,t * exp(-age_days/60)`, cap theo user/item/type/day, strength cao tối đa 10 trước transform. `h_ui = min(1, ln(1+x_ui)/ln(11))`. Favorite dùng state thời điểm cutoff thay raw add/remove sum. Không có tương tác không phải dislike. Cả matrix, similarity và factors truy được consent epoch/lineage để invalidation; không coi factor/embedding là đã vô danh.

### 5.2. Similarity rule

Item-item là mặc định quy mô đồ án, precompute neighbors thay vì scan toàn matrix mỗi request:

`sim_raw(i,j)=Σ_u h_ui*h_uj/(sqrt(Σ_u h_ui²)*sqrt(Σ_u h_uj²))`.

`sim(i,j)=sim_raw(i,j)*n_ij/(n_ij+λ)`, `λ=10` dự kiến; n_ij là số user consenting distinct có cả hai item. Candidate i có score `CF_ui=Σ_j sim(i,j)*h_uj / Σ_j sim(i,j)` với j là item user đã có lịch sử hợp lệ. Chỉ dùng neighbors có n_ij≥3, tối đa 50 neighbor/item, ít nhất 3 neighbor usable/request là support gate kỹ thuật dự kiến. Ngưỡng 3/50 không đảm bảo chất lượng: G3 phải đo support distribution và quality real.

Ví dụ h ở hai history item là 1 và 0,5; similarity sau shrink là 0,6 và 0,3: CF=(0,6*1+0,3*0,5)/(0,9)=**0,833333**. Chỉ hai neighbor trong ví dụ phép tính; với policy tối thiểu 3 neighbor thì ví dụ này **chưa đủ eligibility**, phải thêm neighbor thực/đặt fixture policy riêng để kiểm công thức, không lách gate production. Trong ví dụ E2E, scores CF giả định đến từ snapshot đã đủ support.

User-user là lựa chọn đối chứng: cosine trên h vector user, shrink theo số item overlap; weighted score từ top-k user neighbors, privacy không lộ neighbor identity. Không chạy cả item-item và user-user mặc định để tránh phí/double counting; chọn theo evaluation và version. User/item mới, zero norm, quá ít overlap → CF unavailable, Weighted renorm Baseline/Content. Với user đã lưu favorites nhưng không cho analytics/personalization, không dùng để suy taste trái consent.

### 5.3. Collaborative ML

Implicit matrix factorization/ALS là ứng viên khi có số user/item/pairs và temporal labels đủ đo. Objective tham khảo `Σ_ui c_ui(p_ui-x_u·y_i)² + λ(||X||²+||Y||²)`, p_ui=1 khi có tín hiệu dương, confidence theo strength; unseen có confidence thấp, không negative chắc chắn. Đây là mô hình learned factors, khác cosine similarity không training và khác linear fixture hiện có. [Bài gốc Hu–Koren–Volinsky](https://yifanhu.net/PUB/cf.pdf) là cơ sở thuật toán; hyperparameters, gate và fallback ở đây là đề xuất riêng cho dự án.

Không giới thiệu threshold kiểu “100 user là đủ ML”. Đo density, tail coverage, holdout có relevant items, learning curves và confidence interval. Infrastructure tạo được dataset không đồng nghĩa dataset đủ chất lượng. Rollout sau quality gate; OOV user/item dùng CF Rule nếu support, nếu không OFF; không random factor cho user mới rồi trả score như có ý nghĩa.

## 6. WeightedHybridRanker và LearnedHybridRanker

Weights đầu `wB=0,2,wC=0,5,wCF=0,3`. Availability a khác zero-score. `H_i=Σ_m w_m*a_mi*s_mi / Σ_m w_m*a_mi`. B=0,7,C=0,8,CF=0,4 → H=0,14+0,40+0,12=**0,66**. CF unavailable → H=(0,14+0,40)/0,7=**0,771429**. C=0 vẫn available thì giữ weight C, không renorm để xóa điểm thấp. Tổng weight khả dụng 0 → fallback Baseline/empty, không chia 0.

Calibration: Baseline/Content Rule có thang utility cố định; CF transformed/shrunk là utility; ML raw logit/dot product cần calibrator trained **chỉ trên train/validation đúng quy trình**. Không dùng min-max current candidate batch để gộp score khác miền một cách tùy tiện. Lưu histograms, calibration version, availability mask. Nếu calibrated probabilities thì dùng reliability/Brier; nếu chỉ ranking utilities không tự gọi calibrated probability. Ties dùng utility full precision desc, sau đó UUID place asc; round 6 decimals khi trả/lưu và lưu tie key đủ để tái hiện.

Double counting: Baseline popularity và CF cùng nguồn interaction dễ trùng signal; phải ablate B-only/C-only/CF-only, B+C và B+C+CF. Không dùng rating đồng thời trong Baseline và Content Rule trừ thử nghiệm có chủ đích. Với Learned Hybrid, đưa scorer outputs + masks và ít feature context đã whitelist; tránh đưa raw popularity/rating thêm mà không kiểm redundant-feature ablation. Counteract head bias bằng diversity/coverage guardrail, không hard cap thay đổi scope không khai báo.

Learned Hybrid (LTR) học thứ tự trong group request từ impressions thực và feedback được phép, không huấn luyện bằng output công thức rồi tuyên bố tốt hơn công thức. Học pairwise/listwise cần group không chia qua train/test và exposure bias kiểm soát. Inference raw ranking score có calibrator/utility mapping nếu API đòi [0,1]. Model signature phải ghi versions/masks scorers; thiếu scorer hoặc đổi calibration → fallback Weighted trừ khi đã train/eval đúng mask đó. [Training/evaluation](07-ml-training-evaluation.md) quy định quality gate toàn pipeline, không scorer đơn lẻ.

## 7. Context-aware chung

| Context | Hard khi | Soft khi | Missing/stale/confidence policy |
|---|---|---|---|
| Destination | v2 bắt buộc destination_id hợp lệ, membership canonical tại Catalog | Không có soft “gần đúng tỉnh” để thay destination | Không suy địa bàn bằng chuỗi tên/GPS gần; thiếu membership loại |
| Geography | location+radius explicit hoặc required accessibility region | Distance preference nếu user chỉ muốn gần | Location triple thiếu/malformed→400; thiếu coords trong hard radius→loại |
| Budget | Request budget per-place currency VND | Ưu tiên rẻ khi không đặt hard cap | Unknown/currency mismatch loại nếu hard; price_min không đảm bảo tổng visit cost, cần owner estimate/confidence |
| Time/hours | `visit` hoặc `open_now` yêu cầu mở trong cả interval | Ưu tiên thời điểm thuận lợi | Unknown timezone/holiday exception/overnight interval→loại khi hard; không giả open |
| Weather | Owner có closure/safety status authoritative áp vào visit interval | Mưa làm outdoor kém phù hợp, indoor tốt hơn | Forecast thiếu/cũ bỏ soft weight, không tự bịa “an toàn”; chưa provider ngoài scope MVP |
| Party | mobility_required hoặc user explicitly requires child-safe/access | Phù hợp gia đình/nhóm | Không có evidence accessibility không coi true; loại khi hard, ghi giới hạn |
| Diversity | Không phải lý do phá hard constraints | Giảm trùng category/tag trong Top N | Chỉ chọn trong eligible pool; unknown similarity không mặc định cùng/khác hoàn toàn |
| Confidence | Published và hard field phải đủ evidence theo contract | Soft data confidence tăng reliability | Mỗi field có source/as_of, không dùng một global confidence che missing hard data |

Budget v2 định nghĩa là **chi phí một lượt địa điểm**, không phải ngân sách cả trip. `price_min` legacy chỉ là lower bound nên chưa chứng minh affordable; G1 phải chốt `estimated_visit_cost`/basis/person count và unknown policy. Place free cần evidence giá 0; null khác 0. v1 giữ semantic legacy có version, không âm thầm nâng lời hứa.

Time: tính UTC interval từ request có offset, chuyển sang IANA timezone canonical của place; kiểm cả ngày nghỉ, holiday exceptions, xuyên nửa đêm, khoảng visit không chỉ thời điểm bắt đầu. `open_now` pin server now một lần/request, không mỗi item mỗi now. Nếu cả visit và open_now=true: reject 400 để tránh mơ hồ; các test DST dành timezone fixture dù nơi hiện tại dùng Asia/Ho_Chi_Minh. Không chuyển timezone bằng client free text không validate.

Soft context minh họa `S_i=(1-γ)H_i+γ*Ctx_i`, γ=0,1; Ctx là weighted mean available soft features [0,1], có mask. Không đủ soft feature thì S=H, không phạt item vì missing weather. Distance soft = max(0,1-distance/D_soft), nếu D_soft>0. Hard radius chỉ quyết định pass/fail, không cộng utility. Soft proximity có thể chạy trong radius nếu policy version công khai default này hoặc user đã chọn gần hơn; chỉ cộng distance utility một lần, không cộng lại distance trong Baseline/Hybrid rồi Context. Năm ví dụ dùng policy default proximity explicit, không tự suy người dùng đã gửi một preference field ngoài schema.

Diversity greedy MMR sau soft score: chọn item maximizing `0,9*S_i - 0,1*max_j similarity(i,j)`, j đã chọn; item đầu max S. Similarity Jaccard category/tag trên dictionary version, không dùng embeddings của model revoked. MMR là **selection utility**, API score vẫn S và final rank có thể khác score descending; response/audit nêu rerank version và rank explicit. Trong ví dụ số dùng diversity weight 0 để tách phép tính; test riêng MMR. Stable ties UUID, no duplicate, chỉ within eligible scope. Diversity không bảo đảm có mỗi loại nếu candidate không đủ.

## 8. Candidate retrieval và refill

Legacy query lấy 1.000 ID trước filter có thể bỏ sót place hợp lệ. Đề xuất query scope/status/category/currency/known hard fields trước, spatial bounding box rồi distance exact, keyset pagination. Fetch tối đa 500 eligible cho MVP như resource budget đề xuất cần benchmark; nếu vẫn truncation ghi flag, đo eligible recall và quality (không gọi đó full catalog ranking). Index phù hợp tại [data](04-data-design.md). Không gọi HTTP mỗi candidate để lấy features; final Catalog batch giới hạn 100 như hiện có.

Refill khi final validator loại item: lấy reserve đã score theo cùng bundle, final-validate batch tiếp theo; tối đa một retrieval pass bổ sung trong deadline. Không nới radius/budget/destination không có yêu cầu mới. Unknown hard evidence không được scorer/Agent biến thành soft để đạt topN.

## 9. Checklist thiết kế trước khi code

Chốt schema owner và hard-field evidence; thống nhất prior/weights bằng config version; giữ v1 golden; viết ScoreBatch contract test chạy chung tất cả scorers; CF sparse phải OFF; derive effective weights/log thực dùng; final validate Catalog/consent luôn chạy; công bố benchmark và quality pending trung thực. Backlog [G1/G2](11-implementation-backlog.md) cung cấp file, dependency, test và DoD cho từng phần.
