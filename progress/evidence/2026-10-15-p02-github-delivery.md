# Phase 02 GitHub delivery

Delivery branch: `feature/backend-phase02-delivery`, based on main `42eac23`.

## Included

- Isolated six-service P02 environment, per-service databases and RabbitMQ credentials.
- Gateway principal exchange and live session authorization; empty exchange responses fail closed.
- Catalog, Community, Identity, Trip and Intelligence snapshot/rebuild connections.
- Frontend application screens and real Gateway/browser smoke runners.
- Integration, fault, privacy, transport and import-acknowledgment CI gates.

Phase 01 service implementations are already present on main. P03/P04 tooling and
ongoing local verification documents are deliberately retained in the original
workspace and are outside this delivery. Generated credentials, private keys,
reports, build output and `.local` directories are excluded.

## Validation

- Frozen contracts: 183 HTTP operations/examples/errors and 23 event/command examples PASS.
- Frontend: npm ci (zero reported vulnerabilities), seven contract tests and production build PASS.
- Java services and Gateway: Maven verification PASS for six services and Gateway (14 Gateway tests).
- Connected runtime checks: required P02 GitHub Actions job before merge. The local Docker
  daemon was unavailable during delivery; historical P02 checklist evidence is not
  represented as a fresh connected run.

## Operational notes

P02 is a local integration environment, with Mailpit and a licensed source sandbox.
Production deployment and ML quality acceptance are outside this phase. Existing
Phase 01 migration files remain frozen except for byte-identical line endings.
Follow `backend/infra/P02_README.md` for migrations, credentials and startup.

The initial remote run exposed a controller-to-repository layout violation, now
fixed by delegating through TripService. GitHub dependency review was unsupported
for this private repository; the unsupported new job is removed, frontend npm
audit remains enforced, and no claim of backend dependency scanning is made.
