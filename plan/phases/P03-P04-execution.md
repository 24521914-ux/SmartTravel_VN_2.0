# P03/P04 execution — 11 October 2026

Scope: execute the existing P03 gate before P04, preserving the dirty P01/P02
working tree and the existing unfinished merge. Local main and origin/main both
point to a466c6d after fetch. Branch switching is blocked by MERGE_HEAD; do not
abort, quit or commit that merge as part of verification.

## Reviewed implementation sequence

1. Measure contracts, safe authorization probes and bounded load against the
   real Gateway. Report actual dataset size, traffic mix, latency, errors and
   throughput; a smaller smoke dataset does not satisfy the P00 load gate.
2. Verify browser keyboard, responsive, loading, error and role coverage. Record
   absent map/business/admin functionality as findings rather than PASS.
3. Freeze only currently running P02 writers for a consistent six-database and
   object checkpoint. Restart the captured containers in finally. Restore into
   isolated resources, compare content and migration metadata, retain backups.
4. Evaluate real licensed holdout data against Basic, rejecting synthetic data,
   consent gaps, leakage and insufficient samples. Keep QUALITY_PENDING and
   production model deployment disabled until evidence exists.
5. Aggregate fresh evidence into a fail-closed P03 go/no-go decision. Only after
   P03 passes, execute P04 new-deployment rehearsal, immutable version pinning,
   rollback preserving new writes and stability sampling.
6. Sync phase/checklist status from measured results, with pending gates explicit.

Acceptance: original volumes/data survive all exercises; no secret/dump enters
Git; all reports identify local versus production scope. P00 targets remain
50 clients/20 requests per second, 83,000 domain records, read p95 <=500ms,
write p95 <=800ms, Basic p95 <=1s, RPO <=24h and RTO <=4h.

External prerequisites: permitted real data with >=100 consenting users and
>=1,000 interactions; deployment target/domain/provider configuration and
operational recipient. No purchase or external messaging is authorized.

Review: ClaudeKit delegated gate review found the plan consistent with P00/P03/
P04. P04-02 monolith migration is N/A because P00 selects a new deployment;
backup, restore and rollback remain mandatory. No production approval or human
owner signature is inferred.
