# P03 verification runbook

**20/10/2026 — P03 không AI: COMPLETE / P03_NON_AI_VERIFIED.** Đã nghiệm thu toàn bộ phạm vi không AI theo yêu cầu người dùng; F05/F08, quản trị model/dataset, ML và AI quality là **DEFERRED_BY_USER**. Full SYSTEM_VERIFIED chưa được cấp; P04 vẫn NOT_STARTED. Chi tiết và số đo: [bàn giao P03 không AI](../../docs/P03_NON_AI_ACCEPTANCE.md).

- [x] P03-01/02/03/04/05/06/07/08/11: hoàn thành phạm vi không AI, có đủ bằng chứng current-source và gate đạt.
- [ ] P03-09/10 và các phần AI lồng trong task khác: DEFERRED_BY_USER, để thực hiện sau.
- [x] Gate phạm vi người dùng yêu cầu: P03_NON_AI_VERIFIED; full SYSTEM_VERIFIED và P04 không được cấp.

216 service test; 94 tooling test (93 pass, 1 skip Windows); 532 security request; 8 browser nhóm/36 responsive; load 1.200 HTTP 200, 50 tài khoản, p95 tổng 232,16 ms; application restore 183,92 giây.

Các checklist và checkpoint cũ bên dưới lưu lịch sử/phạm vi đầy đủ trước khi người dùng hoãn AI; trạng thái hiện hành nằm ở block 20/10 này.

---

Status on 11 October 2026: **IN_PROGRESS**. Local probes and offline acceptance tooling exist; the full phase acceptance remains **NO_GO**. P04 is **NOT_STARTED**, dependent on SYSTEM_VERIFIED evidence. No production release or model activation is claimed.

Run from repository root using the Python dependencies already required by P02 and the frozen-contract validator:

```powershell
python -m unittest discover -s backend/infra -p "test_p03*.py"
python -m unittest discover -s backend/platform -p test_contract_checksums.py
python backend/infra/p03_verify.py contracts
python backend/infra/p03_verify.py security
python backend/infra/p03_verify.py load --duration 30
python backend/infra/p03_verify.py diagnostics
python backend/infra/p03_verify.py load --duration 30 --full-mix
python backend/infra/p03_quality.py <licensed-holdout.json>
python backend/infra/p03_gate.py
```

The security and load commands require the P02 six-service/Gateway stack. They never stop containers. Security logs in synthetic USER/BUSINESS accounts for protected admin/internal negative cases; no valid-admin mutation is sent. Full mix uses fixture-u2, mutates display_name only with optimistic If-Match, serializes these writes and restores the original display name in finally, including worker failures. Recommendation requests persist. Coordinate all writers before the separate `python backend/infra/p03_restore.py --freeze-writers` rehearsal. Restore artifacts contain private data; keep `.local/p03` ignored. The rehearsal restores into isolated storage, never over source databases. Its storage checkpoint checks do not prove application recovery, live PITR, broker recovery, or production RPO/RTO.

Verification reports are `.local/p03/contracts.json`, `security.json`, and `load.json`. New reports include UTC timestamp and source hashes. `--release-id <identity>` records an explicit release identity on probes; omission intentionally prevents release acceptance. The gate reads the fixed evidence filenames listed in `p03_gate.py`, rejects stale/future timestamps, missing or inconsistent release identity, and hashes that differ from current source. Every report requires source hashes matching the operations report's `reviewed_source_hashes`, and operations must explicitly record `release_linkage_reviewed: true`. These reviewed attestations bind evidence to a release; filling booleans without the supporting exercises does not establish acceptance. Run `p03_gate.py --release-id <identity>` only with the corresponding actual evidence. The decision tool deploys nothing.

Contracts use the existing `validate_contracts.py` validator: all 183 HTTP operations/examples/errors, 23 event/command examples and negative cases, and exact frozen manifest membership. Canonical hashes reuse its `artifact_checksum`: Git CRLF/LF conversion is ignored, all other byte changes remain detected. This validates frozen schema/examples; it does not prove live old/new producer/consumer compatibility.

Security probes derive protected operations from OpenAPI. They send anonymous and malformed Bearer requests, with empty mutation bodies and nonexistent UUID parameters, and verify denial at the Gateway. Anonymous operations are skipped to avoid arbitrary public writes. The first measured run passed 334 checks and skipped 22 anonymous operations. Full authenticated role/scopes, BOLA/IDOR, refresh reuse, revocation, upload, rate limits and PII checks require their own evidence; this probe alone cannot close P03-04.

The read-only load probe schedules bounded traffic for 3–120 seconds at the frozen profile's aggregate 20 requests/second. It rotates 50 paced virtual users, reports achieved users separately from actual concurrent inflight requests, includes failed requests in latency, and drops scheduling slots rather than queueing unbounded work. Its initial 30-second run measured 600 requests, zero errors, 19.976 requests/second, p95 141.895 ms and peak four inflight requests. Those figures describe the local synthetic catalog only; use the current report for later runs.

The full P00 profile requires 10,000 places, 2,000 users, 20,000 reviews, 1,000 trips and 50,000 interactions, with catalog reads 50%, Basic recommendations 20%, trip reads 15%, authenticated writes 15%. Targets are read p95 below 500 ms, write below 800 ms and Basic below 1,000 ms. Optional full mix executes these proportions with 50 virtual users sharing ONE authenticated fixture identity; it does not seed the required dataset. `p00_release_gate_pass` stays false until scale and distinct-user contention are verified. Full hot-query/index/pool/backpressure/slow-consumer exercises remain pending; P03-05 remains unchecked.

Earlier measurement snapshot on 11 October: mixed run 600 requests/30.103s, no errors/dropped slots, 19.932rps, peak five inflight. Class counts/p95: catalog300/167.016ms, Basic120/476.551ms, trip90/78.329ms, write90/65.654ms. Local mixed probe passes each class budget; full release load gate is false. Private `mix-load.json` records actual measurements and principal scope. Broader security measured 504 denial checks pass, 22 anonymous operations skipped; full-role matrix remains false.

`diagnostics` is a separate read-only operator probe. Its snapshot counted places20/users13/reviews11/trips12/interactions6, deficits9980/1987/19989/988/49994 against P00. Counts can change after subsequent exercises. It ran EXPLAIN ANALYZE BUFFERS for the actual unfiltered Catalog search page query: execution10.492ms/planning0.873ms on that tiny dataset. This is neither a full dataset benchmark nor proof all application queries are tuned. `diagnostics.json` preserves plan/buffers and counts without application bodies.

The offline quality evaluator requires at least 100 consenting users and 1,000 held-out interactions, strict temporal/item separation, unique rankings and valid input shapes. Precision always divides by ten. Model acceptance requires NDCG@10 improvement of at least 0.02 and precision no worse than Basic. Real dataset provenance/license and frozen ranking lineage require owner-reviewed evidence. Synthetic fixtures test the evaluator and pipeline; they do not establish real model quality. `production_activation_authorized` always remains false.

Remaining full-phase evidence includes authenticated security coverage, F01–F11 and separate business/import/ML E2E, old/new compatibility, complete resilience/reconciliation, application DR/projection-watermark recovery, licensed real data/holdout quality, user/admin/business browser and accessibility coverage, real-provider credentials/licenses/latency, reviewed runbooks, alert recipient and resolved critical/high findings. Mailpit/source sandbox/routing fallback remain explicit local provider scope. External release infrastructure and provider/data rights cannot be fabricated from local fixtures. P04 cutover, rollback/stability exercises and handover depend on those gates.

Source is dirty and shared. Preserve existing P01/P02 edits, credentials, databases and volumes; no commit, push, destructive cleanup or contract checksum refresh is part of these commands.

Local tooling validation currently passes 45 P03 tests, including freshness/source/release identity and fixture restoration on worker failure. `.github/workflows/p03-tooling.yml` adds tooling CI; remote CI has not run. Fresh P02 core/fault reports remain scoped evidence (including contribution/dedup/visibility/crash-after-commit/snapshot-delta/missing-Trip-ack), never generic F01–F11 proof. Monitor confirmed seven ready apps, six service inboxes consumer1/ready0/unacked0/DLQ0 and no alarms; the separate audit sink retained321 messages. Storage/browser outcomes are recorded separately by their exercise owners and require their exact stated limits.

Browser checkpoint: frontend53 checks PASS, zero failures/gaps; 36 responsive cases cover user map, business and admin review at320/390/768/1280. Real OSM response200 and MapLibre zoom; verification/claim pending, moderation, import QUEUED with refresh, labels/keyboard focus/loading/error/empty states observed. P03-07 complete for this measured scope/basic accessibility; no broad WCAG certification claimed. Evidence release_id p03-local-20261011-a466c6d, timestamp2026-10-11T11:19:38.038Z, five current source hashes. Frontend build37 modules and contracts7 checks PASS. Full P03 gate remains NO_GO.

Subsequent concurrent probe checkpoint: mixed load overlapping isolated restore measured600 requests with3 Basic errors (Basic120 requests), 19.8969rps. Class p95 Catalog218.593ms/Basic679.993ms/Trip99.270ms/write92.942ms. Older600/zero-error snapshots above remain historical; they precede this concurrent run; the final sequential candidate snapshot is recorded below. HTTP error codes were not captured in that older report and cause is unresolved. Sequential rerun and final restore evidence are recorded below; do not infer a release pass.

Final isolated storage checkpoint: restore-report.json PASS exit0, release p03-local-20261011-a466c6d, UTC2026-10-11T11:26:51.630878+00:00. Restore125.301558s, checkpoint age678.592985s; source hashes unchanged during run. Six DB row/document counts, Mongo options/indexes and full PostgreSQL schema against same-engine archive-only reference MATCH. Fifteen backup artifacts pass integrity validation;17 restore safety tests PASS. Six object volumes each contain0 files: nonempty object recovery remains unverified. All exercise-owned containers/volumes removed; original seven apps ready. Application DR, Mongo auth roles/topology, PostgreSQL ownership/ACL, encryption/offsite backup and production RPO/RTO remain unverified; P03-06 remains unchecked.

Final sequential candidate checkpoint:45 P03 tooling unit tests PASS and independent review APPROVE for scoped local tooling, no high/critical findings in that review scope. Frozen contracts183 HTTP operations/23 messages PASS; security504 checks PASS (full role matrix still incomplete). Final isolated mixed run600/600 HTTP200 over30.1706s,19.8869rps, zero errors/dropped slots, aggregate p95472.484ms/max591.568ms, peak6 inflight,50 virtual users sharing ONE principal. Class counts/p95: Catalog300/178.435ms, Basic120/554.207ms, Trip90/81.913ms, writes90/62.305ms. Fixture profile recovered. Source hashes match current candidate; previous3-Basic-error report retained in private raw archive with concurrency context, cause unproven. Local mixed latency passes; frozen dataset/distinct-principal load acceptance remains false. P03 remains IN_PROGRESS / NO_GO; P04 NOT_STARTED.
