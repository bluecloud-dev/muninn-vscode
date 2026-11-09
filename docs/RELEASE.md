# Release guide

The prepared version is **1.5.0**, with `preview: false` in the manifest and regular release-channel metadata in the VSIX. Its versioned [changelog section](../CHANGELOG.md) records the release date and changes. Preparation does not publish the extension: merge the reviewed PR, complete the acceptance checks below, then authorize Marketplace publication. The version sequence was reset before Marketplace publication; earlier version plans are preserved in [the historical changelog](CHANGELOG-legacy.md).

Marketplace versions must be numeric. Version 1.5.0 is a regular stable release; the [even/odd minor convention](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#prerelease-extensions) is an optional recommendation for parallel stable and pre-release streams. The [Preview badge](https://code.visualstudio.com/api/references/extension-manifest) and pre-release channel are separate settings. A later regular release must use a new version; a version published as a pre-release cannot be reused on the regular channel.

## Build and review

Use Node 24 and `npm ci`. Run the type, lint, format, coverage, round-trip, telemetry and dependency gates documented in [TESTING.md](TESTING.md). Run extension-host tests against minimum/current VS Code.

```bash
npm run package
npm run test:e2e
```

Packaging runs the production build, removes only owned generated output directories, generates `THIRD_PARTY_NOTICES.md` from the actual bundled packages and inspects the resulting VSIX. Budgets: initial editor JavaScript <=600 KiB, total generated bundle outputs <=8 MiB, compressed VSIX <=3 MiB. Lazy Mermaid chunks account for the many JavaScript files; do not collapse them simply to silence vsce's file-count warning.

Inspect `artifacts/build/package-report.json` for the SHA-256 and bytes. The archive must contain its host/webview entrypoints, local chunks, LICENSE.txt and notices, and exclude source maps, tests, source trees, agent metadata and stale media. Keep source available under the repository's existing AGPL policy and preserve SPDX headers.

## Publish an authorized release

A matching `vX.Y.Z` tag triggers publication to both registries. The workflow can also run manually from `main` with a selected destination: `marketplace`, `openvsx`, or `both`. Manual runs rehearse by default; `publish=true` explicitly uploads the candidate and creates the GitHub release.

The read-only build job checks the numeric version and requires the Preview badge to be disabled, performs the quality gates, packages, and tests that exact archive in real VS Code. Registry jobs download that candidate and compare its SHA-256 with the build report before publication. They must never rebuild the VSIX. Runs for the same version are serialized.

The Marketplace job uses the protected `marketplace` environment and Marketplace trusted publishing with GitHub Actions OIDC. Only that job receives `id-token: write`. Open VSX uses its own token and job. Each selected registry authenticates before uploading on the regular release channel. The GitHub release is created after all selected registry jobs succeed; only that final job receives `contents: write`. A manual publication creates its tag at the tested workflow commit.

Run a complete rehearsal without uploading an extension or creating a GitHub release:

```bash
gh workflow run release.yml --ref main -f tag=v1.5.0 -f registry=marketplace -f publish=false -f verify_credentials=true
```

The `verify_credentials` input defaults to true. Set it to false only for a build rehearsal that does not establish credential readiness; publishing always verifies access. The two registry checks run independently, so an Open VSX setup failure does not hide the Marketplace result. The tested VSIX, hash report and release notes are retained as a workflow artifact for 14 days even if a registry check fails.

Before merge, a build-only rehearsal can run from the PR branch with `publish=false` and `verify_credentials=false`. The protected Marketplace environment accepts `main` and release tags, so verify the trusted publishing policy with a release rehearsal on `main`. After merge, run the complete Marketplace rehearsal above against the reviewed commit before authorizing publication.

For an authorized Marketplace-only release:

```bash
gh workflow run release.yml --ref main -f tag=v1.5.0 -f registry=marketplace -f publish=true
```

The unselected registry is skipped. The GitHub release is a stable release marked Latest and includes the tested VSIX. A tag created by the workflow's `GITHUB_TOKEN` does not trigger another publishing run.

Registry publishes cannot be rolled back together. If one registry publishes and another fails, complete the missing upload using the retained, tested VSIX before announcing the release; do not blindly rerun successful uploads. Credential checks do not establish that the registries will accept the package itself.

## Marketplace: trusted publishing

The publisher is `bluecloud-dev` and the extension name is `muninn-vscode`. Publishing uses
`vsce publish --oidc` with a short-lived Marketplace credential. No PAT, Entra application,
client ID or tenant ID is required by the release workflow.

Create this policy under the publisher's [Trusted Publishing settings](https://marketplace.visualstudio.com/manage/publishers/bluecloud-dev/trustedpublishing):

| Field            | Value                        |
| ---------------- | ---------------------------- |
| Policy name      | `Muninn for VS Code release` |
| Provider         | GitHub Actions               |
| Repository owner | `bluecloud-dev`              |
| Repository       | `muninn-vscode`              |
| Workflow         | `release.yml`                |
| Environment      | `marketplace`                |

Keep the GitHub `marketplace` environment restricted to `main` and `v*.*.*` tags. Only the
Marketplace job receives `id-token: write`. The policy matches the repository, workflow and
environment; their spelling and case must agree.

The release rehearsal exchanges an OIDC token without uploading an extension or printing the
credential. Since `verify-pat` does not support OIDC, it uses the installed vsce OIDC helper.
Publication obtains its own fresh token with `publish --oidc` and does not fall back to a PAT.
The legacy `marketplace-identity.yml` workflow diagnoses the former Entra identity only; use
`release.yml` to verify the trusted publishing policy.

Reference: [Marketplace trusted publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#publish-with-github-actions-and-trusted-publishing).

## Open VSX credentials

Open VSX remains an independent registry. Its `OVSX_PAT` repository secret must contain an unexpired token for an account authorized to publish in the `bluecloud-dev` namespace, with the required publisher agreement completed. Marketplace trusted publishing does not replace this credential.

Update it through GitHub settings or the interactive prompt:

```bash
gh secret set OVSX_PAT --repo bluecloud-dev/muninn-vscode
```

A configured secret name does not establish validity. Run the complete release rehearsal to verify Open VSX access; missing namespace or agreement errors require setup in Open VSX. Never print credentials or copy them into issues, logs, artifacts or repository files.

Maintainers own publisher membership, identity configuration and approval of public release notes. Creating a PR does not authorize a registry upload or release tag.

Before tagging, complete the manual accessibility/platform/performance checks in [TESTING.md](TESTING.md), verify that the versioned changelog heading includes the release version and actual date, keep a separate `## [Unreleased]` heading for future changes, review the release notes and verify CI for the commit to be released.
