# Flow Bridge v2

Diagnostics-first bridge for one desktop, one extension, and one Flow workspace.
It is intentionally a separate process/port (`3778`) so the existing bridge can
remain available for rollback. The bridge only routes messages; it never claims
that a job succeeded until the extension sends a result containing provider and
media identifiers.

Canonical Flow tool names and the published-runtime registry are documented in
[`docs/wiki/google-flow/naming-and-versioning.md`](../../docs/wiki/google-flow/naming-and-versioning.md).

```sh
pnpm --dir apps/flow-bridge-v2 test
pnpm --dir apps/flow-bridge-v2 start
```

The repository-level `pnpm verify:flow-serial` command is a read-only gate for
serial evidence. Set `FLOW_SERIAL_JOB_IDS` (comma-separated) and optionally
`FLOW_SERIAL_SHOT_IDS`; it never dispatches or retries jobs.

The Relay test suite also includes a three-shot serial routing test. It proves
lease delivery and terminal-result return stay one-to-one across a batch,
independent of Google Flow provider availability.

`GET /healthz` is a safe readiness probe. `GET /status` exposes connection
roles, Flow tab counts, and active leases without exposing payload contents.
`GET /capabilities` exposes the v2 schema, supported source modes, audio
policies, quality and output resolutions without exposing job payloads.

Schema v2 also binds terminal output to the leased request:

- `voiceLock` requires character/voice identity and a signature; terminal
  results must report `voiceLockVerified=true` and echo the exact character,
  voice ID (when supplied), and signature when a lock was requested.
- `aspectRatio`, `durationSeconds`, `sourceMode`, `quality`, and `audioPolicy`
  are required in a v2 terminal result whenever the manifest requested them,
  and must match exactly. `outputLanguage` and `outputResolution` are also
  bound when supplied. A video blob without these fields is not a completed
  handoff.
- `frames` requires a `fe_id_*` `imageMediaId`; component mode may carry
  validated `componentIds`.

The published Flow runtime remains v1 until a separate publish and smoke test
proves this contract in the actual Flow tool. Do not route production jobs to
the v2 port solely because local validation passes.
