# Browser-Native AI Video Studio

Public source and release workspace for Browser-Native AI Video Studio.

This repository is intentionally separate from the private development
repository. Only reviewed source snapshots, user documentation, reproducible
release metadata, and unpacked extension runtimes belong here. Debug profiles,
provider sessions, private evidence, local project data, and development logs do
not.

## Current release status

| Version | Channel | Status |
| --- | --- | --- |
| v0.1.1 | recovery/stable candidate | Awaiting authoritative live Flow verification |
| v0.2.1 | public preview | Preview applet import passed; production acceptance is still in progress |

Neither build should be described as a final stable release until its release
manifest reports a passed live gate.

## Install the public preview

See [docs/INSTALL.md](docs/INSTALL.md). Release installers and ZIP files are
published through GitHub Releases. Their expected names and SHA-256 hashes are
recorded under `release-assets/<version>/`.

The unpacked v0.2.1 browser extension is also available at:

```text
runtime/v0.2.1/extension/
```

This path is persistent and may be selected with Chrome's **Load unpacked**
button during preview testing.

## Development

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm test
```

Provider accounts, Chrome profiles, Electron data directories, and generated
media are local user state and must not be committed.

## License status

No open-source license has been selected yet. Public visibility alone does not
grant permission to redistribute or modify the source. Choose and add a license
before announcing the project as open source.
