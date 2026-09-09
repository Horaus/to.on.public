# Publishing checklist

1. Verify the source commit recorded by `release-manifest.json`.
2. Build from a clean checkout of that exact commit.
3. Run typecheck, build, unit, packaging, persistence, and live provider gates.
4. Verify every file listed by `SHA256SUMS`.
5. Create an annotated Git tag for the release.
6. Create a GitHub Release from that tag.
7. Upload files from `release-assets/<version>/uploads/`; do not commit them.
8. Mark an incomplete candidate as a pre-release.
9. Promote it to stable only after the authoritative live gate passes.

GitHub Desktop can publish this repository, but GitHub Releases and annotated
tags may still be created through GitHub's release page or the GitHub CLI.
