# Flow Bridge (standalone)

This is an isolated bridge service for testing a one-to-one desktop ↔ extension session. It is intentionally separate from the Electron bridge on port `3767` and listens on `3777` by default.

The bridge provides:

- `GET /healthz` for a bounded readiness check;
- explicit `HELLO`/`HELLO_ACK` sessions;
- provider-capability routing to exactly one extension;
- a lease per job so status/result messages from another extension are rejected;
- bounded in-flight accounting and heartbeat pings.

It is not wired into the production extension yet. Run its tests first, then migrate the extension behind a feature flag after the protocol has been reviewed.

```sh
pnpm --dir apps/flow-bridge test
pnpm --dir apps/flow-bridge start
```
