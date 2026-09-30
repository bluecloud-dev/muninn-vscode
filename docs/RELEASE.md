# Release guide

The first release candidate is **1.0.0 Preview**, with both `preview: true` in the manifest and explicit pre-release channel metadata in the VSIX. The version sequence was reset before Marketplace publication; earlier version plans are preserved in [the historical changelog](CHANGELOG-legacy.md).

Marketplace versions must be numeric. Its [odd-minor pre-release scheme](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#prerelease-extensions) is a recommendation, so this workflow accepts the requested 1.0.0 starting point. The [Preview badge](https://code.visualstudio.com/api/references/extension-manifest) and pre-release channel are separate settings. A later regular release must use a new version; a version published as a pre-release cannot be reused on the regular channel.

## Build and review

Use Node 24 and `npm ci`. Run the type, lint, format, coverage, round-trip, telemetry and dependency gates documented in [TESTING.md](TESTING.md). Run extension-host tests against minimum/current VS Code.

```bash
npm run package
npm run test:e2e
```

Packaging runs the production build, removes only owned generated output directories, generates `THIRD_PARTY_NOTICES.md` from the actual bundled packages and inspects the resulting VSIX. Budgets: initial editor JavaScript <=600 KiB, total generated bundle outputs <=8 MiB, compressed VSIX <=3 MiB. Lazy Mermaid chunks account for the many JavaScript files; do not collapse them simply to silence vsce's file-count warning.

Inspect `artifacts/build/package-report.json` for the SHA-256 and bytes. The archive must contain its host/webview entrypoints, local chunks, LICENSE.txt and notices, and exclude source maps, tests, source trees, agent metadata and stale media. Keep source available under the repository's existing AGPL policy and preserve SPDX headers.

## Publish an authorized release

A matching `vX.Y.Z` tag triggers the release workflow. The workflow verifies the numeric tag against `package.json`, requires the Preview badge, performs checks, packages, and tests that exact archive in real VS Code. It then verifies both registry credentials, publishes the same VSIX to the VS Code Marketplace and Open VSX with `--pre-release`, and attaches it to a pre-release GitHub Release. It must never rebuild between the packaged UI gate and publication.

Run the workflow manually to rehearse the build, tests, package, release notes and publisher access without uploading an extension or creating a GitHub release:

```bash
gh workflow run release.yml --ref main -f tag=v1.0.0 -f verify_credentials=true
```

The `verify_credentials` input defaults to true. Set it to false only for a build rehearsal that does not establish credential readiness. Every tag-triggered run requires successful verification. The workflow checks both registries even when one credential fails and records their outcomes in its summary. The tested VSIX, its hash report and release notes are retained as a workflow artifact for 14 days, including when credential verification fails.

`vsce verify-pat` authenticates the Marketplace credential against the manifest publisher; `ovsx verify-pat` checks the Open VSX namespace. These checks do not upload a package or guarantee the registries' later package validation. Marketplace's publisher-role check also accepts Reader membership, so the token's account must have Contributor or Owner access as described below. Registry publishes cannot be rolled back together; if the second publish fails, publish the already tested VSIX to that registry before announcing the release.

## Publishing credentials

The current publisher/namespace is `blueclouddev` and the extension name is `muninn-vscode`.

- **`VSCE_PAT`**: an unexpired Azure DevOps PAT using **All accessible organizations** and **Marketplace: Manage** scope. Its Microsoft account must be a Contributor or Owner of the [blueclouddev Marketplace publisher](https://marketplace.visualstudio.com/manage/publishers/blueclouddev). A GitHub token cannot replace this credential. See [Microsoft's publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#get-a-personal-access-token).
- **`OVSX_PAT`**: an unexpired Open VSX token whose account can publish in the `blueclouddev` namespace and has completed any required publisher agreement.

Store these in the repository's GitHub Actions secrets. GitHub exposes secret names and update times, but not their values; a configured name does not establish validity. Local shell or vsce credentials are not automatically available to Actions. To update a secret without putting its value in shell history, use the interactive prompts:

```bash
gh secret set VSCE_PAT --repo bluecloud-dev/muninn-vscode
gh secret set OVSX_PAT --repo bluecloud-dev/muninn-vscode
```

After updating a secret, rerun the credential-enabled rehearsal. A 401/403 requires checking expiration, scope, organization selection and publisher membership; Open VSX may report a missing namespace or incomplete publisher agreement. Never print credentials or copy them into issues, logs, artifacts or repository files.

Microsoft's current documentation announces retirement of global PATs on December 1, 2026. Plan a separate move to [Microsoft Entra ID publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#secure-automated-publishing-to-visual-studio-marketplace) before that deadline.

Maintainers own release credentials, accounts and approval of public release notes. Creating a PR does not authorize a registry upload or tag. Keep `VSCE_PAT` and `OVSX_PAT` in configured repository secrets, never repository files.

Before tagging, complete the manual accessibility/platform/performance checks in [TESTING.md](TESTING.md), review the versioned changelog section and verify CI for the commit to be released.
