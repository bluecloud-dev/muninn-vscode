# Release guide

The current development package is **2.1.0 pre-release**. Marketplace versions must be numeric; pre-release channel metadata is separate from the `preview` badge. The older 1.99.x proposal and already-recorded 2.0.0 changelog are historical. Future stable promotion needs a deliberate version/channel change.

## Build and review

Use Node 24 and `npm ci`. Run the type, lint, format, coverage, round-trip, telemetry and dependency gates documented in [TESTING.md](TESTING.md). Run extension-host tests against minimum/current VS Code.

```bash
npm run package
npm run test:e2e
```

Packaging runs the production build, removes only owned generated output directories, generates `THIRD_PARTY_NOTICES.md` from the actual bundled packages and inspects the resulting VSIX. Budgets: initial editor JavaScript <=600 KiB, total generated bundle outputs <=8 MiB, compressed VSIX <=3 MiB. Lazy Mermaid chunks account for the many JavaScript files; do not collapse them simply to silence vsce's file-count warning.

Inspect `artifacts/build/package-report.json` for the SHA-256 and bytes. The archive must contain its host/webview entrypoints, local chunks, LICENSE.txt and notices, and exclude source maps, tests, source trees, agent metadata and stale media. Keep source available under the repository's existing AGPL policy and preserve SPDX headers.

## Publish an authorized release

A matching `vX.Y.Z` tag triggers the release workflow. It verifies tag/version, performs checks, packages, tests that exact archive in real VS Code, then publishes with `--packagePath` and `--pre-release`. It must never rebuild between the packaged UI gate and publication. GitHub Release receives the same VSIX and is marked pre-release.

Maintainers own release credentials, accounts and approval of public release notes. Creating a PR does not authorize a Marketplace upload or tag. Keep `VSCE_PAT` in the configured secret, never repository files.

Before tagging, complete the manual accessibility/platform/performance checks in [TESTING.md](TESTING.md), review the versioned changelog section and verify CI for the commit to be released.
