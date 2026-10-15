# P02 principal and workload credentials

Identity persists its RSA signing keys outside source control. User access tokens
retain the frozen 1024-character bound and Identity scopes. Gateway exchanges them
per request for a 60-second destination token containing only that service's
read/write scopes and, when currently assigned, admin scope. Subject and session
remain unchanged. No workload scope is granted to a user token.

Set `GATEWAY_IDENTITY_EXCHANGE_URI` on Gateway to
`http://identity:8101/internal/v1/security/exchange` in the local integration
network. Set the same generated `GATEWAY_EXCHANGE_SECRET` (at least 32 characters)
on Gateway and Identity. All five consumers set `IDENTITY_SESSION_URI` to
`http://identity:8101/internal/v1/security/session`. Production endpoints use HTTPS.

Both exchange and live-session checks lock the Identity user and session, reject
disabled/deleted users and revoked/expired sessions, and never cache results.
Exchange uses current roles; live checks reject roles no longer assigned. A failed
Identity check prevents downstream execution. Gateway blocks all public access to
`/api/*/internal/**` and removes the exchange credential before forwarding.

`provision_workload_token.py` signs workload tokens with the same issuer and key,
one audience and an explicit destination scope list. Workloads carry `client_id`
and `SERVICE`, without `sid`; they cannot become human principals. Import its
`issue(...)` function from the integration runner or invoke the CLI with
`--key-file`, `--kid`, `--issuer`, `--client`, `--audience`, repeated `--scope`, and
`--output`. Credentials are written to ignored local files and never printed.
Reissue before expiry (default one hour, maximum one day), then reload/recreate the
consumer. Managed workload identity and automated deployment rotation remain
deployment responsibilities; these local credentials are not production secrets.

The scoped preferences snapshot requires `identity:preferences:read` and a
workload principal. Its opaque cursor includes a fingerprint over Identity-owned
user/preference versions. Concurrent changes return `409 SNAPSHOT_CHANGED`;
bootstrap must restart and continue merging versioned events. Snapshot responses
contain `items`, `next_cursor`, `watermark`, and `as_of`; inactive users are excluded.
