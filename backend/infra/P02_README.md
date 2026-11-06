# P02: six real services and Gateway

P01 accepted by the user on 11 October 2026. P02 uses real service implementations,
the persistent Identity issuer, separate databases and actual RabbitMQ transport.
It never reads another service's database to implement a feature.

## Run

The stack uses the standard Compose layout at the repository root:

| File | Contents |
|---|---|
| [`docker-compose.yml`](../../docker-compose.yml) | Application only: Gateway, six services, RabbitMQ, init jobs `key-init`, `rabbit-init`, `community-migrate`. Databases come from `.env`; only the Gateway publishes a port. |
| [`docker-compose.local.yml`](../../docker-compose.local.yml) | Explicit CI/test dependencies: five PostgreSQL, MongoDB replica set (`community-keygen`, `mongo-init`), Mailpit, source sandbox (`sandbox-init`) and loopback debug ports for services/RabbitMQ. Never loaded automatically. |
| [`docker-compose.db-ports.yml`](../../docker-compose.db-ports.yml) | Opt-in database host ports (Windows excluded port ranges, F-37). |
| `.env.example` / `.env.local.example` | Cloud-default template (Neon + Atlas) and explicit local CI/test template ([cloud README](../platform/cloud/README.md)). |

```text
python backend/platform/init_env.py         # .env from .env.example: random internal secrets; fill cloud DB credentials
python backend/platform/cloud/manage.py check
docker compose up -d --build --wait         # images compile from source inside Docker
```

`init_env.py` only fills missing values and never rotates an existing one (volumes keep the
password they were created with). Services start only after their init jobs exit 0
(`depends_on: service_completed_successfully`); `--wait` returns when every service is
healthy. Gateway AI routes stay off unless `AI_ENABLED=true` in `.env`; the backend smoke
needs `true`. Stop with `docker compose down` (volumes kept); never add `-v`.

`p02.py` is only the **test and operations harness** for the running stack: `smoke`,
`monitor`, `manifest`, `renew`, `replay-catalog-dlq`. It reads `.env` by default (`P02_ENV_FILE` selects another file), never builds or
starts containers, and its helpers (`compose`, `request`, `workload`) are shared by the
`p02_*`/`p03_*` suites. `P02_DB_PORTS=1` makes its `compose` helper include the db-ports file.

The default project is `smarttravel-cloud`; its shared databases are Neon and Atlas.
Share the ignored root `.env` privately with authorized teammates and allow each backend
machine's IP in Atlas Network Access. Media files remain in local Docker volumes;
shared database access does not copy them. Current verification status belongs in
[`progress_be.md`](../../progress_be.md) and [`progress_fe.md`](../../progress_fe.md).

Run fault, transport, load, deletion and restore exercises only against isolated test
data, using the explicit local stack below. Requirements: Java 21, Docker, Python with `requirements-validation.txt` and
PyYAML, Node dependencies via `npm --prefix frontend ci`:

```text
python backend/platform/validate_contracts.py
backend/mvnw.cmd -B -f backend/services/pom.xml verify
backend/mvnw.cmd -B -f backend/platform/api-gateway/pom.xml verify
python backend/platform/init_env.py --mode local
docker compose --env-file .env.local -f docker-compose.yml -f docker-compose.local.yml up -d --build --wait
# PowerShell; Unix COMPOSE_FILE uses : instead of ;
$env:P02_ENV_FILE = '.env.local'
$env:COMPOSE_FILE = 'docker-compose.yml;docker-compose.local.yml'
python backend/infra/p02.py smoke
npm --prefix frontend run test:gateway
npm --prefix frontend run dev
npm --prefix frontend run test:browser
python backend/infra/p02_faults.py
python backend/infra/p02_privacy_test.py
python backend/infra/p02_transport_test.py
python backend/infra/p02_import_ack_test.py
python backend/infra/p02.py manifest
python backend/infra/p02.py monitor
```

Open `http://127.0.0.1:5173/app`. Gateway is `http://127.0.0.1:58080`;
service ports are 58101–58106 (explicit local configuration only). The frontend dev proxy targets this
Gateway; `P02_GATEWAY_TARGET` overrides it. Mailpit is on port 59025. RabbitMQ management
is on port 56673. All host bindings are loopback. This environment is local
integration, not production.

Local test credentials are in the ignored root `.env.local`; reports in ignored `backend/infra/.local/p02/`.
The generated `.local/p03/.../compose.yaml` is only used by P03 isolated environments;
`test_p02_compose.py` keeps it equivalent to the local stack. The four opt-in synthetic
accounts are `fixture-u1@example.invalid`, `fixture-u2@example.invalid`,
`fixture-admin@example.invalid`, `fixture-business@example.invalid`;
their random password is `IDENTITY_FIXTURE_PASSWORD` in `.env.local`.
Only this isolated synthetic environment enables account seed; it never resets
an existing account or re-enables a deleted account at startup.

The explicit local template selects `smarttravel-p02`; the cloud template selects
`smarttravel-cloud`. Each project owns its volumes, networks and containers;
P00/P01 are retained. Running `up` again retains migration history and checkpoints.
Stop local with the same `--env-file .env.local` and both `-f` arguments followed by
`down`, without `-v`. Remove `P02_ENV_FILE` and `COMPOSE_FILE`
from the shell before returning to cloud commands.

## Credentials and routes

Gateway public prefixes are `/api/{identity,catalog,community,trip,ingestion,intelligence}`.
It strips the service prefix and forwards the frozen `/api/v1/...` path.
Internal APIs and upstream actuator are denied at Gateway. Each authenticated
request exchanges the original Identity token for a short token scoped to the
destination. Identity checks current session/account/roles; a revoked session
cannot obtain a new downstream token. Downstream validators also check live
session status when called directly, fail closed on Identity outage, and retain
the subject/session. Gateway exchange requires a separate shared secret.

Internal additions are intentionally private to P02: Identity
`/internal/v1/security/exchange`, `/internal/v1/security/session` and paginated
preferences snapshot; Catalog `/internal/v1/places/features-snapshot`; Intelligence
`/internal/v1/features/rebuild`; Trip historical interactions snapshot. Public
candidate schemas and checksums stay frozen. Workload tokens carry `client_id`,
`SERVICE` role, no user `sid`, one destination audience and the required scopes.

Services obtain workload tokens from Identity `POST /internal/v1/security/workload-token`
(client credentials, `<SERVICE>_WORKLOAD_SECRET`), cache them and renew them before the
10-minute expiry; nothing needs restarting. Only test harnesses (smoke, faults, restore)
sign their own tokens with the Identity key read from the `key-init` volume (in memory only),
because they call internal scopes no runtime client is granted; `p02.py renew` resets that cache and
`monitor` alerts within an hour of its expiry. Production must use its own HTTPS issuer
URI (`WORKLOAD_TOKEN_URI`) and secrets.

## Event connections and recovery

`backend/contracts/registry.json` is the topic/subscription matrix. P02 creates
durable producer `.events` -> consumer `.inbound` exchange bindings for every
registered producer/consumer pair, including every deletion ack producer.
Each runtime can configure/read only its own resources, publish only its own
outbound exchange and allowed producer topics, and cannot publish partner inbound
events. No `p01_fixture` publisher or `p01.capture` queue is installed in P02.

Consumers use persistent inboxes and producer outboxes with bounded retry/DLQ.
The platform audit sink holds at most 10,000 events for at most 30 days. It is an
operator audit queue; `monitor` separately alerts on missing inbox consumers,
inbox backlogs and any dead letters. Dashboard is the actual timestamped HTML
snapshot in ignored `dashboard.html`; regenerate with `monitor`.

Subscribers are durable before source writes. Intelligence rebuild merges
Catalog lineage, Community ratings, Identity preferences and historical Trip
events, then reads source policies through Ingestion HTTP. Aggregate version
guards preserve deltas newer than snapshots; inbox event IDs deduplicate historical
and live Trip events. Changed pagination fingerprints trigger rollback/retry
rather than skipping rows. Catalog and rating versions remain separate.

For rejected transport, inspect the service DLQ and logs using the correlation ID,
correct the contract/configuration on the owning service, then use that service's
`*-ops.py` replay tool with a separately scoped operator credential. Replay confirms
publish before acknowledging the dead-letter; never delete the queue, checkpoint,
audit or volumes to clear an error. For connection rollback, restore the recorded
image/configuration, restart only that service, and resume its durable inbox/outbox.

For the P02 Catalog operator, run:

```text
python backend/infra/p02.py replay-catalog-dlq
```

P02 provisions `catalog_operator` separately with a random password held only in
the selected ignored env file (`CATALOG_BROKER_OPERATOR_PASSWORD`). Its broker ACL permits reading `catalog.dlq`, writing
`catalog.inbound` on registered Catalog-consumer topics, and no resource
configuration. The command launches the implemented Catalog replay operator in
a temporary container with normal workers/transport disabled. Replay preserves
the original event ID, confirms publishing before acknowledging the dead letter,
and records `DLQ_REPLAY_REQUESTED` in Catalog audit logs. Correct the owning
service/configuration first; replay does not bypass validation or version guards.

`python backend/infra/p02_transport_test.py` exercises the actual connected path:
an Ingestion policy event reaches Catalog, a temporary outage of the P02-owned
Catalog database exhausts bounded retries into the durable DLQ, then scoped
operator replay commits the original revoked policy/version and drains the DLQ.
The test checks an increase in audit entries and restores the database in a `finally` block.
It requires an empty Catalog DLQ at entry and writes ignored
`transport-report.json` only after every assertion passes. The latest final-image
test returned PASS with exit0, preserving the original source policy/version,
recording the replay audit and leaving the DLQ empty.

## Provider coverage and evidence

Email is a real SMTP delivery to **Mailpit sandbox**. Imported data is fetched over
HTTP from the separate **synthetic licensed source sandbox**, then processed by
real Ingestion/Catalog services. Routing uses the implemented application fallback
until a permitted external routing endpoint is configured.
The synthetic source uses point (longitude 108.20623, latitude 16.047079).
The `sandbox-init` job fills the DNG boundary only when absent with the synthetic EPSG:4326
box (107.8, 15.7)-(108.5, 16.4), allowing the real Catalog spatial matcher
to validate this test point. This box is local fixture geometry, not the real
Da Nang administrative boundary; it must never be used as production geography. Media scanner/provider
credentials are not provisioned here; scan failure keeps media unapproved. Local
filesystem Docker volumes hold media/model artifacts; production object storage,
licensed data quality, provider reliability and load/restore gates belong to P03.

`smoke-report.json` records HTTP assertions and correlation ID, `manifest.json`
records source checksums plus exact image and JAR hashes and Git dirty state,
`monitor.json` records runtime queues/readiness/alerts. Reports contain no passwords,
tokens or private keys. The P02 CI workflow archives only these selected files.
Successful startup alone never qualifies the phase as CONNECTED.

## Verification checkpoint - 11 October 2026

Core `p02.py smoke`, real frontend Gateway-client smoke and actual browser smoke
have passed, including SMTP verification/notification and all six deletion acks.
Latest connected `p02_faults.py`, `p02_privacy_test.py`, Gateway client and browser
smoke have passed. Core smoke includes persisted Catalog rating; fault coverage
includes concurrent snapshot/delta and deletion remaining pending while the Trip
acknowledgement is absent. Final Catalog27 full transport regression/rebuilt
image, connected retry/DLQ replay, manifest and monitoring have passed. Manifest
verifies all seven running image IDs against verified tags and records exact
source/image/JAR hashes and dirty Git state. Monitor reports seven ready apps,
one consumer on each of six inboxes, zero pending/unacknowledged service-inbox messages and zero DLQ messages; `alarms=[]`.
`python backend/infra/p02_import_ack_test.py` also returned PASS with exit0:
Catalog commits with outbound ack publishing denied and the Ingestion job pending;
redelivering the original command preserves inbox count1 and place count/version.
The test restores ACL in `finally`; durable ack retry then reaches job SUCCEEDED.
This is recorded in `import-ack-report.json`. All P02 tasks and the final gate are
COMPLETE, with six business services CONNECTED. P03/P04 have not started; P00
candidate freeze and remote CI for the latest source remain pending.
This paragraph is the historical 11 October 2026 local claim on the original
checkout. The 20 October 2026 source scan reclassified the P02 gate as PARTIAL
(P02-01, P02-08 and P02-14 remain open); the authoritative status is in
[progress](../../progress_be.md#6-p02--kết-nối-các-service).
Fault tests temporarily stop only P02-owned apps and restore them
in `finally` blocks. Run them after core smoke has created the connected fixtures.

`smoke-report.json`, `fault-report.json`, `privacy-report.json`,
`transport-report.json`, `import-ack-report.json`, `manifest.json` and `monitor.json` are
ignored local evidence. No separate phase report is needed;
[progress checklist](../../progress_be.md) records commands,
results, journal and remaining gates. Browser smoke additionally needs a running
Vite dev server and Playwright Chromium (`npm --prefix frontend exec playwright
install chromium` when not already installed).

The CI source runs core/fault/privacy/transport/import-ack and frontend checks,
and archives only the selected credential-free evidence files above. It has not
run remotely for this final source. No new commit/push or N1/N2 signatures are
claimed. Operator lifecycle closes its application context and exits explicitly
after replay, so successful audit/publish completion returns exit0.

Monitor scope note: zero backlog applies to the six service inboxes and their DLQs. The bounded `platform.audit` sink intentionally retains 288 audit messages without a consumer; it is not claimed empty. Actual monitor status field is `alarms=[]`.

Identity keeps its signing keys in a persistent read-only application volume. The
`key-init` job creates mode 0600 files owned by UID 10001 on first start and never
replaces or rotates an existing key set; no copy of the private key lives on the host.
