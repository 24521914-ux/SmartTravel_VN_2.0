# P00 — Bàn giao kỹ thuật

## Trạng thái

**Triển khai kỹ thuật: hoàn tất và đã kiểm chứng local. Bàn giao/gate chính thức: READY_FOR_REVIEW.** Không giả mạo chữ ký N1/N2; phê duyệt contract candidate và nhận gói bàn giao còn chờ xác nhận. Không cần GitHub username để phân công hoặc ghi xác nhận.

Revision contract: `1.0.0-candidate`, SHA-256 manifest tại `backend/contracts/checksums.json`. Revision Git nền: `83c07f3`; thay đổi hiện tại chưa commit/push, không có commit/image production hoặc kết quả GitHub Actions để báo PASS.

## Sáu gói cùng revision

| Gói | Owner / reviewer | Skeleton / storage | Đối tác mô phỏng cần dùng |
|---|---|---|---|
| Identity | N1 / N2 | `backend/services/identity-service`, PostgreSQL | Catalog categories; deletion/notification event harness |
| Catalog | N1 / N2 | `backend/services/catalog-service`, PostgreSQL/PostGIS | Ingestion policy stub; rating/contribution/import harness |
| Community | N2 / N1 | `backend/services/community-service`, MongoDB replica set | Catalog validation/batch stub; apply result/visibility/deletion harness |
| Trip | N2 / N1 | `backend/services/trip-service`, PostgreSQL | Catalog batch + Intelligence recommendation stubs; map provider fixture/fallback contract |
| Ingestion | N1 / N2 | `backend/services/ingestion-service`, PostgreSQL | Catalog candidates stub; source synthetic load fixture/import-result harness |
| Intelligence | N2 / N1 | `backend/services/intelligence-service`, PostgreSQL/pgvector | Catalog batch, Identity preferences, Ingestion policy stubs; rating/consent/interaction harness |

Mỗi gói có app/security/health/config, build/image độc lập, JWT audience riêng, database riêng, OpenAPI và HTTP fixtures. Local test JWKS server dùng chung infrastructure thử nghiệm, không phải Identity business runtime. Redis cache tách từng service; không chia sẻ domain entity hoặc credential runtime production.

Template Java chưa có map/email/connector nghiệp vụ; provider adapters, domain migrations/index/collections và outbox/inbox thực được viết tại P01 với fixture/harness đã bàn giao. Map dev có thể dùng route-estimate fixture từ Trip stub; source dev dùng synthetic JSONL, không cần credential thật.

## Evidence đã chạy

| Kiểm tra | Kết quả thực tế |
|---|---|
| Maven sáu skeletons | BUILD SUCCESS, 18 tests, 0 failures/errors/skips |
| Platform verify với DB thật | BUILD SUCCESS, 4 tests, 0 failures/errors/skips; Flyway/probe rollback |
| Mỗi skeleton chạy riêng | 6/6 own DB health UP, JWT ký thật/JWKS được chấp nhận, sai audience hoặc thiếu JWT 401, error/correlation format đúng |
| Database dependencies | 6 endpoints, PostGIS ST_DWithin, pgvector cosine, MongoDB commit/rollback PASS |
| Cache | 6 Redis PONG |
| Contract validator | 183 operation/examples/errors + 23 message examples/negative cases PASS |
| Policy suite | 7 tests PASS (kiểm kỹ thuật hai phía boundary, không phải chữ ký con người) |
| HTTP stub suite | 3 tests PASS; case loop kiểm 183 operation, negative auth/precondition/timeout và common fixture visibility/consent/revocation/missing IDs |
| Event harness | 2 tests PASS; serialization/dedup/rollback/retry/out-of-order |
| Synthetic load data | Sinh 83.000 records hai lần, SHA-256 trùng; không có benchmark hoặc ML quality result |
| Frontend | TypeScript/Vite build PASS; HTTP dev proxy vào Catalog fixture PASS; npm audit 0 vulnerabilities lúc kiểm tra |
| Docker | 6 service image + platform image build PASS; platform container health UP đã smoke trước đó |
| CI | Đã viết workflow build/schema/stubs/DB/skeleton/frontend; chưa chạy GitHub Actions |

Lệnh tái hiện tại `backend/platform/README.md`. Skeleton images cần rebuild sau mọi thay đổi source; report build PASS ghi lần thực thi, không coi image cũ là artifact final production. Tests app được dừng sau smoke; Docker DB/cache local giữ lại, không xóa volume.

## Review cần xác nhận

- [x] Agent review kỹ thuật producer: schema/types/envelope/scopes/invariants và source mapping.
- [x] Agent review kỹ thuật consumer: fixtures/HTTP/error/version/retry/privacy và checksum tests.
- [x] Cùng revision và gói local đầy đủ trong repo, có hướng dẫn chạy không cần service khác.
- [ ] N1/N2 xác nhận contract candidate, database design/policies và nhận gói phụ trách.
- [ ] Điều phối xác nhận gate P00, freeze revision v1 và mở P01.

Hai ô cuối không tự tích chỉ vì người dùng yêu cầu viết code. Có thể ghi xác nhận trực tiếp tại checklist chung hoặc review PR; không cần account GitHub trong file phân công.

## Bước sau nghiệm thu

1. N1 bắt đầu domain Identity/Catalog, N2 bắt đầu Community/Trip theo checklist P01.
2. Tiếp tục Ingestion và Intelligence Basic theo capacity; Basic nghiệm thu trước khi code ML.
3. Hoàn thiện adapters/consumers và test độc lập; không nối runtime sáu service trước gate 6/6 P01.
4. Production domain/budget/provider keys/licenses và support/EOL review do owner phụ trách trước triển khai; không gửi secret trong chat hoặc commit.
