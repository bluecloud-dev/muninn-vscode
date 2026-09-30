# Muninn security posture

Current implementation record: September 2026. This is code evidence, not a certification.

| Boundary | Implemented control | Evidence |
| --- | --- | --- |
| Host/webview messages | Runtime guards, safe integer revisions and operation IDs; flush completion tied to its originating session | `protocol.ts`, `muninn-custom-editor-provider.ts`, provider/protocol tests |
| Document writes | TextDocument-backed minimal edits; sequential acknowledgments; overlapping edits retained in unsaved recovery copies | `document-sync.ts`, `sync.ts`, host sync/editor tests |
| Markdown HTML | Disabled markdown-it HTML, standard Markdown links only | `markdown-codec.ts`, `document-navigation.ts` |
| Webview resources | Nonced module script, strict CSP, local generated assets, narrowly derived local roots | Provider `getHtml` / resource methods; installed-VSIX CSP test |
| External links/images | HTTP(S)/mailto only for external open; remote image fetches disabled; imported images capped at 10 MiB before read/decode | Provider and `image-assets.ts` |
| Mermaid | Effective trust + enabled setting, application-scoped explicit override, checks before import/render and after asynchronous render; strict security level; sanitized SVG preserves accessible descriptions | Mermaid adapter/renderer, `preview.ts`, restricted-mode and SVG tests |
| Dependencies | Production bundles and third-party notices derive from locked dependencies; archive inspection and npm audit gate | Build/notices/archive scripts and CI |
| Distribution | Explicit numeric pre-release metadata; publish the archive exercised by the UI gate | `release.yml` |
| Privacy | No telemetry code; repository scanner blocks known telemetry patterns | `scripts/check-no-telemetry.js` |

The telemetry scanner is not a complete network proof. Dependency audits are point-in-time advisory checks. URI tests cover mocked remote providers; live SSH/Codespaces testing remains part of platform acceptance. Browser/vscode.dev support is not claimed.

The host intentionally permits editing ordinary Markdown in Restricted Mode while restricting diagram execution. Workspace settings cannot grant the application-level Mermaid permission. A renderer result that finishes after permission is revoked is discarded.

Use [SECURITY.md](../SECURITY.md) to report vulnerabilities privately. See [the implementation record](AUDIT_IMPLEMENTATION_2026-09.md) for exact validation results and remaining manual checks.
