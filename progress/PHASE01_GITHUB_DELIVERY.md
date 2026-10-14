# Phase01 GitHub delivery — 14 October 2026

The remaining Phase01 groups are pushed sequentially to independent feature
branches based on `main` at `cb44518`. Each branch is self-contained and targets
`main`; no automatic merge is performed. Auth/preferences/admin and notification
inbox were already merged before this delivery.

The original working checkout contains later Phase02/03 changes and is preserved.
The delivery branches exclude live session exchange, connected orchestration,
business frontend screens and Phase03 tooling. Shared fixtures appear in each
service branch so every proposed change can be built independently.

| Group | Branch | Pull request | Local verification | Remote CI |
|---|---|---|---|---|
| Identity lifecycle | `feature/identity-phase01-lifecycle` | [#9](https://github.com/24521914-ux/SmartTravel_VN/pull/9) | 60 tests; PostgreSQL/RabbitMQ; zero failures/errors/skips | 9/9 PASS |
| Catalog | `feature/catalog-phase01-business` | [#10](https://github.com/24521914-ux/SmartTravel_VN/pull/10) | 26 tests; PostGIS/RabbitMQ; zero failures/errors/skips | 9/9 PASS after smoke/readiness fixes |
| Community | `feature/community-phase01-business` | [#11](https://github.com/24521914-ux/SmartTravel_VN/pull/11) | 30 tests; MongoDB/RabbitMQ; zero failures/errors/skips | 9/9 PASS |
| Trip | `feature/trip-phase01-planning` | [#12](https://github.com/24521914-ux/SmartTravel_VN/pull/12) | 40 tests; PostgreSQL/RabbitMQ; zero failures/errors/skips | 9/9 PASS after retrying baseline Mongo startup |
| Ingestion | `feature/ingestion-phase01-pipeline` | [#13](https://github.com/24521914-ux/SmartTravel_VN/pull/13) | 38 tests; PostgreSQL/RabbitMQ; zero failures/errors/skips | 9/9 PASS |
| Intelligence | `feature/intelligence-phase01-recommendations` | [#14](https://github.com/24521914-ux/SmartTravel_VN/pull/14) | 35 tests; PostgreSQL/RabbitMQ; zero failures/errors/skips | See PR checks |
| Gateway and API/auth client | `feature/platform-phase01-gateway-client` | [Delivery branch](https://github.com/24521914-ux/SmartTravel_VN/tree/feature/platform-phase01-gateway-client) | Gateway 12 tests, client 7 tests, frontend build and Gateway image build PASS; npm audit zero vulnerabilities | See the draft PR attached to this branch |

Identity validation uses `test-local.py --transport --isolated-source` to avoid
the Windows Maven launcher issue with an absolute Unicode project path. The
remaining service suites use disposable owned databases and brokers. Private
credentials, generated keys, local evidence and build artifacts are excluded
from commits.

Service function clusters share transactional services, event listeners and
provider suites. They are delivered as independently buildable business groups
with their required dependencies.

These pushes publish source and enable review. They do not establish that every
group has merged into `main`, change the historical Phase01 user acceptance, or
certify Phase02/03 system acceptance.

Local service total: **229 tests** across the six scoped business branches, with
zero failures/errors/skips in the full disposable dependency suites. The Gateway
and frontend client add **19 tests**. These counts apply to the delivery sources;
they do not replace historical acceptance counts for the original dirty checkout.

Follow-up fixes preserve the configuration guards: local storage smoke selects
explicit fixture profiles, Catalog runners wait for the final PostgreSQL TCP
listener, and Community's synthetic Catalog validate fixture supplies the
required `public` flag. Shared CI selects each available service runner and
requires transport mode whenever that runner supports it.

Merge the reviewed service PRs individually and the platform PR afterward. Their
shared source changes are identical where they overlap; the platform PR adds its
own independent Gateway/frontend CI job. CI snapshots above were observed during
delivery; use each PR's current checks before merging.
