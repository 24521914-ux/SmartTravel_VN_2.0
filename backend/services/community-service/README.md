# Community - P01 implementation

MongoDB 8 replica-set transactions; V1 baseline, V2 name limits, V3 user mutation fences.
Port 8103, JWT audience `community`. Owns reviews/moderation/rating/favorites, collections,
contribution application, UGC media, visibility and deletion handling. Set MONGODB_URI
(replica-set URI), JWT_JWKS_URI/JWT_ISSUER, catalog.base-url/catalog.service-token,
and community.media.scanner-url. No SQL/Flyway substitutes Mongo storage acceptance.

## Domain evidence and examples

Tests cover approve/edit/hide/restore/delete COUNT/SUM, concurrent approvals/reorder,
duplicate favorites/results, private cross-user denial, missing ack staying APPLYING,
conflict APPLY_FAILED, stale visibility/status, deletion and UGC ownership/quarantine.
Collection item reads authorize access before the real batch Catalog lookup; internal
snapshots are stripped from frozen item representations. Missing/hidden/unavailable partner
records close reads and new-place writes. Per-user user_mutation_fences serialize UGC
mutations with deletion/status in the same transaction. A concurrency test holds deletion
open and proves a racing collection mutation aborts, then post-ack review/collection writes
cannot recreate deleted data. Audit/moderation collections remain append-only.

POST /api/v1/me/collections with {"name":"My trip","visibility":"PRIVATE"} creates a
private collection. Item/reorder mutations send the current parent If-Match; reorder must
contain the exact unique item set. New/edited reviews are PENDING; only APPROVED reviews
contribute to ratings. Contribution approval enters APPLYING; only matching Catalog result
sets APPLIED/APPLY_FAILED. Reconcile rating from source APPROVED reviews, never edit averages.

## Storage runbook

V1 canonical LF SHA-256:
1830d58c5c42a83ac2de46824c9964aa161f94117e32eb02d7b95ab35fd30e1f.
Do not rewrite applied migrations or repair checksums. Migration identity owns DDL; app
startup validates V1/V2/V3 raw bytes. Shared persistent permission/rollback probes:

```bash
python backend/infra/p01.py up --service community
python backend/infra/p01.py verify --service community
python backend/infra/p01.py smoke --service community
```

## Verification

Verified 2026-10-11: 27 tests passed, zero failures/errors/skips, 32 frozen provider
operations covered, and packaged image probe passed from the verified jar.


Run from the repository root with Docker and Java 21:

```bash
python backend/services/community-service/test-local.py --transport
python backend/platform/build_service_image.py community --tag smarttravel-community:p01-finish-local
python backend/services/community-service/check-local.py --image smarttravel-community:p01-finish-local
```

The disposable DB/broker runner runs `clean verify`. Provider tests exercise every frozen
OpenAPI operation and validate response/event schemas. Reports: `target/surefire-reports`.
The packaged non-root image probe uses owned storage/JWKS and real RS256 tokens, verifies
readiness/liveness/authorization, and persisted create/read/delete. It cleans only its own
containers/networks. Existing persistent volumes are untouched.

Frozen requests/examples: `backend/contracts/openapi/community.yaml`; event fixtures:
`backend/contracts/fixtures/events`. Local HTTP/JWKS adapters use the `local` profile.
Nonfixture profiles require explicit HTTPS partners and workload credentials.
Partner HTTP bodies are limited to 1 MB and an absolute two-second deadline.
Human owner/reviewer READY_FOR_INTEGRATION signatures remain separate from automated evidence.

## Transport operations

Enable `COMMUNITY_TRANSPORT_ENABLED=true` with injected runtime broker credentials.
Confirmed publishing, inbox deduplication, retries/DLQ, publish-before-commit crash recovery,
poison exhaustion and audited operator replay are covered with an owned real broker.
Inject separate operator credentials before replay:

```bash
python backend/services/community-service/community-ops.py replay-dlq
python backend/services/community-service/community-ops.py replay-outbox --event-id <uuid>
```

Replay preserves event IDs. Production partner connections and object storage/scanner
replace P01 adapters in P02; no runtime dependency on partner services is needed for P01 tests.

Scanner adapter verification: POST /scan uses the same 1 MB/absolute two-second client.
Real HTTP tests cover clean approve, oversized chunked body, stalled body after headers,
HTTP 503 and clean=false; no failed scanner response can approve quarantined media.
