# Trip - P01 independent implementation

Implements all 29 frozen Trip operations on PostgreSQL, using separate Catalog/routing HTTP adapters. P01 partners are explicitly labelled stubs; this service does not require any other service to boot. Candidate contracts under `backend/contracts` remain unchanged. Scope `trip:read`/`trip:write`, JWT audience `trip`, port8104.

## Verify

From repository root:

```powershell
python backend/services/trip-service/test-local.py --transport
python backend/platform/validate_contracts.py
python backend/platform/test_service_layout.py
```

The runner creates owned disposable PostgreSQL16 and RabbitMQ4.1 containers, random passwords/ports and separate migrator/runtime roles. It cleans up only its containers. DOMAIN_DB_TESTS/DOMAIN_TRANSPORT_TESTS explicitly enable database/broker suites; ordinary Maven without these flags skips them and must not be reported as full verification. HTTP provider tests exercise all29 operations against actual migrated rows and validate responses against frozen schemas; database tests additionally check concurrent reorder, owner/date/cross-trip rejection, idempotency, Catalog outage, routing fallback, locked/completed snapshots, visibility ordering, deletion and paging mutation.

Broker tests verify publish confirms+mandatory returns, retained outbox retry, duplicate deletion, poison retry/DLQ, original-routing replay, producer ACL, exhausted retries and mismatched routing. Remote CI and independent review must be recorded separately in progress.

## Local runtime and fixture

Use `python backend/infra/p01.py up --service trip` for its own DB and broker. Export DB_URL/DB_USER/DB_PASSWORD and migration credentials from the ignored local configuration without printing secrets. Set SPRING_PROFILES_ACTIVE=local, JWT_JWKS_URI/JWT_ISSUER to a signed test-JWKS server, CATALOG_BASE_URL/CATALOG_TOKEN to the Catalog HTTP stub, and ROUTING_URL to the routing fixture endpoint. JWT test tokens and workload tokens are separate: end-user tokens do not obtain Catalog internal scopes. Enable TRANSPORT_ENABLED=true and inject BROKER_HOST/PORT/USERNAME/PASSWORD/VHOST. Runtime ACL can publish only Trip events and its deletion acknowledgements, and cannot impersonate partners on the inbound exchange. Partner fixture publisher injects schema-valid envelopes to `trip.inbound`; `trip.p01.capture` is declared only under local profile and binds `trip.#` and `domain.#`.

FIXTURES_ENABLED=true only in local profile seeds a labelled synthetic owner itinerary: two destinations, three days, two visits with saved price/geocoordinate/catalog snapshots. It is opt-in and never migrates production demo data. V1-V4 remain immutable; V4 adds editor/security/idempotency helpers. V5 aligns persisted name/snapshot text bounds with frozen1024-character fields. Separate DB roles retain schema owner/runtime privilege boundaries.

Build `.\backend\mvnw.cmd -B -f backend/services/trip-service/pom.xml verify`; run `java -jar backend/services/trip-service/target/trip-service-0.0.1-SNAPSHOT.jar`. Linux uses `bash backend/mvnw`. Build the non-root image with `python backend/platform/build_service_image.py trip --tag smarttravel-trip:p01-local`; use Compose DNS and mount/inject environment secrets separately. Health readiness checks DB, liveness is process-only; Rabbit outages do not pretend the process is dead. Structured logs carry sanitized correlation IDs, body256KiB and database acquisition3s are bounded. Production refuses local/test mixed profiles, HTTP/loopback partner endpoints, missing workload token, fixtures or disabled transport.

## Editor rules and recovery

Every child mutation locks and versions the owning trip, and response ETag/version comes from the parent. Reorder accepts the exact item set, uses deferrable uniqueness and concurrent losers return409. Dates outside trip range and cross-trip foreign keys are rejected. Locked items require explicit unlock; completed snapshots cannot refresh. Since snapshots are shared per trip/place, adding or refreshing another visit also respects all locked visits and existing completed snapshots. Refresh and place replacement synchronize estimated costs so budget and unknown-price warnings use the saved snapshot price. Cost uses VND; unknown price and unavailable place are explicit warnings. Routing HTTP provider results are cached; failure returns STRAIGHT_LINE with `fallback=true` and null duration rather than claiming an estimated driving time. Fixture routes are not production measurements. Existing saved snapshots remain readable with Catalog down; adding unavailable/malformed places fails closed.

Outbox+audit are committed with mutations; the dispatcher holds its row lock until persistent mandatory publish is confirmed. Crash after publish before commit may redeliver the same event ID; transactional inbox dedup makes this safe, not exactly-once delivery. Eight failed attempts retain the unpublished row for operator inspection; no row is discarded. Resolve broker routing/configuration first, then use `python backend/services/trip-service/trip-ops.py replay-outbox --event-id <uuid>`. The operator mode disables listeners/fixtures, binds a random loopback port, disables Flyway and records REPLAY_REQUESTED atomically. DLQ replay uses `replay-dlq` with separate BROKER_OPERATOR_USERNAME/BROKER_OPERATOR_PASSWORD; it validates supported original x-death routing, confirms mandatory publish before ack, and requeues malformed metadata. Do not manually recreate event IDs, reset schemas or purge private trips to recover.

Identity deletion requests purge owner trips/snapshots/transfers/audit/idempotency data, retain a minimal tombstone, and publish domain.user-data-deleted.v1. Visibility/status consumers ignore stale versions and do not replace itinerary content. Recommendation attribution is accepted as fixture input without invoking an optimizer. P02 connects real services/tokens/events; deep routing optimization belongs to later phases. Reviewer confirmation is external evidence, not a generated signature.

Packaged provider smoke: `python backend/services/trip-service/check-local.py --image smarttravel-trip:p01-finish-local` creates owned database/network/public-only JWKS containers, verifies real signed JWT CRUD, opt-in seeds, health and frozen response schemas, and cleans every owned container.

Local evidence11/10/2026: `test-local.py --transport` **39/39 PASS**, zero failure/error/skip (18 PostgreSQL/provider tests +12 real RabbitMQ/database fault tests +9 unit/security/HTTP bound tests), disposable V1-V7 databases and restricted runtime/operator accounts. Full operation providers validate all 29 frozen Trip operations. Additional regressions verify provider cache reuse, cross-trip transfer rejection without mutation, recommendation attribution emitted once, foreign currency rollback and real routing timeout fallback. Independent review and remote CI are recorded separately in progress.

Latest non-root image `smarttravel-trip:p01-finish-local` and `check-local.py` **PASS** on the same V1-V7 jar: isolated migrated PostgreSQL, actual opt-in fixtures, aggregate/readiness/liveness health, real RS256/public-only JWKS authentication, authorization rejection, persisted create/read/delete and frozen schemas. Probes cleaned owned containers/networks and did not modify shared volumes.

Deletion concurrency: all human mutations acquire a per-user PostgreSQL transaction advisory lock before checking status/tombstone and locking domain rows. Identity deletion uses the same user lock, so it waits for an in-flight create/job to commit and purges or anonymizes it before publishing the acknowledgment. A latch-based real database regression verifies the uncommitted-insert case and blocks subsequent mutations by a deleted user.

V6 persists versioned destination availability. Destination changes invalidate affected parent versions and expose DESTINATION_UNAVAILABLE without rewriting saved itinerary content; new segments reject a known inactive destination. Registered Catalog place-upsert events update availability only, preserve locked/completed snapshot content and ignore stale versions. Both inputs have frozen-schema validation, inbox bindings and original-routing DLQ replay support; database and real broker regressions cover them.

Audit runtime UPDATE/DELETE/TRUNCATE revoked by additive migration V7. Deletion uses a restricted SECURITY DEFINER function with fixed search_path and no PUBLIC EXECUTE. Disposable test fixture cleanup uses migrator credentials; normal domain operations retain runtime credentials.
