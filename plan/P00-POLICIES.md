# P00 — Scope, policy và quy ước bàn giao

Revision thiết kế: `1.0.0-candidate`. Người dùng đã chốt database/phân công/scope; agent đã kiểm tra kỹ thuật hai phía boundary bằng schema, fixture, HTTP và policy tests. **Không ghi nhận N1/N2 đã ký review nếu chưa có xác nhận thực tế.**

## Review scope nguồn

42 dòng trong `02-source-mapping.md` là logical mapping yêu cầu, không phải 42 bảng vật lý bắt buộc hoặc nguồn DB monolith thật. Triển khai mới, không CDC/backfill dữ liệu cũ. Với Community, collection/transaction/index thay FK và DEFERRABLE; xem `database/community-mongodb.md`.

| Scope | Boundary đã giữ | Contract/artifact |
|---|---|---|
| F01 Account | Identity; USER/BUSINESS/ADMIN, guest không phải role được gán | auth/profile/preferences/sessions/notifications/admin/JWKS |
| F02 Place | Catalog canonical; Community rating projection | geo/place/taxonomy/media reference/claim APIs và place/rating events |
| F03 Local offerings | Catalog; không booking/payment | offering và place category/amenity |
| F04 Search/filter | Catalog; public chỉ PUBLISHED | query/pagination/snapshot/batch |
| F05 Basic recommendation | Intelligence, Identity consent, Catalog final visibility | recommendation API, preferences/place/rating events |
| F06 Review/rating | Community, Catalog projection | review/report/moderate APIs; full rating snapshots |
| F07 Favorite | Community | PUT/DELETE idempotent, favorite events |
| F08 Interaction history | Intelligence | client SEARCH/PLACE_VIEW, server favorite/review/trip events |
| F09 Trip | Trip; ACID trong DB Trip | trip/day/items/transfers/order/state APIs |
| F10 Map/distance | Catalog geometry + Trip routing adapter | lat/lon/radius, route estimates; chưa tối ưu tuyến sâu |
| F11 Admin | Owner service, không Admin Service riêng | scoped admin routes cho user/place/business/UGC/source/data/model |

Collections, contribution apply/result, business claim, ingestion và ML nằm trong scope release. Basic phải hoàn thiện/kiểm thử trước implementation ML; gate P01 cuối vẫn có ML pipeline fixture. ML quality thực kiểm ở P03, không mặc định kích hoạt model chỉ vì train job chạy.

## Quyền, tiền tệ và consent

- Guest đọc catalog và dùng Basic không cá nhân hóa. Personalized recommendation/history/private Trip cần principal JWT và kiểm owner. `sub` không lấy từ request body; không cho client override user_id/owner_id/role.
- API recommendation public có thể nhận JWT để cá nhân hóa khi consent cho phép; JWT được cung cấp nhưng sai vẫn phải 401, không âm thầm downgrade thành guest.
- Client interaction chỉ SEARCH/PLACE_VIEW, analytics opt-in rõ ràng; user đã đăng nhập phải kiểm consent mới nhất tại Identity, không chỉ tin cờ client. Guest dùng UUID session pseudonymous, không thu email/IP làm ID.
- ADMIN scopes riêng; BUSINESS token không tự có quyền mọi place. Membership + claim APPROVED phải đúng business/place; reviewer không tự nâng quyền.
- Currency bản đầu VND; số tiền >=0, unknown = null, miễn phí = 0. Không cộng khác currency. Preferences CUSTOM yêu cầu budget_min <= budget_max; version nâng nguyên tử cùng options/consent.
- Một review/user/place; rating integer 1–5; chỉ APPROVED góp count/sum. Edit APPROVED -> PENDING. Moderation event không được coi là interaction tạo review mới.
- Collection PRIVATE chỉ owner/admin có policy tương ứng; public collection không làm lộ private profile. Visibility place mới nhất có ưu tiên; không thêm place khi không xác minh được.
- Contribution APPROVED không đồng nghĩa APPLIED. Import SUCCEEDED chỉ khi mọi command cần ack đã nhận; retry giữ command_id/proposed UUID, không ghi DB Catalog trực tiếp.
- Route timeout dùng fallback có nhãn; không bịa duration. Trip cũ đọc snapshot được khi Catalog lỗi; add mới fail theo policy, không tự thay locked items.

## Auth và protocol

- Java 21/Spring Boot 3.5.13 là platform đã build/test; MongoDB module không dùng JDBC/Flyway/JPA. Không dùng backend demo gốc Java25/Boot4.1.1 làm root build của sáu service mới.
- JWT RS256; verify signature/issuer/audience/expiry. Local issuer `local-test`; audience = service name. Production issuer/JWKS được N1 cấu hình theo domain triển khai, chưa giả định domain đã có.
- Claims: `sub` UUID, `iss`, `aud`, `iat`, `exp`, `jti`; user `roles` và `scope`; workload có `client_id` và scopes tối thiểu, không gán role ADMIN. Internal API không cho user token gọi chỉ vì có bearer token.
- Access TTL 10 phút, refresh absolute 30 ngày/idle 7 ngày, reset token 30 phút, verify email 24 giờ. Token chỉ lưu hash, key rotation có overlap, revoke refresh family khi reuse. Logout không hứa revoke tức thời mọi JWT offline; sensitive write kiểm user status/revocation, failure thì fail closed.
- Idempotency principal + operation + key, hash request, TTL baseline 24 giờ. Cùng key/body trả response cũ; khác body 409. If-Match strong ETag `"<version>"`, thiếu 428, version conflict 409; nested Trip mutations dùng parent aggregate version.
- Error JSON `code/message/traceId/fieldErrors`; trace/correlation không chứa secret. Cursor opaque, default20/max100; source snapshot có watermark, version riêng từng stream; không so Catalog version với rating version.
- Timeout HTTP nội bộ baseline 2 giây nhưng luôn capped theo deadline request; tối đa 2 retry chỉ khi idempotent và còn budget. Recommendation 1 giây không được vượt deadline để retry.
- At-least-once, schema_version, event_id unique, producer/aggregate stream, correlation/causation/traceparent. Inbox + domain update và outbox + domain mutation cùng transaction; bounded backoff/jitter/DLQ/audit replay. Schema sai không ACK; command kết quả rõ applied/rejected.

## ML và vận hành

- PostgreSQL metadata + pgvector cosine; embedding thử nghiệm multilingual-e5-small/384 chiều; N2 pin artifact/version/license trước bước ML, không dùng fixture quality để bật production.
- Quality baseline dự kiến: holdout có ít nhất 100 user consent và 1.000 interaction hợp lệ; no leakage, NDCG@10 >= Basic +0,02 và Precision@10 không thấp hơn Basic. Thiếu dữ liệu/không đạt thì QUALITY_PENDING, giữ Basic và cần quyết định release, không giả PASS.
- Load profile synthetic tại `backend/contracts/fixtures/load-profile.json`, generator `generate_load_fixture.py`; 83.000 record sample, không phải domain seed hoặc dataset production. Targets/SLO/RPO/RTO/retention/provider đã ghi `P00-DECISIONS.md`, kiểm thực ở P03.
- Deployment mới; task migration monolith P04 chỉ N/A sau khi ghi lý do scope. Vẫn phải backup/restore/rollback cho write mới và operational gates.
- Ngân sách/domain/credential/quota provider/licensing dữ liệu thật do N1/N2 phụ trách trước dùng production; không phải blocker scaffold P00. Không tự mua dịch vụ hoặc commit secret.

## Review và thay đổi contract

Producer review dữ liệu/transaction/state, consumer review ID/version/privacy/retry/error và fixture; chạy policy/schema/HTTP/event suites. Thay đổi wire schema phải sửa nguồn `build_contracts.py`, generate intentional `--write`, review artifact diff, validate, refresh checksum rõ ràng rồi verify checksum lại. Breaking change tăng major; field additive phải có compatibility review, không sửa schema để che lỗi code.

Agent technical review/tests không thay review code nghiệp vụ P01 hoặc phê duyệt production. N1/N2 review chéo trước bàn giao chính thức; GitHub account không bắt buộc để ghi xác nhận trong tài liệu.
