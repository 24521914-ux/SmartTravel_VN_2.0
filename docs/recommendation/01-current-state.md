# Khảo sát source và đầu vào thiết kế Recommendation

[Mục lục](00-readme.md) · [Kiến trúc đích](02-architecture.md) · [Thiết kế dữ liệu](04-data-design.md) · [Rủi ro và quyết định](12-risks-and-decisions.md)

## 1. Phạm vi và cách đọc

Đây là bản kiểm kê tĩnh source tại revision `89eb8cb0e2d39889bb903cf01e9f31467ae78d23`, ngày 29/10/2026, làm đầu vào cho thiết kế. “Có code” chỉ khẳng định tìm thấy implementation; không khẳng định service đang chạy, dữ liệu thật có sẵn, chức năng đã nghiệm thu hoặc model đã đạt chất lượng. Không chạy ứng dụng, migration, training hay kết nối database trong đợt phân tích này.

Tiến độ, bằng chứng chạy test, vấn đề `F-xx`, kết nối BE ↔ FE và chữ ký gate chỉ được quản lý tại [progress_be.md](../../progress_be.md) và [progress_fe.md](../../progress_fe.md). Không dùng tài liệu này để nâng trạng thái các task cũ. Các giai đoạn triển khai Recommendation mới nằm ở [roadmap](06-implementation-roadmap.md); chúng không đổi tên các phase P00–P04 của repository.

Năm loại phát biểu được phân biệt xuyên suốt bộ tài liệu:

| Loại | Ý nghĩa | Ví dụ |
|---|---|---|
| Yêu cầu đã ghi | Văn bản trong `plan/`, chưa mặc nhiên là hiện thực | Basic trước ML, ranh giới owner dữ liệu |
| Source đã có | Class, migration, route hoặc worker đọc được trên revision khảo sát | `BasicRepository`, `ModelWorker` |
| Thiết kế cũ | Mô tả trong kế hoạch, không tìm thấy implementation tương ứng | Các thuật toán nâng cao được nêu như hướng triển khai |
| Đề xuất mới | Quyết định hoặc hợp đồng cần triển khai sau master plan | Scorer thay thế theo module, impression receipt |
| Chưa xác minh | Thiếu báo cáo gốc, số liệu vận hành hoặc dữ liệu thật | Số active user, mật độ tương tác, chất lượng ML |

## 2. Cấu trúc repository và đường build thực tế

```text
SmartTravel_VN/
├── AGENTS.md
├── progress_be.md
├── progress_fe.md
├── plan/                     Yêu cầu, quyết định, schema thiết kế và phase cũ
├── docs/                     Tài liệu thiết kế/vận hành; recommendation là bộ này
├── backend/
│   ├── pom.xml, src/          Demo gốc, đường build khác microservices
│   ├── services/
│   │   ├── pom.xml           Aggregator sáu microservice Java 21
│   │   ├── identity-service/
│   │   ├── catalog-service/
│   │   ├── community-service/
│   │   ├── trip-service/
│   │   ├── ingestion-service/
│   │   └── intelligence-service/
│   ├── contracts/            OpenAPI, event schemas, registry, fixture/checksum
│   ├── platform/             Gateway, contract tooling, local stubs, cloud dev
│   └── infra/                Compose thật, runner P01/P02/P03, fault/load/restore
├── frontend/
│   ├── src/                  React, features và client
│   └── scripts/              Contract/Gateway/browser verification
├── design-system/            Tài sản/quy ước giao diện
└── .github/workflows/        P00/P01/P02/P03 tooling
```

`backend/services/pom.xml`, dòng 4–7, chỉ rõ Spring Boot `3.5.13`, Java `21`, sáu module độc lập. Gateway có POM riêng ở `backend/platform/api-gateway/pom.xml`. `backend/pom.xml`, dòng 30–31, dùng Java `25` và Spring AI `2.0.1`; sự tồn tại của Redis/Spring AI trong POM demo này không chứng minh runtime sáu microservice dùng Redis hay Spring AI. Lệnh triển khai và kiểm thử tương lai phải chỉ đúng `-f backend/services/pom.xml`, hoặc POM Gateway, theo runner của repo.

Quy ước package hiện tại là `service → feature → controller/dto/service/repository`, xem [quy ước service](../../backend/services/README.md). Một số đoạn mô tả “scaffold” trong README cũ không còn mô tả đủ source nghiệp vụ đang có; khi thiết kế dựa trên class, migration và contract thực tế.

## 3. Kiến trúc và ownership đã tìm thấy

| Thành phần | Cổng ứng dụng | Canonical data và trách nhiệm | Lưu trữ thực tế khai báo | Điểm tái dùng cho Recommendation |
|---|---:|---|---|---|
| API Gateway | 8080; runner P02 dùng 58080 | Route client, JWT/audience, token exchange, CORS, giới hạn request, chặn internal, công tắc AI | Không sở hữu domain DB | Cổng vào duy nhất; giữ cơ chế vô hiệu hóa AI và lỗi `FEATURE_DEFERRED` |
| Identity | 8101 | User/session/role, preferences, personalization consent, notification, deletion orchestration | PostgreSQL | Preference snapshot và event, kiểm phiên còn sống, tombstone, consent version |
| Catalog | 8102 | Place/geography/destination/category/tag/amenity, giờ mở cửa, giá, media, business, offering | PostgreSQL + PostGIS | Place projection, snapshot, batch visibility/version validation |
| Community | 8103 | Review và moderation, rating summary gốc, favorite, collection, contribution | MongoDB replica set | Rating count/sum, event favorite/review; không đọc DB trực tiếp |
| Trip | 8104 | Trip/destination/day/item/transfer, snapshot địa điểm, route estimate | PostgreSQL | Event `trip.item.added.v1`, recommendation attribution, historical delivery stream |
| Ingestion | 8105 | Source/license policy, import/raw/normalization/matching/checkpoint, command gửi Catalog | PostgreSQL | `allow_storage`, `allow_training`, license version, source lineage |
| Intelligence | 8106 | Interaction/history, projection/feature, Basic recommendation, dataset/job/model/artifact | PostgreSQL + pgvector | Owner hợp lý của pipeline đích; không cần service Recommendation mới |

Phân công N1/N2 theo [plan/06-work-assignment.md](../../plan/06-work-assignment.md): N1 sở hữu Identity/Catalog/Ingestion/platform; N2 sở hữu Community/Trip/Intelligence/frontend shell; hai người review chéo. Việc ghi tên owner ở thiết kế không thay chữ ký hoặc chấp thuận triển khai.

Mỗi service có DB/schema và runtime role riêng. Không có foreign key xuyên DB. Place ID và user ID trong Intelligence là external reference; dữ liệu nguồn không chuyển quyền sở hữu khi được sao chép thành projection. Migration PostgreSQL nằm ở `src/main/resources/db/migration/` từng service; schema/index Mongo ở `backend/infra/mongo/` và migration tooling liên quan. Không sửa nội dung migration đã áp dụng trong lần triển khai sau.

### 3.1. Transport thực tế

Đồng bộ là HTTP/JSON qua `/api/v1/**` và `/internal/v1/**`; adapter Java dùng `HttpClient`, deadline và giới hạn response body. Gateway đổi token tới đúng audience service qua Identity. Không tìm thấy `.proto`, gRPC server/client hay Kafka implementation trong cây microservice/Gateway được khảo sát; không đưa chúng vào kiến trúc đích như hạ tầng sẵn có.

Bất đồng bộ là RabbitMQ. `backend/infra/compose.p01.yaml`, dòng 14, khai báo RabbitMQ `4.1`; cấu hình transport từng service dùng exchange bền vững, inbox, DLQ và outbox publisher. Ví dụ `CatalogTransportConfiguration.java`, dòng 25–27, khai báo `catalog.events`, `catalog.inbound`, `catalog.deadletters`, `catalog.inbox`, `catalog.dlq`; `ConfirmedPublisher.java`, dòng 18–20, chờ confirm và kiểm returned message. `DeadLetterReplay.java` publish-confirm trước khi ack DLQ. Thiết kế phải coi delivery là at-least-once, chống trùng bằng inbox/event ID và version, không gọi đây là exactly-once.

### 3.2. Inventory hợp đồng đã đếm trực tiếp

Đếm method trong `paths` của sáu file `backend/contracts/openapi/*.yaml` bằng JSON parser; các file này chứa cú pháp JSON hợp lệ dù mang đuôi `.yaml`. Đây là số operation được định nghĩa, không phải số API đã nghiệm thu.

| OpenAPI | Operation |
|---|---:|
| Identity | 25 |
| Catalog | 66 |
| Community | 32 |
| Trip | 29 |
| Ingestion | 17 |
| Intelligence | 14 |
| Tổng | 183 |

Có 23 file `events/*.schema.json`; registry khai báo revision `1.0.0-candidate`. Muốn thêm field/operation phải cập nhật contract, fixture, checksum, provider/consumer tests và quyết định version theo [thiết kế API](05-api-contracts.md). Không coi nhãn candidate là bằng chứng đã freeze hoặc đã được ký nhận.

## 4. Ma trận thành phần để thiết kế tiếp

| Thành phần | Hiện trạng source | File/module liên quan | Đã có gì | Còn thiếu so với yêu cầu mới | Đề xuất |
|---|---|---|---|---|---|
| Recommendation owner | Có Intelligence | `backend/services/intelligence-service/` | DB, API, security, lifecycle model | Pipeline modular nội bộ | Mở rộng service hiện hữu |
| Public recommendation | Có Basic/Model coordinator | `recommendations/controller/`, `models/service/ModelService.java` | Request/response, fallback Basic | Contract request theo destination/context, version per module | Giữ v1 compatibility; extension có version |
| Candidate retrieval | Query local projection | `recommendations/repository/BasicRepository.java:90` | Chỉ lấy `PUBLISHED`, category/budget/geo filtering | SQL lấy 1.000 đầu theo ID trước lọc; có thể bỏ sót toàn bộ địa điểm đúng phạm vi | Đẩy hard filter trước bounded retrieval, pagination và kế hoạch query |
| Baseline | Công thức trộn trong repository | `BasicRepository.java:97–105` | Bayesian rating, preference/category/distance/budget, missing-weight renormalization | Tách baseline thật, popularity/trending có định nghĩa và provenance | Adapter bảo toàn hành vi rồi tách scorer có golden tests |
| Content Rule | Có binary category match | `BasicRepository.java:99` | Preference category overlap | Feature schema, tag mapping, weighted cosine, confidence | Scorer riêng; không gắn nhãn cosine cho binary overlap |
| Content ML | Không tìm thấy learned content model | `ProjectionRepository.java:110`, migration V6 | `vector(3)` của bias/rating/popularity | Learned multilingual embeddings, model metadata và evaluation | Chỉ thử sau khi có content/lineage hợp lệ |
| Collaborative Rule | Không có similarity scorer riêng | `projections/`, `recommendations/` | Tiếp nhận một số event interaction | User-item matrix, similarity, support gate, dedup/snapshot nguồn | Item-item có điều kiện dữ liệu; cold-start tắt scorer |
| Collaborative ML | Không tìm thấy MF/implicit model | `models/` | Generic artifact/job mechanics | Model CF, consent lineage, temporal holdout, real feedback | Tùy chọn sau dữ liệu thật |
| Hybrid | Công thức Basic đơn khối | `BasicRepository.java:97–105` | Reweight các component hiện có | Output contract giữa scorer, calibration, availability mask, learned ranker | Weighted hybrid trước, learned hybrid sau benchmark |
| Context-aware | Có geo/budget trong candidates | `BasicRepository.java:76–96` | Khoảng cách, bán kính, giá đơn, currency VND | Destination, holiday hours, group, weather, diversity, freshness | Shared filter/re-ranker; final validation chung |
| Final validation | Có HTTP Catalog kiểm công khai + version | `BasicRepository.java:114–124`, `recommendations/client/DependencyClient.java` | Batch tối đa 100; chỉ giữ version bằng projection | Kiểm toàn bộ hard constraints với dữ liệu đủ mới | Tái dùng cơ chế fail-closed; không bỏ khi fallback |
| Explanation | Có components/missing/fallback | `BasicRepository.java:124` | JSON explanation được encode thành chuỗi trong response | Reason codes có provenance và đúng scorer đã dùng | Giữ v1 wire; typed explanation ở contract mới |
| Interaction/history | Có client batch và purge | `BasicRepository.java:27–74` | Chỉ client `SEARCH`, `PLACE_VIEW`, event IDs, rate limit, consent version; không lưu query tự do | Impression/click/negative feedback đáng tin, attribution và retry semantics | Collector có receipt server; không cho client giả event nghiệp vụ |
| User preference/consent | Identity canonical, Intelligence projection | `identity/.../PreferenceService.java:38–64` | Category/style/food/budget, personalization toggle và version event | Mục đích training/analytics cần policy rõ; độ mới consent | Phân biệt quyền phục vụ, analytics, training; kiểm lại nguồn |
| Place feature | Catalog canonical, Intelligence projection | `catalog/.../CatalogRepository.java:132–137` | Snapshot field và source ID từ audit import | Wire thiếu description/timezone/max-price/exceptions/confidence | Contract enrichment có consumer review |
| Rating | Community canonical | `community/.../CommunityRepository.java:32–38` | APPROVED-only count/sum/version; Catalog projection | User-rating dataset không có trong summary | Explicit feedback cần hợp đồng riêng hoặc implicit approved-review |
| Model lifecycle | Có train/validate/deploy/rollback | `models/repository/ModelRepository.java`, `models/artifacts/ArtifactStore.java` | Artifact checksum, metadata, job, active deployment | Model role/module, feature/scorer compatibility, policy bundle | Tái dùng lifecycle; migration bổ sung sau, không thay tất cả |
| ML đang có | Linear SGD nhỏ | `ModelRepository.java:93–105,165–167` | Ba feature; train/validation/test code và artifact | Đánh giá relevance thực, module ML thực, whole-pipeline comparison | Gọi đúng là model demo công khai, không coi là CF/LTR/content model |
| Strategy selection | Basic/Model/Fallback toàn cục | `ModelService.java:34–54` | Active model, deadline, cancel, Basic fallback | Per-module selection và execution manifest | Một pipeline, thay module có compatibility gate |
| Background worker | Scheduler trong service | `models/service/ModelWorker.java`, transport workers | Poll training, outbox và retention | Snapshot evaluation jobs/lease/recovery mở rộng | Dùng DB job + worker hiện hữu trước, tránh orchestration platform lớn |
| AI Agent | Không tìm thấy Agent tool orchestration trong runtime khảo sát | Gateway/Intelligence/FE source | API Recommendation và Trip là nền tảng có thể gọi | Tool contract, delegated auth, itinerary proposal/confirmation | Agent là consumer API, không sở hữu ranker hoặc DB |
| Trip Planner | Nghiệp vụ Trip và FE đã có | `trip/.../TripService.java`, `frontend/src/features/trips/TripPlanner.tsx` | Trip/day/items/lock/snapshot/routes, recommendation request ID | Agent-assisted candidate-to-itinerary, constraint verification toàn lịch | Giữ phân biệt ranking địa điểm và lịch trình |
| Test/observability | Runner và CI đã có | `test-local.py`, `backend/infra/`, `.github/workflows/` | Contract/security/DB/broker/fault/restore/load tooling | AI CI đang loại khỏi suites; metric Recommendation theo module | Bổ sung AI lane có scope rõ khi triển khai, không diễn giải non-AI CI thành ML gate |

Tên file ở các hàng rút gọn đều tương đối với `backend/services/<service>-service/src/main/java/vn/smarttravel/<service>/`. Chi tiết file dự kiến tạo/sửa nằm trong [thiết kế module](03-module-design.md) và [backlog](11-implementation-backlog.md).

## 5. Luồng recommendation hiện có và giới hạn

`ModelService.recommend`, dòng 34–54, gọi `basic.candidates`, tìm active model, sau đó chọn Basic hoặc model inference trên toàn bộ candidate list; lỗi inference chuyển về Basic. Đây là coordinator toàn cục; chưa phải các module Content/Collaborative/Hybrid có implementation độc lập.

`BasicRepository.candidates` lọc địa điểm, tạo component và chấm điểm cùng một nơi. Trọng số hiện tại: category `0,30`, preference `0,25`, rating `0,20`, distance `0,15`, budget `0,10`. Chỉ các component có dữ liệu được đưa vào mẫu số. Rating dùng `(rating_sum + 35) / [5 × (rating_count + 10)]`, tương đương prior mean `3,5/5`, prior count `10`; preference chỉ nhận `0` hoặc `1` theo giao category. Khi không có component nào, dùng `popularity/100` clamp về `[0,1]`. Tie-break là chuỗi UUID tăng dần. Đây là hành vi cần characterization tests, không phải cấu hình khuyến nghị mặc nhiên cho sản phẩm.

Điểm quan trọng của candidate query là `WHERE status='PUBLISHED' ORDER BY place_id LIMIT 1000` chạy trước bộ lọc Java. Một request ở destination/bán kính khác có thể trả rỗng dù tồn tại địa điểm phù hợp nằm ngoài 1.000 ID đầu. Không khắc phục bằng tăng Top-N hoặc để ML tìm ngoài tập; sửa thứ tự retrieval/filtering trong giai đoạn Foundation.

`persist` kiểm lại visibility/version với Catalog trước khi lưu kết quả. Điều này có thể giảm số kết quả xuống dưới Top-N; không tự tăng phạm vi để bù. `data_as_of` hiện lấy **max** thời điểm của các candidate; trường này không chứng minh mọi feature đều mới, vì bản ghi cũ hơn bị che bởi bản ghi mới nhất. Kiến trúc đích cần freshness theo từng nguồn/field hoặc watermark bảo thủ.

`ModelRepository` huấn luyện linear SGD với input `[1, normalized_rating, popularity]`; metric được gắn `synthetic_quality_only=true`. Projection embedding là vector thủ công ba chiều `[1, rating, popularity]`, không phải learned embedding của văn bản/địa điểm. Không có bằng chứng từ source rằng model này cải thiện relevance của người dùng thật hoặc đáp ứng Content-based, Collaborative Filtering hay Learning-to-Rank theo yêu cầu mới.

## 6. Dữ liệu đến từ đâu, qua gì và lưu ở đâu

| Dữ liệu | Canonical owner | Delivery đã tìm thấy | Nơi dùng trong Intelligence | Giới hạn cần giải quyết |
|---|---|---|---|---|
| Preference + personalization consent | Identity | `identity.preferences.changed.v1`; `GET /internal/v1/users/preferences/snapshot` | Profile projection và version | `personalization_enabled` không tự chứng minh consent riêng cho training/analytics; snapshot phải được xác minh tuổi dữ liệu |
| Place/taxonomy/destination | Catalog | `catalog.place.upserted.v1`, visibility/category/destination events; `GET /internal/v1/places/features-snapshot` | `place_features`, projection version | Event v1 không chứa đủ mọi canonical field; snapshot full-list trước phân trang gây chi phí khi dữ liệu lớn |
| Rating summary | Community | `community.rating-summary.changed.v1`; `/internal/v1/ratings/batch`, `/snapshot` | Rating fields trên feature projection | Count/sum không phải user-rating matrix; cần giữ source version riêng Catalog version |
| Favorite | Community | `community.favorite.changed.v1` ADDED/REMOVED | Interaction/projection qua event consumer | Aggregate event/version cần semantics trạng thái và dedup; không chỉ cộng mọi delivery thành nhiều positive |
| Review state | Community | `community.review.changed.v1` | Interaction/projection qua event consumer | Event chỉ có trạng thái; không mang số sao hoặc nội dung review |
| Trip add | Trip | `trip.item.added.v1`; `GET /internal/v1/interactions/snapshot` | Interaction và recommendation attribution | Historical stream lấy từ outbox 90 ngày; retention outbox phải khớp khả năng rebuild |
| Client search/view | Intelligence | Batch HTTP interaction có analytics consent/version | `interactions`, history | Không có exposure denominator đáng tin để đánh giá CTR; query tự do không lưu nhằm tránh PII |
| License/source policy | Ingestion | `ingestion.source-policy.changed.v1`; internal policy read | Source-policy projection, dataset/artifact eligibility | Không gắn mọi content với policy rõ ràng thì không được tự mặc định được training |
| Feedback/impression | Chưa có canonical collection đủ yêu cầu mới | API/receipt đề xuất | Bảng mới do Intelligence sở hữu | Cần hiển thị thật ở FE, attribution, consent, dedup và chống spoof |

### 6.1. Gaps đặc biệt của wire hiện tại

Canonical Catalog có `timezone`, `description`, `price_min`, `price_max`, `opening_exceptions`, hiệu lực khung giờ và quan hệ taxonomy. Tuy nhiên `shared/web/Representations.java:6` chỉ trả nhóm field gồm `price` đơn, weekly `opening_hours`, ID category/tag/amenity/destination và tọa độ. `CatalogRepository.java:41–42` map `price=price_min` và weekly hours; `:117` whitelist event place không bao gồm `source_id`, description, timezone, max-price hoặc holiday exceptions. `features-snapshot` có thêm source ID lấy từ audited import version, không phải full provenance đa nguồn theo field.

Hệ quả: không thể tuyên bố hard constraint “tổng chi phí tối đa”, “chắc chắn mở trong ngày lễ”, “giờ địa phương chính xác” hay training text embeddings được bảo đảm chỉ bằng payload v1 này. Cần extension contract ở [API](05-api-contracts.md), hoặc fail-closed khi người dùng yêu cầu thuộc tính chưa đủ dữ liệu; không suy missing thành zero price/open all day/permitted training.

Review canonical có số sao, nhưng event `CommunityRepository.java:38` chỉ gửi `review_id,user_id,place_id,status,previous_status,version,change_kind`. `/internal/v1/ratings/snapshot` là summary toàn địa điểm. CF explicit rating cần hợp đồng user-item có quyền và consent; giai đoạn Rule có thể dùng approved-review như implicit event nếu policy cho phép, không giả lập rating `5`.

## 7. Mức sẵn sàng dữ liệu: điều biết được và chưa biết

| Lớp dữ liệu | Điều kiểm được bằng source | Điều chưa thể kết luận | Quyết định cho kế hoạch |
|---|---|---|---|
| Taxonomy/geography seed | Migration `catalog/V4__catalog_seed_and_helpers.sql` có 4 geographic units, 4 categories, 3 tags, 3 amenities, 3 destinations | Độ phủ điểm đến sản phẩm và taxonomy thực tế | Dùng demo contract; cần audit coverage dữ liệu thật |
| Place seed | Migration V4 trên không có `INSERT catalog.places` | Bao nhiêu địa điểm thật đang có, tỷ lệ published và độ đầy đủ hours/price | Foundation phải tạo inventory đo trên environment được phép sau này |
| Load profile | `load-profile.json`: synthetic-only, seed 42, 10.000 places, 2.000 users, 20.000 reviews, 1.000 trips, 50.000 interactions | Không chứng minh các record đã import vào DB hoặc đã load-test trên revision này | Chỉ dùng mục tiêu tải và fixture generator |
| Synthetic generator | `generate_load_fixture.py` tạo deterministic JSONL và manifest `production_eligible=false` | Không đại diện relevance, consent người thật, distribution hay CF density | Synthetic tests dùng kiểm correctness/performance, không đóng ML quality gate |
| Import sandbox | `ingestion/.../LocalFixturesRepository.java:11` seed source synthetic có `allow_storage=true`, `allow_training=false` | Nguồn production nào được phép training | Giữ license gate mặc định deny khi thiếu hoặc không được cho phép |
| Tương tác thật | Có ingest/history/event code | Active users, distinct user-item pairs, sparsity, positive rate, bots, cohort cold-start | Không bật CF chỉ vì schema có bảng interaction |
| Content quality | Có canonical category/tag/amenity và chỗ lưu description | Tỷ lệ thiếu/sai/không nhất quán, ngôn ngữ và license text | Audit trước content ML; không coi embedding thủ công là dữ liệu đã sẵn sàng |
| Offline evaluation | Có demo train/split/metrics code | Metric relevance unbiased, holdout người dùng thật, causal uplift | Thiết kế snapshot/time split/exposure trước khi đánh giá ML |
| Consent/license | Có version và event/tombstone | Mục đích training/analytics được người dùng cho phép tới đâu | Chốt policy semantics trước dataset thật |

Các con số 10.000/2.000/50.000 là **cấu hình fixture**, không phải thống kê hệ thống. `load_measured=false` và `ml_quality_measured=false` nằm trực tiếp trong profile. Không dùng chúng làm ngưỡng “đã đủ dữ liệu” hoặc bằng chứng thành công.

## 8. Workers, testing, CI/CD và vận hành có thể tái dùng

Workers hiện tại chủ yếu là scheduler trong từng Spring service: outbox poll, Identity email/notification/retention/rate-limit cleanup, Ingestion `PipelineWorker`, Intelligence `ModelWorker` và cleanup. Không tìm thấy orchestrator training chuyên dụng như Airflow/Kubeflow hay cluster GPU trong cấu hình khảo sát. Một DB job queue có lease, retry hữu hạn và artifact store nội bộ là mức mở rộng phù hợp trước khi cần thêm hạ tầng.

| Khả năng | Nguồn cụ thể | Cách dùng trong triển khai mới | Giới hạn |
|---|---|---|---|
| DB/broker integration | `backend/services/<service>/test-local.py`, `backend/infra/p01.py` | DB thật và broker thật cho projection, consent, replay, idempotency | Maven `verify` đơn lẻ có thể skip DB suite; phải ghi run/fail/error/skip |
| Contract validation | `backend/platform/validate_contracts.py`, checksum/policy/stub/event tests | Bảo vệ compatibility v1 và contract mới | Stub HTTP chỉ kiểm wire, không chứng minh nghiệp vụ |
| P02 environment | `backend/infra/p02.py`, Compose P01 | Real service wiring, token renewal, health, broker, manifest | Chạy được không đồng nghĩa đúng recommendation |
| P03 non-AI runners | `backend/infra/p03_nonai_*.py` | Giữ regression không AI khi mở rộng Intelligence | Scope non-AI không đóng gate ML hoặc AI Agent |
| P01 CI | `.github/workflows/p01-services.yml:21–24,44–46` | Thêm Intelligence vào lane riêng khi được triển khai | Matrix hiện chỉ identity/catalog/community/trip/ingestion; không có Intelligence suite |
| P02 CI | `.github/workflows/p02-integration.yml` | End-to-end Gateway + broker + FE | Build Intelligence với `-DskipTests package` để deletion ACK; không phải AI test evidence |
| P03 tooling CI | `.github/workflows/p03-tooling.yml` | Kiểm tooling, contract và FE | Không tự chạy whole-pipeline recommendation evaluation |
| Logging | `application.properties` từng service | Correlation ID và structured console Logstash | Cần request/policy/scorer/model manifest đã lọc PII |
| Monitoring | `backend/infra/p02.py:290–321` | Health, inbox backlog/consumer, DLQ và dashboard local | Chưa là Recommendation latency/quality/drift dashboard |
| Tracing | Gateway POM Brave/Zipkin; `application.yml:32–34` | Trace HTTP/event khi triển khai | Sampling default 0.0; không tuyên bố distributed trace đang hoạt động đầy đủ |
| Deployment | Dockerfile từng service, Compose P00/P01/P02; `backend/platform/cloud/` | Image revision, local reproducibility, dev cloud | Neon/Atlas docs là development; không suy production topology hay HA |

`compose.p01.yaml` dùng PostgreSQL 16, PostGIS `16-3.5`, pgvector `pg16`, MongoDB `8.0` replica set và RabbitMQ. Không cần thêm Redis, Kafka, vector database hoặc model-serving microservice để bắt đầu. HNSW pgvector đã có ở V6 nhưng không mặc nhiên cần dùng cho tập candidate nhỏ.

## 9. Đối chiếu yêu cầu và thiết kế cũ

| Chủ đề | Văn bản tìm được | Source tìm được | Cách diễn giải cho kiến trúc mới |
|---|---|---|---|
| Báo cáo nguồn | `plan/02-source-mapping.md:3`, `plan/README.md:7` dẫn tài liệu Word `Chức năng + Database.docx` | Không tìm thấy báo cáo `.docx`/`.pdf` trong file repository được khảo sát | Chỉ đối chiếu bản ánh xạ có trong repo; chưa thể xác nhận câu chữ/bảng/UC trong bản gốc |
| Tách sáu service | `plan/01-architecture.md`, `06-work-assignment.md` | Có sáu module và Gateway | Giữ owner, HTTP/event boundaries; Recommendation ở Intelligence |
| Basic trước ML | `plan/06-work-assignment.md`; `phases/P07-intelligence-basic.md`, `P08-intelligence-ml.md` | Basic + demo model/lifecycle | Giữ hành vi rule hoàn chỉnh trước; tận dụng nền lifecycle, thay cách chọn module |
| Baseline/content/collaborative/hybrid | Các mô tả và hướng thuật toán trong kế hoạch cũ | Chưa có interfaces/implementations tương ứng đầy đủ | Yêu cầu thuật toán được phân rã thành scorer thật, không đổi nhãn Basic rồi coi đã đủ |
| Context-aware | Place/Trip schema và các yêu cầu filter | Có geo/budget, final visibility; thiếu context chung đầy đủ | Hard constraints trước/sau ranker, context chung cho rule và ML |
| UC09/UC10 | Không tìm thấy identifier UC09/UC10 trong tài liệu repo đã khảo sát | Có nhóm chức năng F09/F10 liên quan Trip nhưng không chứng minh ánh xạ UC | Không đồng nhất UC09 với F09 hoặc UC10 với F10; chờ báo cáo gốc để lập traceability |
| AI Agent/Trip Planner | Có nghiệp vụ Trip, kế hoạch Intelligence và API nền | Không tìm thấy Agent tool orchestration hiện thực trong runtime khảo sát | Tool consumer của API; không dùng LLM thay engine và không cho truy cập DB trực tiếp |
| Kiến trúc do người dùng chốt | Yêu cầu ngày 29/10/2026: Unified Modular Recommendation Pipeline | Chưa có per-module policy/registry | Đây là kiến trúc chính thức của master plan, không phải chức năng đã tồn tại |

Thiếu báo cáo gốc không chặn việc thiết kế theo source và yêu cầu đã cung cấp. Nó chặn các tuyên bố “đã đối chiếu đầy đủ báo cáo” và việc ký xác nhận traceability UC. Mọi điểm cần quyết định được tập trung tại [rủi ro và quyết định](12-risks-and-decisions.md).

## 10. Kết luận thiết kế từ kiểm kê

Nền có thể tái dùng gồm owner Intelligence, auth/token exchange, projection/version/tombstone, Catalog validation, HTTP/event contracts, outbox/inbox/DLQ, interaction/history, worker/artifact/model lifecycle và hạ tầng test. Phần cần thiết kế lại bên trong Recommendation là candidate retrieval có scope, contract scorer/ranker/features, per-module policy, shared context/final constraints, feedback/impression có consent, và pipeline evaluation có dữ liệu thật.

Foundation phải bắt đầu bằng kiểm kê dữ liệu, version contract và consent semantics, rồi bảo vệ hành vi hiện có bằng tests trước khi tách module. ML chỉ được activate sau dữ liệu và benchmark cả pipeline; tên class `Model`, vector index hay số endpoint không thay được bằng chứng chất lượng.
