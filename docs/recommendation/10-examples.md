# Năm ví dụ end-to-end và golden fixture

[Công thức](03-module-design.md) · [Contract JSON](05-api-contracts.md) · [Policy](08-ranking-policy-fallback.md). **Toàn bộ ID, place, scores, models và consent ở đây là dữ liệu giả lập để kiểm thiết kế. Không có model nào được huấn luyện/activate và không có kết quả chất lượng thực được tuyên bố.**

## 1. Fixture dùng chung

Các alias A/B/C là UUID place kết thúc 001/002/003, cùng namespace `30000000-0000-4000-8000-000000000`. Destination D1 là `50000000-0000-4000-8000-000000000001`; D2 kết thúc 002. Không phải địa điểm du lịch thật. Tất cả visit dùng timezone `Asia/Ho_Chi_Minh`, ngày 02/11/2026, thời điểm 09:00–10:00 GMT+7. Catalog fixture có phiên bản/hard-field evidence đầy đủ, không dùng payload thiếu trường của v1 để suy ra giờ/giá.

| Place | State/destination | Giá một lượt VND đã xác minh | Distance fixture | Giờ/exception | Hard filter |
|---|---|---:|---:|---|---|
| A | PUBLISHED, D1 | 80.000 | 4 km | 08:00–18:00, không exception | Giữ |
| B | PUBLISHED, D1 | 120.000 | 2 km | 08:00–18:00, không exception | Giữ |
| C | PUBLISHED, D1 | 50.000 | 1 km | 08:00–18:00, không exception | Giữ |
| D | HIDDEN, D1 | 0 | 1 km | Có | Loại hidden |
| E | PUBLISHED, D2 | 50.000 | 1 km | Có | Loại sai destination dù ở gần |
| F | PUBLISHED, D1 | 200.000 | 2 km | Có | Loại vượt budget150.000 |
| G | PUBLISHED, D1 | 50.000 | 2 km | Đóng đến 11:00 | Loại visit không đủ khoảng mở |
| H | PUBLISHED, D1 | Không biết | 2 km | Có | Loại hard budget unknown |
| I | PUBLISHED, D1 | 50.000 | 12 km | Có | Loại radius10 km |

Nếu candidate provider lặp A ở page kế tiếp, giữ một record theo đúng source version, không thêm bản sao vào Top N. Nếu Catalog final trả B vừa HIDDEN, loại B và refill reserve đã score; không dùng điểm popularity để phục hồi B.

Baseline score fixture đã normalize: A=0,60; B=0,80; C=0,50. Content Rule: A=0,90; B=0,40; C=0,70. Collaborative Rule: A=0,40; B=0,90; C=0,60. Các số này là input stub của golden calculation, không được gọi là kết quả chạy scorer từ database. Test riêng công thức Baseline/cosine/CF trong [module design](03-module-design.md) dùng data thô tương ứng.

Soft context chỉ là gần điểm khởi hành, do **fixture policy công khai bật proximity default** với D_soft=10 km: `Ctx=max(0,1-distance/10km)` → A=0,6, B=0,8, C=0,9. Dùng `S=0,9H+0,1Ctx`, diversity weight=0 cho năm ví dụ để phép tính minh bạch; production diversity cần benchmark/test riêng, không bị xóa khỏi kiến trúc. Hard radius 10 km chỉ kiểm pass/fail trước soft utility; Baseline fixture không chứa distance utility nên không đếm đôi. Tính/sort full precision, output làm tròn 6 chữ số.

Request chung R:

```json
{
  "topN": 2,
  "currency": "VND",
  "destination_id": "50000000-0000-4000-8000-000000000001",
  "category_ids": [],
  "budget": 150000,
  "location": {"lat": 16.0678, "lon": 108.2208, "radius_m": 10000},
  "visit": {"start_at": "2026-11-02T09:00:00+07:00", "duration_minutes": 60},
  "open_now": false,
  "party": {"adults": 2, "children": 0, "mobility_required": false},
  "personalization": "AUTO"
}
```

Khoảng cách là field fixture đã inject vào test, không tuyên bố tính từ lat/lon trên bằng tọa độ place chưa cho. Test Haversine dùng tọa độ explicit riêng. Budget là per-place estimate theo cost basis owner; không cộng 2 item để bảo đảm ngân sách cả trip. Category_ids rỗng tránh việc chỉ một hard category làm Content của cả ba item giống nhau.

Mọi ví dụ chạy cùng pipeline: schema/auth/consent → candidate filter còn A/B/C → FeatureBundle → policy → scorer/ranker → context → final Catalog/consent → Top2 → explanation/audit nếu được phép. Chỉ policy eligibility/strategy khác nhau.

## 2. Ví dụ 1 — user mới, hoàn toàn bằng công thức

**Input:** R; principal user fixture U1 có current consent analytics=false, personalization=false, không stored preference/history. Có thể dùng guest với cùng kết quả; không lấy user khác làm seed. Execution plan `rule-policy-1`: Baseline `br-1`, Content OFF (request không có preference vector), CF OFF, Weighted `wh-1`, Context `cx-1`.

1. D/E/F/G/H/I bị loại đúng lý do; không chạy scorer cho item đã loại.
2. FeatureBuilder chỉ đọc public place/rating và request R. Không truy vấn history/factors của U1.
3. Chỉ B khả dụng nên weight effective Baseline=1, H=B.

| Place | B | C | CF | H | Context | S |
|---|---:|---|---|---:|---:|---:|
| A | 0,60 | OFF | OFF | 0,60 | 0,60 | 0,600000 |
| B | 0,80 | OFF | OFF | 0,80 | 0,80 | 0,800000 |
| C | 0,50 | OFF | OFF | 0,50 | 0,90 | 0,540000 |

4. Final Catalog fixture xác nhận A/B/C published/current hard evidence; consent vẫn OFF. Top2: **B(0,800000), A(0,600000)**.
5. Explanation B: “Địa điểm công khai phù hợp ngân sách và khoảng ghé thăm bạn đã chọn”; có thể thêm rating reason chỉ nếu actual evidence review đủ, không nói “vì bạn thích”.
6. Public `fallback=false`, metadata personalized=false, analytics_allowed=false, Content/CF null, impression_token=null. Cold-start là selection bình thường, không model failure.
7. Chỉ aggregate vận hành không user/session/GPS/query; nếu cần request/result reference24h thì sanitized/unlinked theo [retention](04-data-design.md). Không lưu U1 cùng R để training. Audit technical: pipeline unified-v1, policy rule-policy-1, actual br-1/wh-1/cx-1, model_used=null; không phát feedback token.

## 3. Ví dụ 2 — sở thích + Content Rule + Collaborative Rule + Hybrid Rule

**Input:** R; U2 có preferences hợp lệ, current personalization/analytics/training grant theo fixture purpose policy, consent_epoch=12, history snapshot hs-2 đủ support (ít nhất3 usable neighbors và support item-pair như policy). Đây chỉ là support fixture, không bằng chứng CF có ích trên real data. Model không cần tồn tại.

Policy `rule-policy-2`: br-1/cr-1/cf-2/wh-1/cx-1, weights B0,2 C0,5 CF0,3. FeatureBuilder dùng stored preference có quyền; request hard constraints vẫn ưu tiên.

| Place | B | Content Rule | CF Rule | Tính H | H | S=0,9H+0,1Ctx |
|---|---:|---:|---:|---|---:|---:|
| A | 0,60 | 0,90 | 0,40 | 0,2×0,6 +0,5×0,9 +0,3×0,4 | 0,690000 | 0,681000 |
| B | 0,80 | 0,40 | 0,90 | 0,2×0,8 +0,5×0,4 +0,3×0,9 | 0,630000 | 0,647000 |
| C | 0,50 | 0,70 | 0,60 | 0,2×0,5 +0,5×0,7 +0,3×0,6 | 0,630000 | 0,657000 |

Trước context B/C tie H=0,63, tie-break UUID B trước C. Context đưa C lên trước B; final Top2 **A(0,681000), C(0,657000)**. Không phải sort làm tròn ngẫu nhiên. A explanation: “Phù hợp sở thích đã cho phép sử dụng và ngân sách bạn chọn”; không lộ user neighbors hay CF private breakdown.

Log permitted: policy rule-policy-2, feature rec-features-2, consent_epoch12, snapshot hs-2/catalog fixture cp-8/rating rp-5, actual strategies br-1/cr-1/cf-2/wh-1/cx-1, model_used=null, effective weights0,2/0,5/0,3, fallback=false. Response trả token opaque signed nếu analytics grant còn hợp lệ; chưa có impression đến khi FE xác nhận exposure.

## 4. Ví dụ 3 — Content ML + Collaborative Rule + Hybrid Rule

**Input:** R và U2 như ví dụ 2. Trong mô phỏng registry, Content model c7 đã đủ gate/compatibility (giả định của test), feature/calibrator cs-7 phù hợp; CF vẫn dùng cf-2. Chỉ thay Content implementation trong `mixed-policy-3`, không tách API/pipeline.

Content ML scores sau calibrator giả định A=0,70, B=0,90, C=0,40. Không trộn raw cosine/logit với score Rule. Weighted weights giữ 0,2/0,5/0,3.

| Place | B | Content ML | CF Rule | H | S |
|---|---:|---:|---:|---:|---:|
| A | 0,60 | 0,70 | 0,40 | 0,12+0,35+0,12=0,590000 | 0,591000 |
| B | 0,80 | 0,90 | 0,90 | 0,16+0,45+0,27=0,880000 | 0,872000 |
| C | 0,50 | 0,40 | 0,60 | 0,10+0,20+0,18=0,480000 | 0,522000 |

Final check giữ A/B/C, Top2 **B(0,872000), A(0,591000)**. B explanation dựa intent/semantic match đã có evidence, không nói “AI tốt hơn”. Log attempted=used content.ml c7, calibrator cs-7; actual CF rule cf-2; Hybrid wh-1 không model; fallback=false. `mode` compatibility có thể MODEL nhưng actual trace mới mô tả đúng execution mixed.

Đổi thứ tự so ví dụ 2 không chứng minh quality tốt hơn: chưa có ground-truth relevance hay feedback. Với real data phải đánh giá cả mixed-policy-3 trên holdout cùng eligible set, không chỉ Content scorer.

## 5. Ví dụ 4 — Content ML + Collaborative Rule + Hybrid ML

**Input:** R, U2 và scorer scores như ví dụ 3. Policy `mixed-policy-4` yêu cầu Learned Hybrid h4, input signature `[br-1, content-c7/cs-7, cf-2, masks all available]`. Mô phỏng h4 bằng hàm ranker nhỏ để tính tay; coefficients là giả định artifact cho golden test, không phải kết quả training trong repository:

`z=-1+1*B+2*C_ML+1*CF`, `H_learned=1/(1+exp(-z))`.

Đây là ví dụ learned scoring function thay weighted sum, không khẳng định backend đã có linear-LTR hoặc LambdaMART. Thực tế lựa chọn LTR được quyết định trong [ML evaluation](07-ml-training-evaluation.md); golden model adapter có thể emit chính values dưới để kiểm contract/calibration. Learned ranker không cộng thêm weighted score sau sigmoid, tránh double counting.

| Place | z | H Learned | Context | S=0,9H+0,1Ctx |
|---|---:|---:|---:|---:|
| A | -1+0,6+1,4+0,4=1,4 | 0,8021838886 | 0,60 | 0,7819654997 |
| B | -1+0,8+1,8+0,9=2,5 | 0,924141820 | 0,80 | 0,911727638 |
| C | -1+0,5+0,8+0,6=0,9 | 0,710949503 | 0,90 | 0,729854553 |

Top2 cuối **B(0,911728), A(0,781965)**. Rank giống ví dụ 3 nhưng scores khác; không so số 0,91 với0,87 để kết luận uplift vì calibration khác. Log used content-c7/cs-7 + hybrid-h4/calibrator-h4, CF rule cf-2, policy mixed-policy-4, input signature khớp, fallback=false. Explanation B vẫn evidence-based “Phù hợp tiêu chí và sở thích bạn đã cho phép sử dụng”, không tiết lộ coefficients như nguyên nhân nhân quả cá nhân.

## 6. Ví dụ 5 — Content ML timeout, fallback đúng từng module

**Input:** R/U2 như ví dụ 4. Execution plan ban đầu mixed-policy-4: Content c7, CF cf-2, Hybrid h4. Content c7 timeout ở budget100 ms; còn đủ service deadline để Rule và final validation. Không retry c7; circuit breaker theo version nhận failure.

1. Giữ candidate/features/consent snapshot. Content chuyển sang cr-1, tạo score0,90/0,40/0,70.
2. CF Rule cf-2 vẫn dùng0,40/0,90/0,60. Baseline br-1 không tính lại vì input không đổi.
3. h4 chỉ certified cho Content c7; **không gọi h4 bằng cr-1**. Hybrid chuyển wh-1 cùng weights0,2/0,5/0,3.
4. H/S như ví dụ 2: A H0,69→S0,681; B H0,63→S0,647; C H0,63→S0,657.
5. Final Catalog/consent không đổi, Top2 **A(0,681000), C(0,657000)**. Nếu deadline không còn đủ final validation, trả 503; không dùng fallback làm lý do bỏ check.

| Trường audit | Giá trị mô phỏng |
|---|---|
| Policy pinned | mixed-policy-4, không đổi active global pointer khi một request lỗi |
| attempted Content | content.ml@c7, status TIMEOUT, elapsed100 ms |
| actual Content | content.rule@cr-1, model_used=null |
| actual CF | collaborative.rule@cf-2, unchanged |
| Hybrid requested | learned@h4, không chạy do input signature mismatch |
| Hybrid actual | weighted@wh-1 |
| Fallback reasons | CONTENT_MODEL_TIMEOUT; HYBRID_INPUT_SIGNATURE_MISMATCH |
| Public | fallback=true; fallback_reason=CONTENT_MODEL_TIMEOUT; metadata actual rule IDs |
| Governance | Consent_epoch12/current recheck, source epochs unchanged |

Không ghi h4 “used” nếu chưa infer, không log c7 làm model đã tạo scores. Không trả lời người dùng “đã cá nhân hóa bằng Content ML” khi Rule thực dùng. Explanation dựa actual cr-1/features, vẫn đúng request.

## 7. Các nhánh kiểm bổ sung

| Biến thể | Hành vi kỳ vọng |
|---|---|
| CF unavailable ở ví dụ 2 | Effective weights B=0,2/0,7, C=0,5/0,7. A H=(0,12+0,45)/0,7=0,814286; B0,514286; C0,642857; S lần lượt0,792857/0,542857/0,668571; Top A,C |
| User revoke trong ví dụ 3 | Không trả B/A từ personal features đã tính; recompute request-only nếu budget đủ, hoặc503. Không chỉ xóa user_id log rồi giữ ranking cá nhân |
| Catalog hide B trước final ở ví dụ 3 | B bị loại, A và C được final-validate, Top A,C với scores0,591/0,522; không trả B dù score cao |
| Tất cả hard evidence thiếu | 200 items=[] nếu capability có nhưng không item đủ;422 nếu toàn capability chưa được hỗ trợ; explanation nêu thiếu dữ liệu, không nới constraints |
| Final Catalog page2 timeout | Trả 503 cho request theo fail-closed policy; không trả TopN một phần từ projection hoặc lờ batch bị lỗi |
| Same scores và context | Sort tie UUID asc; order ổn định, không theo thứ tự Map/parallel scorer hoàn thành |

Golden calculation có thể dùng sai số≤1e-6 cho scores đã round6 và≤1e-9 trước round. Test toàn pipeline dùng UUID/schema thật và dependency fixture có provenance, không chỉ assert thứ tự một array viết tay. Fixture chứng minh đường đi/arithmetic/contract; real quality gate vẫn [tách riêng](07-ml-training-evaluation.md#2-tách-ba-loại-bằng-chứng).
