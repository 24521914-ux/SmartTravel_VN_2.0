# P01 Sáu service phát triển song song

Dependency duy nhất của cả sáu gói: **P00 bàn giao contract v1 và template local**. Không có cạnh chờ implementation giữa sáu service.

| Cá nhân | Gói | Scope bắt buộc |
|---|---|---|
| A | [Identity](identity.md) | Auth/account/role/preferences/notification/deletion handlers |
| B | [Catalog](catalog.md) | Geo/place/search/offering/business/rating + import/contribution handlers |
| C | [Community](community.md) | Review/rating/favorite/collection/contribution/moderation |
| D | [Trip](trip.md) | Trip/day/item/transfer/map adapter/snapshot |
| E | [Ingestion](ingestion.md) | Source/raw/job/normalize/dedup/import command/result |
| F | [Intelligence](intelligence.md) | History/Basic/feature + dataset/train/model pipeline |

## Bốn mốc nội bộ

1. **M1 Database và local runtime:** DB/Flyway/seed, app, auth test context và đối tác stub.
2. **M2 Nghiệp vụ:** API thật, rule/state/concurrency và quyền của domain.
3. **M3 Biên giao tiếp:** client adapter, producer/consumer, outbox/inbox/retry thực thi với stub/harness đúng contract; không để TODO.
4. **M4 Nghiệm thu độc lập:** DB integration/contract/security/fault tests, build image, runbook và handoff revision.

Intelligence hoàn thiện cả pipeline ML bằng dataset fixture hợp lệ trong M2/M3. Không chờ Ingestion production mới viết pipeline; chất lượng trên dữ liệu thực thuộc P03.

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
