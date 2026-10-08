# P07 Intelligence và Basic Recommendation

Trạng thái: **Chưa triển khai**. Dependency: P02/P03/P04/P05; P06 hỗ trợ provenance, catalog thủ công vẫn đủ chạy baseline. Chức năng: F05/F08.

## Công việc

- [ ] P07-01: [Intelligence migrations](../database/intelligence.md) cho interaction, user/place features, recommendation request/results; phần ML có thể tạo schema trước nhưng chưa bật training.
- [ ] P07-02: Client SEARCH/PLACE_VIEW và server favorite/review/trip event consumers; payload/time/session validation, dedup và rate limit.
- [ ] P07-03: Consent/version, Catalog snapshot + Community rating riêng stream, invalidation/tombstone và feature rebuild.
- [ ] P07-04: Scoring config v1 theo dictionary, hard filters trước điểm, normalize/renormalize missing values, deterministic tie-break place_id.
- [ ] P07-05: Cold start/no consent/no location/no price/no reviews; batch visibility cuối ở Catalog; fallback policy rõ khi thiếu dữ liệu.
- [ ] P07-06: Response Top N có explanation/algorithm_version/data_as_of/fallback_reason; Trip add recommendation giữ attribution.
- [ ] P07-07: History endpoint nếu cần UI, retention/deletion jobs, monitor latency/zero results/feature lag.

## Contract và dữ liệu

P07 dùng 5 bảng interaction/feature/request/result và 4 bảng kỹ thuật; 5 bảng dataset/model hoàn thiện P08. POST recommendations nhận preferences criteria/budget/category/location/topN, không tin user_id client. POST interactions/batch chỉ nhận SEARCH/PLACE_VIEW. Các loại còn lại từ producer backend để không đếm đôi.

Consume Identity preferences/status/deletion; Catalog place/destination/category; Community rating/favorite/review; Trip item; Ingestion policy. API gợi ý chỉ đọc projection/owner API, không truy vấn DB các service khác. Frontend: recommendation input/cards/explanation/fallback và thêm vào Trip.

## Kiểm nhận

- [ ] Golden dataset cover hard filter/currency/unknown values/cold start/tie-break; không trả hidden place.
- [ ] Cùng input+snapshot+algorithm version cho cùng kết quả; điểm không NaN/Infinity, không duplicate Top N.
- [ ] Không double-count client/server event; event cũ không phục hồi consent đã revoke.
- [ ] No consent dùng request criteria/public data; không lưu user history định danh để train; history user khác bị từ chối.
- [ ] F05/F08 E2E pass; Basic chạy không cần ML model; feature rebuild theo watermark có evidence.

Đầu ra: scoring config/version, APIs/consumers/UI, dataset kiểm nhận, privacy/retention/rebuild runbook và metric baseline thực đo. Rollback scoring version hoặc tắt personalization giữ public baseline; không rollback consent về true.
