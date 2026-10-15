# Catalog - P01 implementation

PostgreSQL 16/PostGIS; Flyway V1-V8; separate migration/runtime users.
Port 8102, JWT audience `catalog`. Owns canonical places, geo/aliases/effective periods,
destinations/taxonomy, opening hours/price/media, offerings, businesses/claims/change requests.
Set DB_URL/DB_USER/DB_PASSWORD/DB_MIGRATION_USER/DB_MIGRATION_PASSWORD and JWT_JWKS_URI/JWT_ISSUER.
Persistent cursor signing key must contain at least 32 characters outside fixture profiles.

## Domain evidence and examples

Tests cover Vietnamese/old-name search, unknown versus free price, distance in meters,
concurrent version updates, hierarchy cycles/effective overlap, overnight/24h/holiday hours,
unauthorized business/claim conflicts, command deduplication/protected-field rejection,
source revocation, stale ratings, cursor tampering/filter binding and deletion concurrency.
Real `EXPLAIN` with `enable_seqscan=off` proves GiST usability for ST_DWithin; this checks
index eligibility and does not claim a production latency benchmark. Private evidence
remains inaccessible after approval. Per-user transaction advisory locks serialize mutations
with status/deletion, so completed deletion cannot leave new business PII behind.

Admin: POST /api/v1/admin/places with Idempotency-Key creates DRAFT; PUT
/api/v1/admin/places/{place_id}/status with {"status":"PUBLISHED"} and If-Match: "1" publishes.
BUSINESS must have verified membership and an approved place claim before change requests.
A competing edit returns conflict. Lower-priority differing protected fields emit
PROTECTED_FIELD_CONFLICT rejected, preserve the canonical value and do not claim applied.
Rollback uses corrective versions, never reduced versions or deleted canonical history.

## Verification

Verified 2026-10-11: 26 tests passed, zero failures/errors/skips, 66 frozen provider
operations covered, and packaged image probe passed from the verified jar.


Run from the repository root with Docker and Java 21:

```bash
python backend/services/catalog-service/test-local.py --transport
python backend/platform/build_service_image.py catalog --tag smarttravel-catalog:p01-finish-local
python backend/services/catalog-service/check-local.py --image smarttravel-catalog:p01-finish-local
```

The disposable DB/broker runner runs `clean verify`. Provider tests exercise every frozen
OpenAPI operation and validate response/event schemas. Reports: `target/surefire-reports`.
The packaged non-root image probe uses owned storage/JWKS and real RS256 tokens, verifies
readiness/liveness/authorization, and persisted create/read/delete. It cleans only its own
containers/networks. Existing persistent volumes are untouched.

Frozen requests/examples: `backend/contracts/openapi/catalog.yaml`; event fixtures:
`backend/contracts/fixtures/events`. Local HTTP/JWKS adapters use the `local` profile.
Nonfixture profiles require explicit HTTPS partners and workload credentials.
Partner HTTP bodies are limited to 1 MB and an absolute two-second deadline.
Human owner/reviewer READY_FOR_INTEGRATION signatures remain separate from automated evidence.

## Transport operations

Enable `CATALOG_TRANSPORT_ENABLED=true` with injected runtime broker credentials.
Confirmed publishing, inbox deduplication, retries/DLQ, publish-before-commit crash recovery,
poison exhaustion and audited operator replay are covered with an owned real broker.
Inject separate operator credentials before replay:

```bash
python backend/services/catalog-service/catalog-ops.py replay-dlq
python backend/services/catalog-service/catalog-ops.py replay-outbox --event-id <uuid>
```

Replay preserves event IDs. Production partner connections and object storage/scanner
replace P01 adapters in P02; no runtime dependency on partner services is needed for P01 tests.

Scanner adapter verification: POST /scan uses the same 1 MB/absolute two-second client.
Real HTTP tests cover clean approve, oversized chunked body, stalled body after headers,
HTTP 503 and clean=false; no failed scanner response can approve quarantined media.

### P02 internal feature bootstrap

`GET /internal/v1/places/features-snapshot?limit=100&cursor=...` requires a workload token with `catalog:places:read`. It adds optional `source_id` from the latest audited imported place version to the standard place snapshot. The frozen public API/events remain unchanged. Pagination returns `items`, `next_cursor`, `as_of`, and a source watermark; changing snapshots reject the cursor, so the caller retries the complete rebuild. Intelligence merges each row by Catalog version and separately loads license policies from Ingestion. Start durable consumers before rebuilding so in-flight deltas remain in the inbox. Repeat rebuild after imports when licensed dataset preparation needs current lineage.
