# Historical PR CI failures: diagnosis and prevention

## Evidence

- PR #10, run 38766417925: Identity
  `malformedDlqMetadataIsRetainedAndOperatorCredentialIsRestricted` expected a ready
  DLQ count of 1 but observed 0 immediately after requeue.
- PR #12, run 38766514050: Catalog `p01.py up` could not bind
  `127.0.0.1:56432` because that host port was already in use. The competing
  historical process/container is not known from the retained failure log.
- PR #12 also exposed the Trip asynchronous authorization assertion race;
  PR #16 already fixed it by awaiting the broker channel-close refusal (403).

## Corrective changes

Identity now confirms publication, waits for the message to arrive before replay,
asserts the exact malformed-metadata root cause, waits for the asynchronous nack
requeue to become ready, and checks that the restricted operator receives the
original payload. Production replay semantics are unchanged.

Catalog CI now asks Docker for an ephemeral loopback published port instead of
assuming 56432 is free. P01 smoke discovers that port and passes it to the Java
probe. Developer and P02 defaults remain unchanged. No unrelated listener is
stopped and no persistent data is removed.

## Verification

- Three Python port-discovery/default/invalid-binding regressions pass.
- Seven service-layout checks pass.
- Identity Maven verification and fresh full GitHub CI are required before merge.
- Local Docker is unavailable; real broker/database/image/integration verification
  runs in GitHub Actions, including the exact affected Identity test.

Historical failed runs and old merge-commit badges remain historical evidence;
new fixes and checks do not rewrite those commits or conceal their failures.
