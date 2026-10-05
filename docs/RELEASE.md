# Release guide

The current release candidate is **1.0.1 Preview**, with both `preview: true` in the manifest and explicit pre-release channel metadata in the VSIX. The version sequence was reset before Marketplace publication; earlier version plans are preserved in [the historical changelog](CHANGELOG-legacy.md).

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

A matching `vX.Y.Z` tag triggers publication to both registries. The workflow can also run manually from `main` with a selected destination: `marketplace`, `openvsx`, or `both`. Manual runs rehearse by default; `publish=true` explicitly uploads the candidate and creates the GitHub release.

The read-only build job checks the numeric version and Preview badge, performs the quality gates, packages, and tests that exact archive in real VS Code. Registry jobs download that candidate and compare its SHA-256 with the build report before publication. They must never rebuild the VSIX. Runs for the same version are serialized.

The Marketplace job uses the protected `marketplace` environment and Microsoft Entra workload identity federation. Only that job receives `id-token: write`. Open VSX uses its own token and job. Each selected registry verifies its own publishing access before uploading with `--pre-release`. The GitHub release is created after all selected registry jobs succeed; only that final job receives `contents: write`. A manual publication creates its tag at the tested workflow commit.

Run a complete rehearsal without uploading an extension or creating a GitHub release:

```bash
gh workflow run release.yml --ref main -f tag=v1.0.1 -f registry=both -f publish=false -f verify_credentials=true
```

The `verify_credentials` input defaults to true. Set it to false only for a build rehearsal that does not establish credential readiness; publishing always verifies access. The two registry checks run independently, so an Open VSX setup failure does not hide the Marketplace result. The tested VSIX, hash report and release notes are retained as a workflow artifact for 14 days even if a registry check fails.

For an authorized Marketplace-only release:

```bash
gh workflow run release.yml --ref main -f tag=v1.0.1 -f registry=marketplace -f publish=true
```

The unselected registry is skipped. The GitHub release is a pre-release and includes the tested VSIX. A tag created by the workflow's `GITHUB_TOKEN` does not trigger another publishing run.

Registry publishes cannot be rolled back together. If one registry publishes and another fails, complete the missing upload using the retained, tested VSIX before announcing the release; do not blindly rerun successful uploads. Credential checks do not establish that the registries will accept the package itself.

## Marketplace: Microsoft Entra federation

The publisher is `bluecloud-dev` and the extension name is `muninn-vscode`. Marketplace publishing uses an Entra application with a federated credential, without a client secret or `VSCE_PAT`. The installed vsce supports both `verify-pat --azure-credential` and `publish --azure-credential`. Despite its command name, `verify-pat` supports Entra identities.

### One-time configuration

1. Register an application in an Entra directory you control. Configure its GitHub federated credential with the exact settings below.
2. Enable immutable OIDC subjects for this repository. Check the current value with `gh api repos/bluecloud-dev/muninn-vscode/actions/oidc/customization/sub`; `use_immutable_subject` must be true. Names and numeric IDs must match the subject GitHub actually emits.
3. Create a GitHub environment named `marketplace`. Restrict deployment branches/tags to the `main` branch (manual identity checks and rehearsals) and `v*.*.*` tags (releases). Restrict who can modify release workflows and create release tags using repository rules. An environment credential trusts jobs in that environment, not one workflow filename.
4. Set environment variables `AZURE_CLIENT_ID` and `AZURE_TENANT_ID` from the application's Overview page. These identify the application and directory; they are not passwords.
5. Resolve the Marketplace identity with the workflow below. Add that returned identity ID to the [bluecloud-dev publisher](https://marketplace.visualstudio.com/manage/publishers/bluecloud-dev) as a direct **Contributor**. It is not the application's client ID or Entra object ID.
6. Run the access check, then the complete release rehearsal. Delete the retired `VSCE_PAT` secret after successful Entra validation.

| Federation field | Value                                                                           |
| ---------------- | ------------------------------------------------------------------------------- |
| Issuer           | `https://token.actions.githubusercontent.com`                                   |
| Audience         | `api://AzureADTokenExchange`                                                    |
| GitHub owner     | `bluecloud-dev`                                                                 |
| Owner ID         | `251727681`                                                                     |
| Repository       | `muninn-vscode`                                                                 |
| Repository ID    | `1121773683`                                                                    |
| Entity           | Environment: `marketplace`                                                      |
| Subject          | `repo:bluecloud-dev@251727681/muninn-vscode@1121773683:environment:marketplace` |

The login uses `allow-no-subscriptions: true`; this application-based approach needs an Entra directory, but does not require the publishing identity to have Azure subscription roles. Marketplace access is granted separately.

### Verify without publishing

Resolve the Marketplace identity for first-time membership setup:

```bash
gh workflow run marketplace-identity.yml --ref main -f verify_publisher_access=false
```

The run summary reports only the identity ID and publisher, never an access token. After granting Contributor membership:

```bash
gh workflow run marketplace-identity.yml --ref main -f verify_publisher_access=true
```

The shared authentication action checks direct Contributor/Owner membership for the authenticated identity, then verifies vsce's own Azure credential path. This explicit role check is necessary because vsce's built-in membership check also accepts Reader access. Both identity workflow modes are read-only with respect to registry publication.

If Entra reports no matching federated credential, compare issuer, audience and the full immutable subject, including environment spelling and case. If authentication succeeds but role verification fails, confirm that the identity ID from the run summary is a direct Contributor of the correct publisher. Do not substitute the client ID.

Reference: [Azure Login OIDC](https://github.com/Azure/login#login-with-openid-connect-oidc-recommended), [immutable subjects](https://learn.microsoft.com/en-us/entra/workload-id/workload-identities-github-immutable-subjects), [Marketplace Entra publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#secure-automated-publishing-to-visual-studio-marketplace).

## Open VSX credentials

Open VSX remains an independent registry. Its `OVSX_PAT` repository secret must contain an unexpired token for an account authorized to publish in the `bluecloud-dev` namespace, with the required publisher agreement completed. Entra federation does not replace this credential.

Update it through GitHub settings or the interactive prompt:

```bash
gh secret set OVSX_PAT --repo bluecloud-dev/muninn-vscode
```

A configured secret name does not establish validity. Run the complete release rehearsal to verify Open VSX access; missing namespace or agreement errors require setup in Open VSX. Never print credentials or copy them into issues, logs, artifacts or repository files.

Maintainers own publisher membership, identity configuration and approval of public release notes. Creating a PR does not authorize a registry upload or release tag.

Before tagging, complete the manual accessibility/platform/performance checks in [TESTING.md](TESTING.md), review the versioned changelog section and verify CI for the commit to be released.
