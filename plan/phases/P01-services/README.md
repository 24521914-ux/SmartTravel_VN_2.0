# P01 Sáu service phát triển song song

Dependency duy nhất của cả sáu gói: **P00 bàn giao contract v1 và template local**. Không có cạnh chờ implementation giữa sáu service.

| Owner/nhóm | Gói | Scope bắt buộc |
|---|---|---|
| A | [Identity](identity.md) | Auth/account/role/preferences/notification/deletion handlers |
| B | [Catalog](catalog.md) | Geo/place/search/offering/business/rating + import/contribution handlers |
| C | [Community](community.md) | Review/rating/favorite/collection/contribution/moderation |
| D | [Trip](trip.md) | Trip/day/item/transfer/map adapter/snapshot |
| E | [Ingestion](ingestion.md) | Source/raw/job/normalize/dedup/import command/result |
| F | [Intelligence](intelligence.md) | History/Basic/feature + dataset/train/model pipeline |

## Bốn mốc nội bộ của từng nhóm

Các mốc dưới đây áp dụng riêng trong mỗi gói; sáu nhóm thực hiện đồng thời. Owner có thể giao nhiều thành viên triển khai chức năng, adapter và kiểm thử theo [bảng phân công](../../06-work-assignment.md). M1 cung cấp nền tảng cần thiết cho từng phần; M2/M3 có thể chồng lấp sau khi chốt interface, M4 nghiệm thu toàn service trên cùng revision.

1. **M1 Database và local runtime:** DB/Flyway/seed, app, auth test context và đối tác stub.
2. **M2 Nghiệp vụ và kiểm thử chức năng:** API thật, rule/state/concurrency/quyền của domain; kiểm tra success, validation, authorization và lỗi nghiệp vụ bằng DB service thật.
3. **M3 Biên giao tiếp và contract test:** client adapter, producer/consumer, outbox/inbox/retry thực thi với stub/harness đúng contract; không để TODO. Chạy kiểm thử contract/provider và tình huống timeout/retry/duplicate.
4. **M4 Nghiệm thu độc lập:** chạy lại DB integration/contract/security/fault tests, build image, hoàn thiện runbook và handoff revision. Chỉ bàn giao READY_FOR_INTEGRATION khi có test evidence.

Intelligence hoàn thiện cả pipeline ML bằng dataset fixture hợp lệ trong M2/M3. Không chờ Ingestion production mới viết pipeline; chất lượng trên dữ liệu thực thuộc P03.

## Ma trận kiểm thử chức năng trước khi kết nối

Các gói dưới đây cùng thực hiện trong P01. Bảng này là điểm kiểm chính; tất cả ca chi tiết ở file service và database vẫn thuộc scope. Mỗi case ghi dữ liệu đầu vào, kết quả mong đợi, kết quả thực tế và revision đã chạy.

| Nhóm | Chức năng dùng implementation thật | Đối tác mô phỏng | Bằng chứng bắt buộc trước bàn giao |
|---|---|---|---|
| Identity | Auth/session/role/preferences/notification/deletion | Category lookup, domain events/deletion ack, mail sink | Refresh đồng thời, quyền admin/user, consent/version; notification dedup; thiếu ack chưa complete |
| Catalog | Place/geo/search/offering/business/media, handlers | Test JWT/JWKS, rating/contribution/import/policy fixtures | Search/rating filter với projection fixture; concurrency/version; duplicate import; claim/protected fields |
| Community | Review/rating/favorite/collection/contribution/moderation | Identity, Catalog validate/visibility/apply result | COUNT/SUM sau sửa/ẩn; private collection; contribution conflict/pending; event duplicate/out-of-order |
| Trip | CRUD/day/item/order/locked/snapshot/transfer | Identity, Catalog batch, map/recommendation fixtures | Cross-trip FK/ownership, hai reorder cùng version, snapshot khi Catalog lỗi, route timeout và attribution |
| Ingestion | Fetch/normalize/match/job/checkpoint/outbox/inbox | Nguồn/file fixture hợp lệ, Catalog candidates/apply ack | Command ID ổn định, replay sau mất ack, PARTIAL cursor/counters, revoke license và không lộ secrets |
| Intelligence | History/features/Basic, dataset/train/model pipeline | JWT/consent, Catalog/rating/Trip/source-policy fixtures | Golden scoring/cold start/hidden/no consent, dedup, forbidden dataset, checksum/activation/timeout fallback |

Ở mỗi nhóm, chạy unit/domain để kiểm rule; DB integration để kiểm FK/transaction/concurrency; API/security để kiểm request và quyền; contract/fault để kiểm adapter/handler/retry. Kiểm UI bằng stub có thể làm song song nhưng phải ghi riêng với test backend. Ghép và regression các module trong service trước khi đóng M4.

> **Chú thích:** một ca “import hai lần không tạo place trùng” ở P01-IG kiểm command/retry của Ingestion với ack stub; P01-CA kiểm mutation/idempotency của Catalog với command fixture. P02 chạy lại cả đường Ingestion → Catalog → ack để chứng minh hiệu ứng trên DB Catalog thật. Các evidence này bổ sung cho nhau.

## READY_FOR_INTEGRATION

- [ ] Từ checkout sạch chạy được service + dependencies local; không cần runtime của năm service khác.
- [ ] Dùng domain code và migration thật trên DB riêng; không mock toàn bộ service hoặc dùng in-memory thay kiểm FK/transaction.
- [ ] API/messages đúng revision contract; có negative/security/stale-version/idempotency cases.
- [ ] Consumer xử lý fixture qua entrypoint/harness thật; capture outbound và validate schema. Local broker được dùng kiểm transport riêng, chưa nối service nghiệp vụ khác.
- [ ] HTTP client thật trỏ stub server; kiểm timeout/error/retry; test config/key không thể bật nhầm production.
- [ ] Không còn TODO nghiệp vụ trong scope; không hardcode kết quả mock vào domain logic.
- [ ] Có source revision/image, migration, schemas/examples, test report, local-run, config mẫu, known limits và danh sách adapter cần nối P02.
- [ ] Owner và reviewer khác ký handoff; chưa đánh dấu CONNECTED/SYSTEM_VERIFIED.

Chỉ khi **6/6** đạt gate mới mở [P02](../P02-service-integration.md). Người làm xong trước review/test/docs, không bỏ gate để nối service chưa hoàn chỉnh.
