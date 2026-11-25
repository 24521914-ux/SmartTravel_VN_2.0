# Recommendation Ranking — Technical Specification, Runbook & Handoff

Tài liệu vận hành và kỹ thuật cho phân hệ **Hybrid Recommendation Ranking (B/C/F/X)** trong SmartTravel Việt Nam (`intelligence-service`, `api-gateway`, `/goi-y`, `/quan-tri`).

---

## 1. Kiến trúc & Quyền sở hữu dữ liệu

| Thành phần | Quyền sở hữu | Giao tiếp với Recommendation |
|---|---|---|
| **Intelligence (`intelligence-service`, cổng 8106)** | `intelligence` schema (PostgreSQL): `place_features`, `user_feature_profiles`, `interactions`, `recommendation_requests`, `recommendation_results`, `ranking_config_versions`, `cohort_stat_snapshots`, `cf_build_jobs`, `cf_artifacts`, `ranking_deployments`, `eval_datasets`, `eval_judgments`, `evaluation_runs`, `tuning_jobs`, `tuning_trials`, `recommendation_impressions`, `recommendation_feedback` | Sở hữu toàn bộ ranking engine, artifact checksum, evaluation và telemetry |
| **Catalog (`catalog-service`, cổng 8102)** | Canonical Place/Destination/GeographicUnit/Category/Tag/OpeningHours/Price | Cung cấp snapshot `/internal/v1/places/features-snapshot`, event `catalog.place.*`, và batch final visibility `/internal/v1/places/validate` (fail-closed) |
| **Identity (`identity-service`, cổng 8101)** | User, RBAC, Preferences, Consent, Deletion | Cung cấp JWT/JWKS, `/internal/v1/users/preferences/snapshot`, `identity.preferences.changed.v1`, `identity.user.deletion-requested.v1` |
| **Community (`community-service`, cổng 8103)** | Review (approved), Rating summary, Favorite | Cung cấp `/internal/v1/ratings/snapshot`, `community.rating-summary.changed.v1`, `community.favorite.changed.v1` |
| **Trip (`trip-service`, cổng 8104)** | Trip, Day, ItineraryItem | Nhận `recommendation_request_id` khi thêm item; phát `trip.item.added.v1` để ghi attribution server-side |
| **API Gateway (`api-gateway`, cổng 58080/8080)** | REST entry point, JWT exchange, CORS, `AI_ENABLED` gate | Route `/api/intelligence/**` (cần `AI_ENABLED=true` khi bật ranking backend) |

**Không join chéo DB.** Mọi dữ liệu từ service khác đi qua projection có version (`inbox_events` + `projection_versions`) hoặc internal API có deadline.

---

## 2. Công thức Scorer, Normalization & Chính sách Missing Data

### 2.1. Tầng 2 — Hybrid Combiner (`hybrid_v1`)
$$
H(u, i, q) = \frac{w_B a_B B + w_C a_C C + w_F a_F F + w_X a_X X}{w_B a_B + w_C a_C + w_F a_F + w_X a_X}
$$
- **Trọng số khởi tạo engineering (chưa tối ưu, trạng thái `UNVALIDATED`):** `wB = 0.20`, `wC = 0.45`, `wF = 0.10`, `wX = 0.25`.
- **Ràng buộc:** mọi `w >= 0` hữu hạn, tổng `> 0`, chuẩn hóa về tổng `1`.
- **Thiếu dữ liệu (`a = 0`):** không đóng góp tử số hay mẫu số; không bao giờ thay bằng `score = 0`.
- **Mẫu số bằng 0:** chuyển sang `PUBLIC_DISCOVERY_FALLBACK` (thứ tự ổn định theo số lượng rating đã duyệt giảm dần, tie-break canonical `place_id` tăng dần; không bao giờ nới lỏng hard filter hoặc visibility; `personalized = false`).
- **Tie-break ổn định:** giảm dần theo `finalScore`, bằng nhau thì tăng dần theo `place_id` (UUID string).

### 2.2. Tầng 1 — Các Scorer Độc Lập

1. **Basic (`basic_v1`)**: `B = weightedMean(RatingScore [0.60], PopularityScore [0.40])` trên thành phần khả dụng.
   - **Rating:** `RatingAdjusted = (n * r + m * mu) / (n + m)`, `RatingScore = clamp((RatingAdjusted - 1) / 4, 0, 1)`, mặc định `m = 10`. Prior `mu` lấy từ `cohort_stat_snapshots` theo thứ tự `dest+cat -> dest -> cat -> global` với `min_sample = 5` (không tính lại theo từng request). Khi `n = 0`: dùng prior nếu cohort đạt mẫu (`RATING_PRIOR_ONLY`), ngược lại `NO_PRIOR_SAMPLE`.
   - **Popularity:** `p` = số user khác nhau có favorite hoặc add-to-trip đang hiệu lực trong 30 ngày gần nhất (hủy favorite không còn tính). `P = min(1, log1p(p) / log1p(p_ref))` với `p_ref` là phân vị 95% trong cohort snapshot. Phân biệt: item đủ thời gian quan sát nhưng `p=0` (`score=0`, available) vs item mới trong cửa sổ quan sát 7 ngày (`NEW_ITEM_OBSERVATION_WINDOW`) vs pipeline chưa có dữ liệu (`PIPELINE_INACTIVE`) vs `p_ref <= 0` (`NO_POPULARITY_REF`).
2. **Content (`content_v1` — Không vector/embedding)**:
   - Nguồn: `soft_preferences` trong request (ưu tiên) + `user_feature_profiles` (chỉ khi user có consent và không mâu thuẫn). Không chấm lại điều kiện đã lọc cứng.
   - `C = Σ [w(t) * match(t, item)] / Σ w(t)`.
   - Metadata `unknown` giữ riêng với `false`, không cộng điểm nhưng **vẫn giữ trong mẫu số** để item thiếu metadata không được lợi; lưu `known_feature_coverage` và `unknown_fields`.
   - Không có soft preference → `NO_SOFT_PREFERENCES`. Không có thuộc tính nào được xác minh → `NO_VERIFIED_ATTRIBUTES`.
3. **Item-based Collaborative Filtering (`cf_item_v1`)**:
   - Builder: ma trận nhị phân `x[u,i] = 1` từ favorite/add-to-trip hợp lệ trước `cutoff_at`. Cosine có shrinkage `sim_adjusted(i,j) = sim(i,j) * n_common / (n_common + lambda)` (`lambda = 10`, `topK = 100`, không self-neighbor, an toàn zero-norm).
   - Serving: `h(u,j)` = 3 (favorite), 5 (add-to-trip), cả hai = `max(3, 5) = 5`. `F(u,i) = Σ_j [h(u,j) * sim_adjusted(i,j)] / Σ_j h(u,j)` (mẫu số gồm toàn bộ lịch sử được chọn).
   - Unavailable khi: `CONSENT_DENIED`, `ARTIFACT_MISSING`, `ARTIFACT_NOT_ACTIVE`, `NO_USER_HISTORY`, `NO_ITEM_SUPPORT`. Item có support nhưng không trùng neighbor trả `score = 0.0` (`available = true`).
4. **Context (`context_v1`)**:
   - Distance (`0.70`): `max(0, 1 - distance_km / distance_scale_km)` (`distance_scale_km = 5.0`, đường chim bay Haversine — không gọi là thời gian di chuyển). Thiếu origin → `NO_ORIGIN_COORDINATES`.
   - Weather (`0.30`): qua `WeatherAdapter` có timestamp/expiry và `weather_suitability_v1`. Mặc định `NoOpWeatherAdapter` trả `WEATHER_PROVIDER_UNAVAILABLE` (tự động chuẩn hóa Context về 100% distance, không bịa thời tiết).

### 2.3. Hard Filters (Không bao giờ tự nới lỏng)
- Phạm vi địa lý (`destination_id` / `geographic_unit_id` + đơn vị con).
- Danh mục (`category_ids`), nhãn cứng (`hard_tags`), không gian (`space_type`).
- Ngân sách mỗi địa điểm (`min_budget` / `max_budget`, `currency = VND`, `budget_basis = PER_PERSON | PER_VISIT | OFFERING`): **unknown price khác 0 và mặc định bị loại (`UNKNOWN_PRICE_EXCLUDED`)**.
- Đánh giá tối thiểu (`min_rating`), bán kính tối đa (`origin` + `max_distance_km`), giờ mở cửa (`visit_time` + `exclude_closed`; unknown opening hours không bao giờ giải thích là "đang mở").
- Kiểm tra visibility cuối theo batch qua Catalog `/internal/v1/places/validate` trong deadline đơn (bù từ ứng viên dự phòng nếu có; lỗi Catalog trả `503` fail-closed).

---

## 3. Runbook Vận Hành

### 3.1. Chạy local & kiểm thử
```powershell
# 1. Đảm bảo .env bật AI_ENABLED=true để Gateway mở route /api/intelligence/**
# 2. Build & khởi chạy lại intelligence + gateway (sau khi đổi code)
docker compose up -d --build --wait intelligence gateway

# 3. Chạy unit & property tests backend
mvn -f backend/services/intelligence-service/pom.xml test
mvn -f backend/platform/api-gateway/pom.xml test

# 4. Chạy DB integration tests thật (Docker PostgreSQL + RabbitMQ)
python backend/services/intelligence-service/test-local.py

# 5. Build & contract tests frontend
npm --prefix frontend run build
npm --prefix frontend run test:contracts
```

### 3.2. Đồng bộ Projection & Cohort Snapshot
1. Đăng nhập tài khoản `ADMIN` tại `/tai-khoan`, mở `/quan-tri` → khung **Quản trị Recommendation Ranking**.
2. Bấm **Đồng bộ Projection & Cohort** (`POST /api/intelligence/api/v1/admin/ranking/projections/sync`).
3. Kiểm tra tab **D. Config, CF & Deployment** thấy cohort snapshot mới nhất cùng `global_rating_prior`, `global_pop_p95` và `checksum`.

### 3.3. Runbook Build & Activate Item-based CF
1. Trong `/quan-tri` → tab **D. Config, CF & Deployment** → bấm **Chạy CF Build Job** (`POST /api/v1/admin/ranking/cf/jobs`).
2. Job chạy trên `RankingBackgroundExecutor` tách biệt hoàn toàn với request pool. Theo dõi trạng thái `QUEUED → RUNNING → SUCCEEDED`.
3. Khi thành công, kiểm tra `user_count`, `item_count`, `edge_count` và bấm **Validate** (`POST /api/v1/admin/ranking/cf/artifacts/{id}/validate`) để kiểm tra SHA-256 checksum artifact trên object storage.
4. **Không tự kích hoạt CF** chỉ vì build xong: chạy Evaluation so sánh `HYBRID_V1` (không CF) vs `CHALLENGER` (có CF) trên benchmark `HUMAN_LABELED` trước khi gắn `cf_artifact_id` vào deployment.

### 3.4. Runbook Dataset, Labeling, Evaluation & Weight Tuning
1. Chuẩn bị file CSV/JSONL theo mẫu trong `docs/recommendation/templates/judgments-template.csv` hoặc `.jsonl`.
   - Thang nhãn: `0` (không phù hợp), `1` (hơi phù hợp), `2` (phù hợp — mốc relevant cho Precision/Recall/HitRate), `3` (rất phù hợp).
   - Quy tắc split: gom nhóm theo `scenario_group` để các truy vấn gần nhau không rơi cùng lúc vào `VALIDATION` và `TEST` (hệ thống từ chối `SCENARIO_GROUP_SPLIT_LEAKAGE`).
2. Import hoặc chấm nhãn trực tiếp trong tab **B. Dataset & Labeling**, sau đó bấm **Freeze** để khóa phiên bản + SHA-256 checksum.
3. Chạy Evaluation trong tab **C. Evaluation & Tuning** qua các baseline (`BASIC_ONLY`, `FALLBACK_ONLY`, `CONTENT_CONTEXT`, `HYBRID_V1`, `CHALLENGER`).
   - Hệ thống báo rõ `NDCG@5/@10` (`gain = 2^grade - 1`), `Precision@5/@10`, `Recall@5/@10`, `HitRate@5/@10`, `CatalogCoverage`, `IntraListCategoryDiversity`, `HardConstraintViolations`, `JudgedCoverage`, `p50/p95/p99 latency` và slice metrics.
   - Không dùng `SYNTHETIC_FIXTURE` để chứng minh chất lượng production.
4. Chạy Weight Tuning trên **riêng split `VALIDATION`** (`POST /api/v1/admin/ranking/tuning`). Kết quả tốt nhất đạt guardrail (`hard_violations = 0`) được lưu thành `DRAFT` config mới — **không bao giờ auto-activate**.

### 3.5. Runbook Activate & Rollback Deployment
1. Validate cấu hình candidate (`POST /api/v1/admin/ranking/configs/{id}/validate`, gắn `evaluation_run_id`).
2. Activate (`POST /api/v1/admin/ranking/deployments/activate`): nhập `reason` bắt buộc; nếu cấu hình chưa đạt `quality_status = PASSED`, hệ thống chặn trừ khi admin bật rõ cờ `allow_demo_activation = true` (được gắn nhãn `DEMO ACTIVATION` trong UI & audit log).
3. Rollback (`POST /api/v1/admin/ranking/deployments/{deploymentId}/rollback`): chọn deployment trước đó còn hợp lệ (checksum artifact được kiểm lại), nhập `reason`. Rollback **không bao giờ khôi phục consent hoặc license đã bị thu hồi**.

---

## 4. Chính sách Consent, Source License, Lineage & Retention

- **Guest / No consent:** chỉ dùng tiêu chí phiên và dữ liệu công khai; không đọc `user_feature_profiles`, không chạy CF, không gắn `user_id` vào `recommendation_requests` / `recommendation_impressions` / `recommendation_feedback`.
- **Consent revocation & User deletion:** `ProjectionRepository.purge` + `purge_actor_identifiers` xóa/ẩn danh toàn bộ `interactions`, `user_feature_profiles`, `recommendation_requests.user_id`, `recommendation_impressions.user_id`, `recommendation_feedback.user_id`, `audit_logs.actor_id`, thu hồi dataset/model liên quan và phát `domain.user-data-deleted.v1`.
- **Source policy revocation:** `ingestion.source-policy.changed.v1` khóa `dataset_versions` và `model_versions` bị ảnh hưởng.
- **Tách Admin Playground:** mọi truy vấn Playground đánh dấu `is_admin_test = true`, bị loại hoàn toàn khỏi truy vấn Operational Analytics và CTR.

---

## 5. Hướng dẫn gắn Scorer / Model tương lai

1. **Weather Provider thật:** triển khai `RankingModels.WeatherAdapter` gọi API thời tiết có cache TTL và tiêm vào `ContextScorer`.
2. **Semantic / Vector Content Scorer (đang hoãn theo quyết định người dùng):** triển khai `RankingModels.SemanticScorerExtension` trả về `ScorerResult` có `scorerVersion`, kiểm tra lại chuẩn hóa & trọng số trên benchmark trước khi mở rộng `ContentScorer`.
3. **Learned Ranker / LTR / ALS:** triển khai scorer mới tuân theo hợp đồng `ScorerResult`, lưu artifact qua `ArtifactStore` kèm SHA-256 checksum và kích hoạt qua `ranking_deployments` sau khi vượt quality gate trên holdout `TEST`.

---

## 6. Giới hạn đã biết & Phụ thuộc chưa kết nối

- **Weather provider:** hiện dùng `NoOpWeatherAdapter` (chưa kết nối nhà cung cấp thời tiết bên ngoài; Weather sub-scorer báo `WEATHER_PROVIDER_UNAVAILABLE`).
- **Human-labeled benchmark:** chưa có tập dữ liệu do người thật gán nhãn cho production; cấu hình mặc định đang vận hành ở trạng thái `UNVALIDATED`.
- **Vector / Semantic / LLM / OSRM / OR-Tools:** nằm ngoài phạm vi phiên bản này theo yêu cầu.
- **Object storage:** hiện dùng volume cục bộ content-addressed (`ArtifactStore` với SHA-256) thay vì S3/MinIO cloud (vấn đề F-06 đã ghi nhận).
