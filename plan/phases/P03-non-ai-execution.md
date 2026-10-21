# P03 non-AI acceptance scope — 20 October 2026

User instruction: finish P03 except AI, which the user will finish later.
This supersedes AI prerequisites for this scoped acceptance only. It does not
grant production deployment, merge, push, or P04 authorization.

## Deferred

F05 Basic/recommendations, F08 Intelligence interaction history, ML datasets,
training, model validation/deployment, offline quality and F11 model/data admin.
The Intelligence container/database can remain for deletion acknowledgements and
safe preservation of existing storage; no AI functional acceptance is claimed.
Gateway AI routes and frontend AI controls are disabled by default and require
explicit opt-in later. Existing implementation is retained.

## Required acceptance

1. Non-AI API producer/consumer/frontend contracts; old clients and additive
   Offering status PATCH compatibility; schema/error/enum stability.
2. Live F01/02/03/04/06/07/09/10/11, business and storage-only import/replay.
3. Broker/downstream/crash/retry/dedup/stale delivery, DLQ replay, rating
   reconciliation and readable persisted Trip snapshots.
4. Non-AI endpoint role boundaries, BOLA/IDOR, refresh reuse, session/user/claim
   revocation, media quarantine/MIME/authorization, rate limit and PII redaction.
5. Synthetic isolated dataset minima: places 10,000; users 2,000; reviews 20,000;
   trips 1,000. Fifty distinct authenticated principals at aggregate 20 rps.
   Remove AI's 20% traffic and normalize remaining traffic: Catalog 62.5%, Trip
   reads 18.75%, authenticated writes 18.75%. Read p95 <=500ms; write <=800ms;
   no HTTP errors/dropped scheduling slots. Record EXPLAIN and pool/backpressure.
6. Authenticated six-database/schema/index recovery plus nonempty object byte
   checks, restored application login/readiness/read APIs, preserved non-AI
   projection watermark, deletion/retention and storage-license revocation.
   Local checkpoint RPO <=24h, RTO <=4h; original P02 storage survives unchanged.
7. Browser user/business/admin, 320/390/768/1280 widths, keyboard, loading/error/
   empty states, opt-in map and pending asynchronous acknowledgements; no AI calls.
8. Current-source/JAR/image binding, findings review, trace/dashboard, reviewed
   replay/rollback/restore/deletion runbook and measured local alert delivery.
9. Explicit provider inventory: local SMTP Mailpit, local synthetic source
   sandbox, OSM opt-in external map and explicit straight-line routing fallback.
   Sandbox success is recorded as sandbox; real production provider/data rights
   and offsite production recovery are not asserted by local development tests.

## Output semantics

`p03_gate.py --scope non-ai` requires same-release, current-candidate evidence
for every remaining gate. AI quality is DEFERRED, never PASS. Successful output
is P03_NON_AI_VERIFIED; SYSTEM_VERIFIED and P04/production authorization remain
false. Missing or contradictory non-AI evidence still produces NO_GO.

Reports and backups stay under ignored backend/infra/.local/p03. Status and
measured outcomes are recorded separately in progress and runbooks; this file
defines acceptance, not evidence of passing it.
