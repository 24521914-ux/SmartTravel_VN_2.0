# Checklist tiến độ các phase


Cập nhật giao code **21/10/2026**: toàn bộ checkpoint local gốc được giữ trong [lịch sử](evidence/2026-10-20-local-checklist-history.md). P03 **PARTIAL**, chờ CI revision cuối; không thay chữ ký owner/reviewer hoặc mở P04.

Cập nhật lần cuối: **21/10/2026** · Revision: `0bcdca4` · Người cập nhật: coding agent theo yêu cầu người dùng · Evidence giao code/CI: [2026-10-21-github-delivery-ci.md](evidence/2026-10-21-github-delivery-ci.md).

## Cách cập nhật

- File này là **nguồn trạng thái chính** của P00–P04. Quy tắc bắt buộc nằm ở [AGENTS.md mục 10](../AGENTS.md#10-quy-tắc-ghi-progress). Mục lục folder xem [progress/README.md](README.md).
- `[x]` chỉ dùng cho trạng thái `LOCAL_VERIFIED`, `CI_VERIFIED` hoặc `ACCEPTED`. Các trạng thái `NOT_STARTED`, `IN_PROGRESS`, `PARTIAL`, `BLOCKED` luôn để `[ ]`. Trạng thái `N/A` phải ghi lý do và quyết định scope.
- Mỗi task ghi theo mẫu: trạng thái · evidence (lệnh/test và ngày) · commit/PR · reviewer. Evidence dài đặt trong `progress/evidence/` và link tới.
- Chỉ đóng gate khi đạt tiêu chí của tài liệu gốc trong `plan/phases/`, không dựa vào số ô đã tích. Agent không ký thay N1/N2.

## Tổng quan trạng thái (20/10/2026)

| Phase / gói | Trạng thái | Code trên `main` | Evidence mạnh nhất | Còn thiếu để đóng gate |
|---|---|---|---|---|
| P00 Chuẩn bị chung | READY_FOR_REVIEW | PR #1–#2 | Local 08/10/2026 | N1/N2 ký nhận gói, freeze contract `1.0.0-candidate` (F-05) |
| P01-ID Identity | LOCAL_VERIFIED 9/10 task | PR #5–#9 (`a9ab23a`) | Delivery 14/10: 60 tests DB/broker PASS | ID-10 reviewer N2; F-01 consumer thiếu |
| P01-CA Catalog | LOCAL_VERIFIED 11/12 task | PR #10 (`d799fa2`) | Delivery 14/10: 26 tests PASS | CA-12 reviewer N2; F-03 seed homestay |
| P01-CO Community | LOCAL_VERIFIED 10/11 task | PR #11 (`0d46262`) | Delivery 14/10: 30 tests PASS | CO-11 reviewer N1 |
| P01-TR Trip | LOCAL_VERIFIED 10/11 task | PR #12 (`33b2627`) | Delivery 14/10: 40 tests PASS | TR-11 reviewer N1 |
| P01-IG Ingestion | LOCAL_VERIFIED 10/11 task | PR #13 (`7e4f8ce`) | Delivery 14/10: 38 tests PASS | IG-11 reviewer N2 |
| P01-IN Intelligence | LOCAL_VERIFIED 11/12 task | PR #14 (`61f6c2e`) | Delivery 14/10: 35 tests PASS | IN-12 reviewer N1; CI PR #14 chưa ghi |
| Gateway + frontend client | LOCAL_VERIFIED | PR #15 (`42eac23`) | Scan 20/10: Gateway 14/14, frontend 7/7 | Reviewer; CI PR #15 chưa ghi |
| **Gate P01** | Người dùng chấp nhận 11/10/2026; **chưa có chữ ký owner/reviewer** | — | [P02_README](../backend/infra/P02_README.md) dòng 3 | Chữ ký N1/N2 cho 6 gói |
| P02 Kết nối | PARTIAL: 12/15 task LOCAL_VERIFIED | PR #16 (`14b342c`), #17 (`9f4beca`) | Local connected 11/10/2026 (checkout gốc) | P02-01, P02-08, P02-14; CI `connected` run ID; chữ ký |
| P03 Kiểm thử hệ thống | NOT_STARTED | — | — | Toàn bộ |
| P04 Phát hành | NOT_STARTED | — | — | Toàn bộ |

Findings mở F-01…F-11: xem [mục Findings](#findings-đang-mở).

## P00 — Chuẩn bị chung

Nguồn: [checklist P00](../plan/phases/P00-scope-architecture.md).

- [x] P00-01: Review kỹ thuật F01–F11/42 logical mappings, giữ boundary sáu service và ghi policy — `plan/P00-POLICIES.md`, `plan/database/community-mongodb.md`.
- [x] P00-02: Owner/reviewer N1/N2, folder ownership/platform/frontend đã được phân công theo xác nhận người dùng.
- [ ] P00-03: OpenAPI đã đủ 183 operation và validate PASS; **chờ N1/N2 chốt candidate thành revision bàn giao**.
- [ ] P00-04: Đủ 23 event/command schema và registry producer/consumer; **chờ N1/N2 chốt candidate**.
- [x] P00-05: Fixture chung và từng operation/message, negative cases, deterministic synthetic load profile/generator.
- [x] P00-06: Sáu skeleton chạy độc lập trên DB riêng, platform migration probe, HTTP stubs/JWKS/event harness có test evidence.
- [x] P00-07: Java21/Boot3.5.13/build/image/config/log-correlation/health/error và CI source đã kiểm chứng local; không tuyên bố CI remote đã pass.
- [x] P00-08: Scope/frontend/new deployment/Basic→ML và baseline SLO/load/RPO/RTO/provider/retention có owner.
- [ ] P00-09: Agent review kỹ thuật producer/consumer và checksum/examples PASS; manifest/hướng dẫn đầy đủ; **còn xác nhận N1/N2 nhận gói và điều phối freeze revision**.
- [ ] **Gate P00:** sáu owner có đầu vào cùng revision, chạy độc lập được và xác nhận bàn giao.

### Các bước nhỏ P00 đã thực hiện (lịch sử và evidence)

- [x] P00-01.a: Ánh xạ Tourism & Geo/Auth/UGC/AI sang Catalog/Identity/Community/Intelligence, giữ sáu service — `plan/P00-DECISIONS.md`.
- [x] P00-01.b: Ghi nhận Catalog PostgreSQL/PostGIS, Community MongoDB và Redis cache tách service; các lựa chọn còn lại đã chốt ở P00-08.
- [x] P00-01.c: Cập nhật kiến trúc và cảnh báo baseline SQL Community không còn dùng trực tiếp; thiết kế MongoDB mới đã ghi tại `plan/database/community-mongodb.md`.
- [x] P00-06.a: Tạo template độc lập, security JWT validator và migration probe — `backend/platform/p00-template/`.
- [x] P00-06.b: Tạo Compose PostGIS, DB platform, MongoDB replica-set init và sáu Redis cache — `backend/platform/compose.p00.yaml`.
- [x] P00-07.a: Xác minh Java 21/Maven Wrapper 3.9.16; template Spring Boot 3.5.13 resolve/build/package thành công.
- [x] P00-07.b: Hai unit tests audience/issuer/expiry pass. Lệnh: `./backend/mvnw -f backend/platform/p00-template/pom.xml verify -B`; kết quả 2 tests, 0 failures/errors, BUILD SUCCESS.
- [x] P00-07.c: Compose parse pass: đặt sáu password environment local rồi chạy `docker compose -f backend/platform/compose.p00.yaml config --quiet` (exit 0).
- [x] P00-07.d: Viết workflow CI template — `.github/workflows/p00-template.yml`; mới có source, chưa chạy GitHub Actions.
- [x] P00-09.a: Viết hướng dẫn build/local và danh sách quyết định cần người dùng xác nhận — `backend/platform/README.md`, `plan/P00-DECISIONS.md`.
- [x] P00-06.c: Bật Docker Desktop và chạy sáu DB domain + sáu Redis cache; `check_runtime.py` PASS.
- [x] P00-06.d: PostGIS ST_DWithin, pgvector cosine và MongoDB commit/rollback probe PASS.
- [x] P00-06.e: Template app startup, Flyway V1 và PostgreSQL rollback test PASS trên DB thật.
- [x] P00-06.f: HTTP JWKS test kiểm RS256 signature, forged key, issuer/audience/expiry và rotation PASS.
- [x] P00-07.e: Build Docker image template (non-root), container startup/Flyway và health UP với DB thật; container probe đã dừng/xóa, DB/cache giữ lại.
- [x] P00-06.g: Stub mọi service — `contract_stub.py`; ba HTTP tests thực hiện 183 operation, negative auth/precondition/body/timeout và common fixture visibility/consent/revocation/missing IDs PASS. Stub Catalog cũ đã được thay thế.
- [x] P00-03.a: Sáu OpenAPI candidate, 183 operation + request/response/errors/headers/pagination fixtures; validator PASS.
- [x] P00-04.a: 23 message schemas/envelopes, applied/rejected, registry producer/consumer; serialization/schema negative cases PASS.
- [x] P00-05.a: Fixture chung cùng revision, HTTP/event fixtures và SHA-256 manifest; verify không âm thầm refresh checksum.
- [x] P00-01.d: Thiết kế collections/index/transaction/concurrency Community MongoDB — `plan/database/community-mongodb.md`; chưa được N1/N2 review.
- [x] P00-06.h: Tạo sáu Java skeleton tại `backend/services/`; Maven verify 18 tests PASS, MongoDB không JDBC/Flyway/JPA.
- [x] P00-06.i: Chạy riêng 6/6 skeleton với DB thật, test issuer JWKS ephemeral; JWT đúng được nhận, sai audience/no JWT 401, error/correlation schema đúng.
- [x] P00-04.b: Event harness SQLite transaction demo: 23 messages, dedup, crash/rollback/retry và old-version handling PASS; domain consumers/transport còn thuộc P01/P02.
- [x] P00-09.b: Independent policy review suite 7 tests PASS; không ghi nhận đây là chữ ký N1/N2.
- [x] P00-05.b: Sinh 83.000 synthetic records hai lần, checksum khớp; chưa benchmark tải hoặc ML quality.
- [x] P00-06.j: Frontend React/TypeScript/Vite scaffold, build và HTTP dev proxy PASS; npm audit 0 vulnerabilities lúc kiểm tra, chưa browser/E2E.
- [x] P00-09.c: Manifest sáu gói cùng revision và hướng dẫn independent local — `backend/platform/P00_HANDOFF.md`, `backend/platform/README.md`.
- [ ] N1/N2 xác nhận review/nhận gói; điều phối freeze contract và đóng gate.

- [x] P00-02.a: Chia N1 = Identity/Catalog/Ingestion, N2 = Community/Trip/Intelligence; review chéo, N1 quản lý platform và N2 frontend shell.
- [x] P00-08.a: Chốt PostgreSQL cho Identity/Trip/Ingestion, PostgreSQL + pgvector cho Intelligence.
- [x] P00-08.b: Chốt frontend, triển khai mới, Basic hoàn thiện trước rồi ML; release cuối gồm ML.
- [x] P00-08.c: Ghi baseline provider/load/SLO/RPO/RTO/retention/model và người chịu trách nhiệm quyết định còn lại — `plan/P00-DECISIONS.md`. Đây là mục tiêu thiết kế, chưa kiểm chứng hoặc provision dịch vụ.

**Còn thiếu duy nhất để đóng gate bàn giao:** xác nhận N1/N2 phê duyệt candidate/nhận sáu gói và điều phối freeze revision. Không còn phần scaffold P00 chưa triển khai được ghi nhận trong lượt này. Không giả mạo chữ ký hoặc gọi policy tests là review của con người. Credential/domain/ngân sách/source license/support-EOL production có owner xử lý trước triển khai, không chặn scaffold local. Không cần GitHub username. Xem [manifest bàn giao](../backend/platform/P00_HANDOFF.md).


## P01 — Phát triển và kiểm thử độc lập

Nguồn: [sáu gói service](../plan/phases/P01-services/README.md). Lịch sử evidence M1, Identity auth/preferences, sửa CI PR #6, refactor layout và Community EOL đến 10/10/2026: [2026-10-10-p01-m1-identity-community-history.md](evidence/2026-10-10-p01-m1-identity-community-history.md). Bàn giao GitHub ngày 14/10/2026: [2026-10-14-p01-github-delivery.md](evidence/2026-10-14-p01-github-delivery.md).

**Quy ước evidence cho P01 (áp dụng cho mọi task `[x]` bên dưới):**

- `LOCAL_VERIFIED`: code và test có tên nêu ở task đã có trên `main` `9f4beca`. Suite DB/broker disposable PASS 0 failure/error/skip trên nhánh bàn giao ngày 14/10/2026 (lệnh `python backend/services/<service>-service/test-local.py`, Identity thêm `--transport --isolated-source`). CI snapshot lúc bàn giao 9/9 PASS cho PR #9–#13, **chưa có run ID**, nên chưa nâng lên `CI_VERIFIED`.
- Lượt scan 20/10/2026 chỉ chạy lại được Maven verify. Suite DB/broker bị skip do không có Docker. Xem [scan](evidence/2026-10-20-source-scan.md).
- Reviewer theo [phân công](../plan/06-work-assignment.md): N1 sở hữu Identity/Catalog/Ingestion (N2 review); N2 sở hữu Community/Trip/Intelligence (N1 review). **Chưa có chữ ký reviewer cho task nào.**

### P01 M1 — storage/runtime chung

- [x] M1.a–M1.j: baseline Flyway/Mongo, compose P01, smoke/verify 6/6, image 6/6, CI matrix, runbook — **LOCAL_VERIFIED** 10/10/2026 · PR #5 (`efc7871`) · chi tiết trong [lịch sử](evidence/2026-10-10-p01-m1-identity-community-history.md#p01-m1-storageruntime).
- [x] Blocker checksum CRLF/LF của Community — **LOCAL_VERIFIED** 10/10/2026 · `backend/.gitattributes`, test `immutableMigrationResourceRetainsCanonicalLfChecksum`.
- [ ] Review M1 — **NOT_STARTED**: chưa có chữ ký N1/N2.

### Identity — [yêu cầu](../plan/phases/P01-services/identity.md) · owner N1 · reviewer N2

Source `backend/services/identity-service/`: migrations V1–V7, 23 bảng (kể cả probe); 25/25 operation contract + 3 endpoint P02 nội bộ; 61 tests (Maven 20/10).

- [x] P01-ID-01: Migration/roles/options + seed U1/U2/admin/business — **LOCAL_VERIFIED** · V1–V5, `LocalIdentityFixtures` · PR #5–#6.
- [x] P01-ID-02: Issuer RS256/JWKS, key rotation, secret guard, health, Mailpit, image, CI — **LOCAL_VERIFIED** · `IssuerKeysTests`, `JwksIntegrationTests` · PR #6.
- [x] P01-ID-03: Register/verify/login/logout/refresh/reset/change password, rate limit — **LOCAL_VERIFIED** · `AuthDatabaseTests` · PR #6.
- [x] P01-ID-04: Profile/preferences/options/consent/category validation, admin users/status/roles, internal batches — **LOCAL_VERIFIED** · `PreferencePatchTests`, `CategoryClientTests`, `AuthDatabaseTests` · PR #7.
- [x] P01-ID-05: Notification inbox/read/delivery/retry; deletion request/ack/state machine — **LOCAL_VERIFIED** · `notificationInboxAndInAppDeliveryDedupAndRollbackAreAtomic`, `notificationEmailDedupRetryExhaustionAndInactiveRecipientArePersisted`, `deletionRevokesAndTombstonesAtomicallyButRequiresAllSixAcknowledgements` · V6–V7 · PR #8–#9.
- [x] P01-ID-06: Category client, outbox 4 event, consumers notification/deletion ack/category invalidation, audit/idempotency — **LOCAL_VERIFIED** theo phạm vi plan · `categoryInvalidationIsAtomicVersionedAndDoesNotResurrectSelection`, `BrokerDatabaseTests` (6) · PR #9. **Lưu ý F-01:** registry còn khai báo Identity consume `catalog.contribution.applied/rejected.v1` và `intelligence.model.deployed.v1`, nhưng code chưa có. Plan ID-06 không liệt kê 3 message này, cần owner quyết định.
- [x] P01-ID-07: Contract/provider tests JWKS/claims/batch/event snapshots; config stub không lọt production — **LOCAL_VERIFIED** · `all25FrozenOperationsHaveRealHttpProviderResponses`, `productionRejectsLocalStubAndCredentialBearingOrigin`, `productionCannotGenerateKeysOrCombineLocalProfiles` · PR #9.
- [x] P01-ID-08: Email trùng, token consumed/expired/reused, refresh đồng thời, JWT expiry/audience/rotation — **LOCAL_VERIFIED** 10/10/2026 · PR #6.
- [x] P01-ID-09: USER không lên ADMIN, category timeout, notification trùng, thiếu ack không complete, consent mặc định false — **LOCAL_VERIFIED** · `timeoutNeverApprovesUnverifiedSelection`, `concurrentNotificationDeliveryAndDeletionAcknowledgementsAreSerialized`, `deletionInvalidPolicyOrCrashDoesNotRevokeOrEraseAccount` · PR #9.
- [ ] P01-ID-10: Bàn giao image/migrations/OpenAPI/event samples/test report/runbook — **PARTIAL** · đã có [README/runbook](../backend/services/identity-service/README.md), image, test count ở delivery · thiếu: chữ ký N2, run ID CI.

### Catalog — [yêu cầu](../plan/phases/P01-services/catalog.md) · owner N1 · reviewer N2

Source `backend/services/catalog-service/`: migrations V1–V8, V2 có 24 bảng domain + 4 bảng kỹ thuật; 66/66 operation + 3 endpoint ngoài contract (F-02); 27 tests.

- [x] P01-CA-01: PostgreSQL/PostGIS, Flyway 24+4, seed taxonomy/geo/alias/destination, GiST/GIN/FK/unique — **LOCAL_VERIFIED** · V2, V4 · PR #5, #10.
- [x] P01-CA-02: Security signed test token, config/log/health/image/compose — **LOCAL_VERIFIED** · `SecurityConfigurationTests`, `JwksIntegrationTests` · PR #10.
- [x] P01-CA-03: Geo hierarchy/version/alias/cycle/effective dates; taxonomy; Place lifecycle/history/audit — **LOCAL_VERIFIED** · `hierarchyCycleEffectiveOverlapAndEventPublishScheduleAreRejected`, `mutationHistoryOutboxVisibilityAndOldRating` · PR #10.
- [x] P01-CA-04: Search tiếng Việt/alias/tên cũ, filter, cursor ổn định, distance mét, rating filter — **LOCAL_VERIFIED** · `cursorRejectsTamperingAndChangedFiltersAndPagesWithoutDuplicates`, `unknownPriceFreePriceDistanceAndAliasesAreDistinct` · PR #10. Hiệu năng alias: F-04 (P03).
- [x] P01-CA-05: Opening hours nhiều ca/qua đêm/holiday; price NULL/0; media quarantine; claim evidence private — **LOCAL_VERIFIED** · `openingOvernight24HoursHolidayAndRejectedLongShiftRollback`, `privateEvidenceRemainsPrivateAfterApprovalAndSpatialExplainUsesIndex`, `scannerApproveAndErrorsAreBoundedWithoutApprovingQuarantine` · PR #10.
- [x] P01-CA-06: Offerings SERVICE/TOUR/EVENT/ACTIVITY/EXPERIENCE; Place+Category+Amenities — **LOCAL_VERIFIED** · `OfferingsController`, V2 · PR #10. **Lưu ý F-03:** seed chỉ có `restaurant/hotel`, chưa có `homestay`; tạo được qua admin taxonomy API.
- [x] P01-CA-07: Business/member/verification/claim/change requests, protected fields, BUSINESS không có quyền mọi place — **LOCAL_VERIFIED** · `businessRequiresVerifiedMembershipAndConflictPreservesPlace`, `suspendedAdminCannotReviewOrMutateActorlessAdministrativeCommands` · PR #10.
- [x] P01-CA-08: Rating consumer versioned, import/contribution handlers idempotent, mutation+history+inbox/outbox atomic — **LOCAL_VERIFIED** · `importCommandDuplicateProtectedFieldsAndSourceRevocationFailClosed`, `dependencyFailureRollsBackCommandInboxAndResult` · PR #10.
- [x] P01-CA-09: Publish place/visibility/destination/category/business-claim; source policy revoke; snapshot/reconciliation API — **LOCAL_VERIFIED** · `BrokerDatabaseTests` (5), `/internal/v1/places/snapshot` · PR #10.
- [x] P01-CA-10: Test geo/search/pagination/price/overnight/24h/holiday/cycle/claim mismatch — **LOCAL_VERIFIED** · các test CA-03..05, CA-07.
- [x] P01-CA-11: Hai update cùng version chỉ một commit; duplicate import; protected fields; rating không lùi; hidden không public — **LOCAL_VERIFIED** · `concurrentVersionAllowsOneCommit`, `idempotencyReplayReturnsOriginalAndPayloadConflictDoesNotMutate`.
- [ ] P01-CA-12: Bàn giao image/migrations/API/events/fixtures/EXPLAIN/test report/runbook — **PARTIAL** · [README](../backend/services/catalog-service/README.md) có EXPLAIN GiST và runbook · thiếu chữ ký N2, run ID CI.

### Community — [yêu cầu](../plan/phases/P01-services/community.md) · owner N2 · reviewer N1

Source `backend/services/community-service/`: Mongo migrations V1–V3 (16 collections), 32/32 operation, 30 tests.

- [x] P01-CO-01: Mongo versioned migration/index/validator, unique, parent-version reorder, media ownership, seed fixture — **LOCAL_VERIFIED** · `MongoStorageConfigurationTests`, `LocalFixtures` · PR #5, #11.
- [x] P01-CO-02: App/security/log/health/image/CI + HTTP stub, consumer harness — **LOCAL_VERIFIED** · `SecurityConfigurationTests`, `JwksIntegrationTests` · PR #11.
- [x] P01-CO-03: Review CRUD/media, report/moderation/audit; sửa APPROVED→PENDING — **LOCAL_VERIFIED** · `approvedEditHideRestoreDeleteReconcilesSummaryAndCrossUserFails`, `localMediaRejectsMimeCrossOwnerAndQuarantineBeforeApproval` · PR #11.
- [x] P01-CO-04: Review+summary+outbox transaction, COUNT/SUM reconciliation, favorite idempotent — **LOCAL_VERIFIED** · `concurrentApprovedReviewsReconcileWithoutLostCount`, `favoriteIdempotenceAndDependencyFailureClosesWrites`.
- [x] P01-CO-05: Collection public/private, item/note/reorder, batch enrich — **LOCAL_VERIFIED** · `privateCollectionsAndReorderValidateExactSetAndParentVersion`, `batchEnrichmentIsAuthorizedAndDependencyFailureClosesReads`, `concurrentCollectionReorderHasOneWinner`.
- [x] P01-CO-06: Contribution add/edit/withdraw/approve→APPLYING→APPLIED/APPLY_FAILED — **LOCAL_VERIFIED** · `contributionMissingAckStaysApplyingAndRejectedAckIsIdempotent`.
- [x] P01-CO-07: Catalog validate/batch client, đóng quyền ghi khi không xác minh được place — **LOCAL_VERIFIED** · `CatalogClientTests` (3), `BoundedJsonClientTests` (3).
- [x] P01-CO-08: Publish review/favorite/rating/contribution; consume apply results/visibility/deletion; outbox/inbox dedup — **LOCAL_VERIFIED** · `BrokerDatabaseTests` (5), `versionedVisibilityDeletionAndStatusCannotResurrectDeletedUser`.
- [x] P01-CO-09: Approve/edit/hide/delete/restore làm summary đúng, không double-count — **LOCAL_VERIFIED** · test CO-03/CO-04.
- [x] P01-CO-10: Cross-user/private/UGC chưa duyệt bị chặn; missing ack giữ APPLYING — **LOCAL_VERIFIED** · `deletionFencePreventsNewCollectionAndReviewAfterDeletionAcknowledges`, test CO-06.
- [ ] P01-CO-11: Bàn giao schema/API/events/image/test/runbook — **PARTIAL** · [README](../backend/services/community-service/README.md) có storage runbook · thiếu chữ ký N1, run ID CI.

### Trip — [yêu cầu](../plan/phases/P01-services/trip.md) · owner N2 · reviewer N1

Source `backend/services/trip-service/`: migrations V1–V7, 29/29 operation + 1 endpoint snapshot P02, 41 tests.

- [x] P01-TR-01: Flyway 7+4, composite FK cùng trip, unique deferrable, seed itinerary — **LOCAL_VERIFIED** · V2, V4, fixture opt-in · PR #5, #12.
- [x] P01-TR-02: Service/security/compose/log/health/image/CI, stubs — **LOCAL_VERIFIED** · `RuntimeGuardTests`, `LiveSessionValidatorTests`, `check-local.py --image smarttravel-trip:p01-finish-local`.
- [x] P01-TR-03: Trip/segment/day CRUD, owner JWT, date/timezone, parent lock/version, soft delete — **LOCAL_VERIFIED** · `ownerPreconditionCrossTripAndDateBoundariesAreEnforced`.
- [x] P01-TR-04: Add place qua Catalog client, snapshot, reorder/locked, cost/budget — **LOCAL_VERIFIED** · `concurrentReorderHasOneWinnerAndRetainsAllItems`, `refreshedAndReplacedPlacesUpdateBudgetAndUnknownPriceWarnings`.
- [x] P01-TR-05: Transfer, route cache, fallback có nhãn, refresh snapshot, giữ completed — **LOCAL_VERIFIED** · `routingFailureHasStraightLineLabelAndNoInventedDuration`, `routingCacheReusesProviderAndForeignTransferDoesNotMutateTrip`, `addingRepeatedVisitCannotReplaceCompletedSnapshot`.
- [x] P01-TR-06: Recommendation attribution, visibility chỉ đánh unavailable — **LOCAL_VERIFIED** · `recommendationAttributionIsPersistedAndEmittedOnce`, `locksCompletedRefreshVisibilityOrderingAndDeletionAreReal`.
- [x] P01-TR-07: Catalog/routing adapters, publish trip.changed/item.added, consume visibility/deletion — **LOCAL_VERIFIED** · `BrokerDatabaseTests` (12), `LimitedBodyHandlerTests`.
- [x] P01-TR-08: Snapshot/source_version, outbox/inbox/retry/audit, privacy/cache-control, idempotent add — **LOCAL_VERIFIED** · `addIdempotencyAndUnavailableCatalogPreserveCommittedSnapshot`, `crashAfterPublishBeforeCommitRedeliversSameEventId`.
- [x] P01-TR-09: Không gắn item của trip khác; date ngoài khoảng; reorder đồng thời 409 — **LOCAL_VERIFIED** · test TR-03/TR-04.
- [x] P01-TR-10: Catalog down vẫn đọc snapshot; timeout không bịa duration; locked/currency/owner — **LOCAL_VERIFIED** · `catalogCurrencyRejectionRollsBackAndRoutingTimeoutFallsBackWithinBound`.
- [ ] P01-TR-11: Bàn giao migrations/image/API/events/test/runbook/provider config — **PARTIAL** · [README](../backend/services/trip-service/README.md) đầy đủ runbook · thiếu chữ ký N1, run ID CI.

### Ingestion — [yêu cầu](../plan/phases/P01-services/ingestion.md) · owner N1 · reviewer N2

Source `backend/services/ingestion-service/`: migrations V1–V8, 17/17 operation, 38 tests. README ghi "all18 operations" trong khi contract có 17 operation; cần owner sửa README.

- [x] P01-IG-01: Flyway 6+4, unique raw hash/link/command, một active job/source, fixture license CC0-synthetic — **LOCAL_VERIFIED** · V2, V4 · PR #5, #13.
- [x] P01-IG-02: App/workers/security/health/CI/image, secret reference `env:NAME` — **LOCAL_VERIFIED** · `RuntimeGuardTests`, `credentialBearingSourceUriCannotPersistSecrets`.
- [x] P01-IG-03: Registry/license/policy/jobs, source locking, chặn raw khi allow_storage=false — **LOCAL_VERIFIED** · `policiesSourceLocksQuotaAndCancellationPreventUnsafeProcessing`.
- [x] P01-IG-04: Fetch/cursor/limit/hash/normalize/quarantine — **LOCAL_VERIFIED** · `canonicalReorderedKeysDedupButChangedHashCreatesRevision`, `invalidRowsRemainQuarantinedAndPartialDoesNotAdvanceCheckpoint`, `priceNormalizationAndLocalAddressRespectFrozenCommandSchema`.
- [x] P01-IG-05: Match source link trước, candidate, NEEDS_REVIEW, threshold fixture — **LOCAL_VERIFIED** · `conflictsRequireReviewAndNeverUpdateLinkBeforeApplied`, `matchingGroundTruthIsOnlyFixtureCalibration`.
- [x] P01-IG-06: Command UUID cố định, expected version, retry/dedup, checkpoint chỉ tiến khi đủ ack — **LOCAL_VERIFIED** · `duplicateInputStableRetryAndDelayedAckNeverAdvanceCheckpoint`.
- [x] P01-IG-07: Publish upsert-requested/source-policy; xử lý Catalog result qua inbox — **LOCAL_VERIFIED** · `BrokerDatabaseTests` (12).
- [x] P01-IG-08: Candidate client, broker harness duplicate/delay/crash, provider policy APIs — **LOCAL_VERIFIED** · `allFrozenAdminAndInternalProviderOperationsUseRealRows`, `LimitedBodyHandlerTests`.
- [x] P01-IG-09: Replay giữ accounting/UUID; missing ack không SUCCEEDED — **LOCAL_VERIFIED** · test IG-06, `paginationReplayAndDeletionAnonymizationKeepProvenance`.
- [x] P01-IG-10: PARTIAL/retry/revoke/protected-field conflict — **LOCAL_VERIFIED** · test IG-03/IG-04/IG-05.
- [ ] P01-IG-11: Bàn giao schema/API/event/image/test/runbook replay — **PARTIAL** · [README](../backend/services/ingestion-service/README.md) có replay runbook · thiếu chữ ký N2, run ID CI, sửa số operation trong README.

### Intelligence — [yêu cầu](../plan/phases/P01-services/intelligence.md) · owner N2 · reviewer N1

Source `backend/services/intelligence-service/`: migrations V1–V10, V2 có 5 bảng baseline + 5 bảng ML + 4 bảng kỹ thuật; 14/14 operation + 2 endpoint P02; 38 tests.

- [x] P01-IN-01: Flyway 10+4, lineage, baseline/ML tables — **LOCAL_VERIFIED** · V2, V6 (embeddings) · PR #5, #14.
- [x] P01-IN-02: App/workers/security/health/image/CI, stubs/harness/storage — **LOCAL_VERIFIED** · `RuntimeGuardTests` · lưu artifact trên filesystem volume.
- [x] P01-IN-03: Interaction client/server, dedup/rate/retention/history/consent — **LOCAL_VERIFIED** · `clientDedupConsentRevokeTombstoneAndServerAttribution`, `rateRetentionSignedCursorAndInvalidClientEvent`.
- [x] P01-IN-04: Feature projections versioned, snapshot rebuild, hard filters, cold-start, fallback — **LOCAL_VERIFIED** · `hardFiltersMissingUnknownFinalVisibilityStableSmoothing`, `SnapshotRebuildTests` (3).
- [x] P01-IN-05: Dataset version/checksum/schema/license/consent — **LOCAL_VERIFIED** · `immutableDatasetTrainingReproducibilityValidationActivationRollback`.
- [x] P01-IN-06: Training job/cancel/artifact, validation, activation/rollback, inference deadline/fallback — **LOCAL_VERIFIED** · cùng test IN-05, `hiddenPagesAndSlowResponseBodyHaveOneBoundedBudget`.
- [x] P01-IN-07: Revoke/deletion impact, quality gate được định nghĩa (không tự bật production) — **LOCAL_VERIFIED** · `sourceRevocationSerializesUntilFinalCatalogValidationCompletes`, [README runbook](../backend/services/intelligence-service/README.md).
- [x] P01-IN-08: Clients/handlers/outbox/inbox, publish model.deployed, deletion ack — **LOCAL_VERIFIED** · `BrokerDatabaseTests` (4), `EventContractsTests`. Phía consumer model.deployed tại Identity chưa có (F-01).
- [x] P01-IN-09: Provider contract recommendation, schema change/revocation — **LOCAL_VERIFIED** · `httpGuestContractAndScopeOwnership`, `versionsIndependentInboxAndUnsupportedSchema`.
- [x] P01-IN-10: Golden scoring/filter/cold-start/consent/visibility, tái lập — **LOCAL_VERIFIED** · `hardFiltersMissingUnknownFinalVisibilityStableSmoothing`, `snapshotCannotOverwriteNewerRatingOrRevokedConsentAndTripAttributionDedups`.
- [x] P01-IN-11: Không đếm đôi, dataset cấm, checksum, kích hoạt đồng thời, fallback, reproducibility — **LOCAL_VERIFIED** · test IN-05/IN-06, `oldTripSnapshotDoesNotResurrectPurgedHistoryAfterConsentReenabled`.
- [ ] P01-IN-12: Bàn giao code/image/migrations/scoring config/fixture datasets/test report/runbook — **PARTIAL** · README 171 dòng có runbook model · thiếu chữ ký N1, run ID CI PR #14. Chất lượng model trên dữ liệu thật thuộc P03-09/10.

### Gateway và frontend client (platform, PR #15)

- [x] Gateway routes/security policies standalone — **LOCAL_VERIFIED** · scan 20/10/2026 `backend/mvnw.cmd -B -f backend/platform/api-gateway/pom.xml verify`: 14/14 PASS · PR #15 (`42eac23`), bổ sung ở PR #16.
- [x] Frontend API/rotating auth client — **LOCAL_VERIFIED** · scan 20/10/2026 `npm run test:contracts` 7/7, `npm run build` PASS, `npm audit` 0 vulnerabilities.
- [ ] Review platform (N2) — **NOT_STARTED**.

- [ ] **Gate P01:** 6/6 READY_FOR_INTEGRATION có owner/reviewer xác nhận — **PARTIAL**. Người dùng đã chấp nhận P01 trên checkout gốc ngày 11/10/2026 (nguồn: [P02_README](../backend/infra/P02_README.md)); code đã merge vào `main` ngày 15/10/2026. Thiếu: chữ ký N1/N2 cho từng gói và run ID CI. Agent không tự đóng gate.

## P02 — Kết nối thật

Nguồn: [checklist P02](../plan/phases/P02-service-integration.md). Code: PR #16 (`14b342c`, 15/10/2026), PR #17 (`9f4beca`, 16/10/2026). Evidence connected: local ngày **11/10/2026** trên checkout gốc có thay đổi chưa commit (dirty), ghi tại [P02_README — Verification checkpoint](../backend/infra/P02_README.md#verification-checkpoint---11-october-2026). Bàn giao: [2026-10-15-p02-github-delivery.md](evidence/2026-10-15-p02-github-delivery.md). Lượt scan 20/10/2026 **không** chạy lại được connected suite vì không có Docker. Job CI `connected` chưa có run ID (F-09).

- [x] P02-00: Đối chiếu revision/checksum/migration/test của sáu gói — **LOCAL_VERIFIED** · `python backend/infra/p02.py manifest` ghi checksum source, image ID và JAR hash. Scan 20/10: checksum contract 66/66.
- [ ] P02-01: Môi trường integration: DB/credential riêng, broker/ACL/DLQ, object storage, secrets, DNS, tracing/log/metrics — **PARTIAL** · đã có sáu DB, RabbitMQ ACL/DLQ, secrets ignored, `monitor.json`/`dashboard.html` · thiếu object storage (dùng Docker volume) và distributed tracing (F-06).
- [x] P02-02: Auth và Gateway: token Identity qua sáu service, revoked bị chặn — **LOCAL_VERIFIED** · `p02_smoke.py` "PASS Identity issuer -> six services", "PASS revoked Identity session rejected by downstream service"; `realSignedTokenExchangesAcrossSixServicesAndRevocationFailsClosed`.
- [x] P02-03: Catalog reads cho Identity/Community/Trip/Intelligence — **LOCAL_VERIFIED** · `p02.py smoke`: PUT preferences với category Catalog thật, review/favorite/trip item qua Catalog validate/batch, `features/rebuild` đọc `features-snapshot`.
- [x] P02-04: Community ↔ Catalog rating/visibility/contribution — **LOCAL_VERIFIED** · smoke "review moderation -> real rating summary", "Community rating event -> Catalog persisted summary"; `p02_faults.py` contribution.
- [x] P02-05: Ingestion ↔ Catalog import 2 lần, mất ack retry an toàn — **LOCAL_VERIFIED** · smoke "PASS import replay preserves real Catalog place IDs"; `p02_import_ack_test.py` PASS; `p02_transport_test.py` PASS.
- [x] P02-06: Intelligence inputs snapshot+delta, revoke — **LOCAL_VERIFIED** · `p02_faults.py` concurrent snapshot/delta; `p02_privacy_test.py` PASS.
- [x] P02-07: Recommendation ↔ Trip, item-added về history đúng một lần — **LOCAL_VERIFIED** · smoke "recommendation -> Trip item -> Intelligence history"; fault "duplicate real event inbox dedup".
- [ ] P02-08: Notification và deletion/ack — **PARTIAL** · đã kiểm notification từ domain event, SMTP Mailpit, đủ 6 deletion ack, thiếu Trip ack thì vẫn pending · thiếu: notification cho contribution applied/rejected và model.deployed theo registry (F-01).
- [x] P02-09: Frontend/provider: UI gọi Gateway thật, provider sandbox được ghi rõ — **LOCAL_VERIFIED** · `npm run test:gateway`, `npm run test:browser` PASS 11/10. Màn `TravelApp`, `TripEditor`, `OperationalPanels`. Email = Mailpit sandbox, nguồn = synthetic licensed sandbox, routing = fallback ứng dụng.
- [x] P02-10: Gateway route specificity, internal/actuator bị chặn, principal exchange, credential per-destination — **LOCAL_VERIFIED** · `GatewayRoutingTests`, `PrincipalExchangeFilterTests`, smoke "Gateway exposed internal route" (negative).
- [x] P02-11: Bootstrap snapshot + watermark + delta + dedup — **LOCAL_VERIFIED** · `POST /internal/v1/features/rebuild`, `SnapshotRebuildTests`, fault "concurrent snapshot plus delta retains final Catalog version".
- [x] P02-12: Transport outbox/inbox/retry/DLQ/replay, crash sau commit — **LOCAL_VERIFIED** · `p02_transport_test.py`, fault "crash after upstream DB commit -> durable projection recovery"; monitor 0 DLQ, `alarms=[]`.
- [x] P02-13: Không trỏ stub/test issuer/fixture source; provider sandbox/blocked ghi rõ — **LOCAL_VERIFIED** · P02 không cài `p01_fixture`/`p01.capture`; [P02_README — Provider coverage](../backend/infra/P02_README.md#provider-coverage-and-evidence).
- [ ] P02-14: Schema evolution old/new contract — **NOT_STARTED** · mới có test reject schema không hỗ trợ trong từng service; chưa có revision contract thứ hai để kiểm (F-07).
- [ ] **Gate P02:** 6/6 CONNECTED, không còn stub, core flows/frontend có evidence — **PARTIAL** · P02_README tự ghi "All P02 tasks COMPLETE" trên checkout dirty 11/10. Theo đối chiếu 20/10 còn P02-01/08/14, run ID CI `connected`, chữ ký N1/N2.

## P03 — Kiểm thử hệ thống

Nguồn: [checklist P03](../plan/phases/P03-system-verification.md). **NOT_STARTED** trên `main`. Delivery P02 ghi tooling P03 nằm trong workspace gốc, chưa commit, nên không có evidence trong repo.

- [ ] P03-01: Contract compatibility giữa producer/consumer/frontend — **NOT_STARTED** · đầu vào: F-01, F-02, F-07.
- [ ] P03-02: E2E core flows và business/import/ML — **NOT_STARTED**.
- [ ] P03-03: Outage/crash/retry/dedup/DLQ/reconciliation — **NOT_STARTED** · P02 fault suite là đầu vào, chưa phải evidence P03.
- [ ] P03-04: Authorization/security/upload/rate limit/secret/PII — **NOT_STARTED**.
- [ ] P03-05: Load/EXPLAIN/index/pool/timeout/backpressure — **NOT_STARTED** · đầu vào F-04.
- [ ] P03-06: Backup/restore/rebuild/retention/deletion/revocation — **NOT_STARTED**.
- [ ] P03-07: Frontend responsive/accessibility/loading/error/async — **NOT_STARTED**.
- [ ] P03-08: Release evidence/findings/dashboards/runbook/owner vận hành — **NOT_STARTED**.
- [ ] P03-09: Dữ liệu thực hợp lệ và ML holdout evaluation — **NOT_STARTED**.
- [ ] P03-10: So model với Basic; giữ Basic nếu quality gate chưa đạt — **NOT_STARTED**.
- [ ] P03-11: Provider coverage và SYSTEM_VERIFIED — **NOT_STARTED**.
- [ ] **Gate P03** — **NOT_STARTED**.

## P04 — Phát hành

Nguồn: [checklist P04](../plan/phases/P04-migration-release.md). **NOT_STARTED**. Scope hiện hành là triển khai mới ([P00-DECISIONS](../plan/P00-DECISIONS.md)), nên P04-02 dự kiến `N/A` khi có quyết định chính thức ở P04-01.

- [ ] P04-01: Chọn triển khai mới hoặc chuyển dữ liệu — **NOT_STARTED** (P00 đã chọn triển khai mới, cần xác nhận lại tại P04).
- [ ] P04-02: Backfill/mapping/quarantine/checksum/delta (nếu migration) — **NOT_STARTED**.
- [ ] P04-03: Rehearsal staging và go/no-go — **NOT_STARTED**.
- [ ] P04-04: Freeze/drain/watermark/switch writer và traffic — **NOT_STARTED**.
- [ ] P04-05: Rollback/reverse-sync/forward-fix — **NOT_STARTED**.
- [ ] P04-06: Stability window/DLQ/quarantine/decommission/archive — **NOT_STARTED**.
- [ ] P04-07: Bàn giao deployment/cost/metrics/backup/access/backlog — **NOT_STARTED**.
- [ ] **Gate P04** — **NOT_STARTED**.

## Findings đang mở

Chi tiết và cách phát hiện: [2026-10-20-source-scan.md](evidence/2026-10-20-source-scan.md#5-findings). Khi đóng một finding, ghi ngày đóng, commit/PR và người xác nhận ngay trên dòng của finding đó, không xóa dòng.

| ID | Mức | Tóm tắt | Owner | Trạng thái |
|---|---|---|---|---|
| F-01 | Cao | Identity không consume `catalog.contribution.applied/rejected.v1`, `intelligence.model.deployed.v1`; message bị bỏ âm thầm trong P02 | N1 + N2 | OPEN |
| F-02 | Trung bình | 9 endpoint ngoài contract candidate (2 endpoint media Catalog không phải internal) | N1, N2 | OPEN |
| F-03 | Thấp | Seed chưa có category `homestay` | N1 | OPEN |
| F-04 | Thấp | Alias search `LIKE '%q%'` không có index | N1 | OPEN (P03-05) |
| F-05 | Trung bình | Gate P00/freeze contract chưa đóng nhưng P01/P02 đã merge | Điều phối | OPEN |
| F-06 | Trung bình | P02-01 thiếu object storage, distributed tracing | N1 | OPEN |
| F-07 | Trung bình | Chưa có test schema evolution | Owner producer/consumer | OPEN |
| F-08 | Thấp | Dòng trạng thái trong `plan/` lỗi thời | Điều phối | CLOSED 20/10/2026 trong nhánh `docs/progress-source-sync` (chờ merge) |
| F-09 | Trung bình | Thiếu run ID CI cho PR #14–#17 | Người merge | OPEN |
| F-10 | Thấp | PR #3/#4 chưa có trong progress | Người làm PR | PARTIAL: đã ghi mục, chờ owner xác nhận evidence |
| F-11 | Thông tin | Scan 20/10 dùng Java 25, thiếu Docker/Python | — | OPEN đến khi chạy lại đủ |
| F-12 | Trung bình | CI MongoDB8 bị chặn bởi kernel runner>=6.19 (SERVER-121912); đã pin job DB Ubuntu22.04, chờ CI revision cuối | Điều phối/CI | CLOSED 21/10/2026 - CI source `0bcdca4`, PR #20; reviewer: coordinating agent · `3b699bd`, [evidence](evidence/2026-10-21-github-delivery-ci.md) |
| F-13 | Trung bình | Health Catalog chưa chứng minh đường đọc Community→Catalog phục hồi sau outage; final CI107fed9 fail503, đã bổ sung GET probe hữu hạn, chờ CI mới | Điều phối/CI | PARTIAL · `d8cf51c`, [evidence](evidence/2026-10-21-github-delivery-ci.md) |

Task không áp dụng phải ghi `N/A` kèm lý do và quyết định scope, không tự tích hoàn thành.
