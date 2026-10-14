# Intelligence P01

Java21/Spring Boot/PostgreSQL16+pgvector. Port8106, JWT audience intelligence.
SQL lives in feature repositories; transactions live in service facades. V1-V3 immutable.

## Verification

From root: `python backend/services/intelligence-service/test-local.py --transport`.
Owned disposable PostgreSQL+pgvector and Rabbit containers use random credentials and
are removed in finally. No partner DB, shared volume or developer service is modified.
Reports: target/surefire-reports. Maven alone skips real DB tests; without --transport
the broker tests are skipped. Basic PostgreSQL/HTTP golden gate passed before ML was written.
Current local evidence (11/10/2026): **32/32 PASS**, no failures/errors/skips: twenty-one real
PostgreSQL/pgvector/domain/HTTP+ML tests (all fourteen frozen operations), four real Rabbit
fault tests, and seven security/contract tests. Non-root image `smarttravel-intelligence:p01-finish-local`
passed independent disposable DB smoke, nine successful migrations (V1-V9), UP health/readiness/
liveness, guest recommendation fields and writable artifact storage. Partner integration,
remote CI and owner/reviewer signatures are separate evidence.

Reproduce the verified jar and packaged image from the repository root:

```powershell
python backend/services/intelligence-service/test-local.py --transport
python backend/platform/build_service_image.py intelligence --tag smarttravel-intelligence:p01-finish-local
python backend/services/intelligence-service/check-local.py --image smarttravel-intelligence:p01-finish-local
```

Golden tests cover hard budget/currency/category/visibility filters, unknown prices,
smoothed ratings/stable scores, consent/stale events/deletion tombstones, history
owner/rate/retention, independent Catalog/rating versions, rating-first delivery,
rebuild and pgvector, scopes/JWKS, deterministic fitted models/checksum/license/cancel,
concurrent activation/rollback, inference deadline fallback, broker duplicate/crash
at confirm-before-DB commit, bounded retries, poison DLQ/replay and publisher ACL.

## Runtime

Build: backend/mvnw.cmd -B -f backend/services/intelligence-service/pom.xml verify.
Inject DB_URL/DB_USER=intelligence_runtime/DB_PASSWORD; DB_MIGRATION_USER=intelligence_migrator/
DB_MIGRATION_PASSWORD; JWT_JWKS_URI/JWT_ISSUER; CATALOG_URL/INGESTION_URL and
INTELLIGENCE_WORKLOAD_TOKEN with Catalog/source-policy internal scopes.
Platform admin provisions vector extension before Flyway; runtime cannot create it.
Standalone local/image probes use explicit `SPRING_PROFILES_ACTIVE=p01local`; DB tests
use `test`. Outside local/test profiles the app requires HTTPS JWKS, Catalog and Ingestion
origins without embedded credentials, an injected workload token, and authenticated
transport. Mixed local/production profiles and production fixture capture are rejected.
INTELLIGENCE_ARTIFACT_ROOT selects service-owned content-address local object storage.
Image /app/artifacts is writable by UID10001; mount durable storage there.
Artifact keys are SHA256 filenames; APIs expose checksums, never public artifact URLs.

Rabbit: INTELLIGENCE_TRANSPORT_ENABLED=true plus BROKER_HOST/PORT/USERNAME/PASSWORD/VHOST.
Workload intelligence_runtime cannot impersonate partners by publishing to inbound.
Fixture capture defaults off (intelligence.transport.fixture-capture is test only).
Rabbit health is enabled only with transport. /actuator/health and recommendations
are public; intelligence:read/write/admin protect other public APIs. Internal event/
rebuild require intelligence:internal. Request bodies and incoming events are bounded.

## Basic/projections

Only SEARCH/PLACE_VIEW are client events. query free text is deliberately never persisted
(history query=null). Current projected consent version is required. Server favorite,
CREATED review, trip-item events alone create their corresponding interactions. Inbox
and domain mutation share a transaction. BLOCKED users cannot regain personalization
through newer preferences; deletion tombstones prevent resurrection by delayed events.

Weights: category .30, preference .25, rating .20, distance .15, budget .10, normalized over
available components. Rating prior3.5/10 observations; haversine distance in metres.
Hard filters precede scoring; tie UUID string ascending. Final Catalog HTTP validation
removes hidden/missing/version-mismatched candidates; dependency failure returns503.
Frozen response fields stay exact: request_id/version/data_as_of/fallback/items;
explanation string embeds component/missing/fallback JSON. Owner/limit/keyset cursors
are signed with a process-held secret and invalidate on restart.

POST /internal/v1/features/rebuild reads paginated Catalog snapshots using one watermark,
monotonic versions and a10-second deadline; audit is atomic with rebuild. A newer hidden
projection cannot be replaced by an old snapshot. Rating-first creates a DRAFT placeholder
that Catalog v1 replaces. Embedding vector(3)=[1,rating_fraction,popularity_fraction],
HNSW cosine index; Basic itself remains independent of nearest-neighbour retrieval.

## Licensed fixture/model runbook

BasicDatabaseTests.datasetFixture generates30 synthetic public observations and registers
a source UUID/license CC0-1.0-synthetic with the source-policy HTTP stub. No real personal
records/external copyrighted dataset. The fixture snapshot adapter reads ONLY local public
projections, carrying source provenance. Frozen Catalog events lack source UUID: P02 must
reconcile Ingestion source-link snapshots before real-source builds; missing lineage fails
rather than inferring a source. Personal datasets are not admitted by this public adapter.

1. Admin POST/datasets: source_ids, feature_schema_version=1, start/end criteria. Current
   policies must permit training; minimum15 rows. Immutable artifact retains source/license
   versions/schema/criteria/consent cutoff/personal_data=false. Checksum+lineage+audit commit.
2. POST/training-jobs: dataset_id, seed>=0, code_revision<=1024chars.202 queues a job. Worker
   claims with SKIP LOCKED and fits a REAL three-weight linear SGD model; 300iterations/.05
   learning rate/.001regularization. Temporal60/20/20 train/validation/test splits. Identical
   dataset+code+seed yields the same model checksum. Params/seed/revision/metrics/log artifact
   persist. Queued/running cancellation prevents successful commit; crash-stale RUNNING
   jobs fail after15minutes. Training errors are recorded without exception/PII payloads.
3. Inspect models/metrics; validate with reason. Fixture gate: schema/checksum/finite weights,
   at least3heldout rows, MSE<.1,NDCG@10>=.5. Metrics record measured Precision/NDCG and Basic
   baseline against public smoothed relevance labels (not user utility).
4. Deploy validated model or rollback previously deployed validated model. Transaction lock
   plus unique active index guarantees one active/use case. Audit+frozen model.deployed event
   use PLACE_RECOMMENDATION. Policy/license checked again at train/validate/deploy/inference.
5. Source/license revoke or consent lineage purge revokes datasets/models/deactivates them;
   old events cannot restore. Bounded2worker/10queue inference pool and100ms default deadline
   falls back to Basic on timeout/busy/load/schema/checksum/policy failure with stored reason.

PRODUCTION ACTIVATION DEFAULTS OFF: INTELLIGENCE_MODEL_DEPLOYMENT_ENABLED=false. The fixture
only proves mechanism, not model quality. P03 requires real licensed heldout observations,
adequate sample size/confidence, leakage/coverage checks and measured improvement over
Basic before approving production activation. Synthetic labels cannot prove user utility.

## Retention/recovery

Workers purge interactions older90days and expired idempotency/rate windows. Unreferenced
artifacts older7days are physically removed; live references retained. Deletion ack describes
revocation with asynchronous physical purge. --intelligence.workers-enabled=false disables
workers for deterministic tests/maintenance.

Outbox confirms+mandatory routing precede published_at; bounded8attempt exponential backoff
ends with failed_at. Incoming strict frozen JSON-schema poison retries3times then DLQ;
failed parse never silently commits inbox. Confirm-before-DB crash safely replays duplicates.

python backend/services/intelligence-service/intelligence-ops.py replay-outbox --event-id UUID
python backend/services/intelligence-service/intelligence-ops.py replay-dlq

Inject DB/JWT config; DLQ additionally requires intelligence.operator.broker-user and
intelligence.operator.broker-password via env. Normal workload cannot publish inbound; use
separate restricted operator credentials. Operator disables workers/listeners/migrations,
audits, confirms publish BEFORE ACK then exits. Malformed DLQ metadata is retained.

Independent review corrections (11/10/2026): history purge preserves current consent/preferences;
idempotency digests include the target resource and keys are at most128characters. V8 widens
license/code fields to the frozen1024character bounds. Internal routes require workload client_id
and reject session sid. Arbitrary workload subject strings map to stable audit UUIDs.
Active-model checksum/schema failures now produce a persisted Basic fallback with
MODEL_VALIDATION_FAILED. Artifact weights must be a three-element numeric array;
numeric strings and objects cannot pass validation. Final Catalog visibility validation
runs outside the model fallback catch boundary and still fails closed with503 without
storing a response. Regression tests exercise checksum mismatch, unsupported schema,
nonnumeric/object weights and the delayed final Catalog check on an active model.

All admin model mutations and idempotency replays acquire the same per-user transaction
lock as Identity status/deletion handlers. Projected inactive status or a deletion tombstone
rejects mutation with403. This includes cancellation and direct service entrypoints; a
concurrent mutation either commits before deletion and is scrubbed, or waits and rejects.
Client interaction writes/history deletion use the same fence. Anonymous recommendations
remain available without reintroducing the deleted account identifier.

V9 adds a restricted SECURITY DEFINER actor-purge function: runtime still cannot directly
update/delete audit rows. Deletion removes actor rate/idempotency keys and dataset-user
lineage after revocation, clears dataset/deployment administrator identifiers and deployment
reasons, and anonymizes matching audit identifiers/payloads. Only the minimal deletion
tombstone remains. Licensed public dataset/model artifacts survive administrator deletion;
datasets carrying that user's consent lineage are revoked before their lineage is removed.

Recommendations shortlist at most1000published local projections in stable UUID order, apply
hard filters and scores, then validate batches of100 against Catalog until topN is reached.
This bounds memory and partner calls; beyond the shortlist no global-optimum claim is made.
One3second request budget covers retrieval/inference/final validation; database lock waits500ms,
individual statement2.5seconds; partner bodies at most1MiB and2seconds including slow chunks.
Timeout fails closed503 without storing an unvalidated recommendation. Inference workers
hold no database locks: the outer response transaction holds source locks before deployment
lock through final visibility validation, so a revocation cannot commit before an in-flight
model recommendation. Broker and HTTP events older30days or more than60seconds future reject
before inbox mutation, preserving the dedup-retention boundary.
