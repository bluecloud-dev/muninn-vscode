# September 2026 audit implementation

This implements the concrete fixes requested after the [full audit](MUNINN_AUDIT_2026-09.md). The audit remains a dated baseline. Its section 9 describes the earlier audit-only edits; this file describes the implementation branch.

This record captures the validation performed for that branch. The current contributor guidance is in [Architecture](ARCHITECTURE.md), [Development](DEVELOPMENT.md), [Source fidelity](ROUNDTRIP_CONTRACT.md), and [Testing](TESTING.md).

The existing ProseMirror custom text editor, ordinary Markdown files, AGPL license, native surrounding UI and no-telemetry policy remain. This is a substantial coupled correction to the editor's source/sync boundary, with regression coverage rather than a rewrite.

## Completed fixes

| Audit item | Result | Main evidence |
| --- | --- | --- |
| P0.1 — Sync/save/undo/close | Explicit operation IDs and acknowledgments, one apply in flight, minimal host edits, independent-change merge, recovery on overlap, save/Source flush, retained document and raw table drafts. Undo/Redo use one native command path. | `document-sync.ts`, `sync.ts`, provider, `remote-document.ts`, delayed-host/unit/native tests |
| P0.2 — Source fidelity | All 58 untouched fixtures byte-identical; real edits preserve markers, spacing, numbering, references, entities, CRLF, EOF and table alignment/escapes. Real code fences remain code. Standard GFM tasks/strike supported. Narrow provisional whitespace handling permits normal typing. | Codec, table utilities, source-fidelity/editor tests, generated round-trip reports |
| P0.3 — Trust/resources | Mermaid gated before import/render and after asynchronous work; explicit permission read only from user settings; local assets and narrowed roots; remote image loads blocked; 10 MiB checks before read/decode; stat permission failures cannot cause image overwrite. | Config service, Mermaid adapter/renderer, provider/image tests, native Restricted Mode test |
| P0.4 — Preferences | Removed startup/editor-association rewriting and redundant explicit activation list. Native editor picker controls defaults; old setting is deprecated and inert. | Manifest, extension, association regression test |
| P0.5 — Behavioral gates | Provider included in unit coverage, real bundled DOM tests, installed-VSIX Electron journeys, minimum/current host gates and blocking cross-platform UI matrix. Removed the quarantined WebDriver stack. | Tests, package scripts and CI |
| P1.1 — Reading navigation | Unicode/duplicate heading anchors, local/cross-file links, native heading picker and built-in webview Find. | Navigation module, provider, native task/link tests |
| P1.2 — Focus and chrome | Compact toolbar/More, Source as the single primary editor-title action, native heading action in secondary menu, insertion below selected block, cancellation completion, correct toggle state, preserved table caret and accessible diagram descriptions. Duplicate preview removed. | Bootstrap/index/styles/node views and native UI tests |
| P1.3 — Production build | Node 24 tooling; Node 18/Chrome 114 runtime targets; minified host/ESM webview, genuinely lazy diagram chunks, cleaned owned outputs, size budgets and archive assertions. | esbuild and package checker |
| P1.4 — Note/spec utility | Native New Markdown Note and relative-file-link picker; ordinary Spec Kit/OpenSpec-shaped fixtures and exact-edit assertions. | Note commands, fixtures, source-fidelity tests |
| P1.5 — Distribution | Numeric 2.1.0 pre-release, packaged pre-release metadata, third-party notices from actual bundles, SPDX source headers, version/tag validation, test/publish the same archive. | Manifest, notices/check scripts, release workflow |
| P1.6 — Guidance | Current architecture, onboarding, testing, release/security and agent instructions reconciled. Historical strategy/v1 documents clearly labeled. | README, AGENTS, docs and historical-spec index |
| P2.1/P2.2 — Justified cleanup | Source/image/diagram caching, local lazy chunks, extracted code-block node view, navigation/sync/text-edit modules; removed obsolete transforms and Mermaid helper. | Runtime modules and build metafile |

## Verification performed locally

Windows, Node **24.20.0**, VS Code **1.85.2** and current stable **1.139.1**:

- **200 unit/bundled-DOM tests passed.** Coverage: **85.33% lines**, **72.26% branches**, **84.19% statements**, **81.87% functions**; configured thresholds retained. DOM adapters are covered behaviorally outside the unit coverage denominator.
- **58/58 golden fixtures byte-identical**, with zero known deviations. Actual edit tests also cover source preservation and plain Spec Kit/OpenSpec document shapes.
- **7/7 extension-host integration tests passed** on both VS Code versions.
- **8/8 installed-VSIX native UI tests passed** on both versions: read/type/save/undo, keyboard toolbar and insertion, focused table save/source/delete/undo, code languages, lazy Mermaid/CSP/accessibility markup, tasks/headings/file links, Source/note capture and Restricted Mode/remote-image blocking.
- Typecheck, lint, format check, no-telemetry guard and package checks passed.
- `npm audit`: **zero vulnerabilities**, including development dependencies. The removed WebDriver stack accounted for most of the prior advisory surface. Narrow Mocha transitive overrides use patched jsdiff/serialize-javascript while preserving the minimum-host-compatible integration runner.

The production VSIX has **127 files**, **1,823,226 bytes** (about 1.74 MiB), with **439,268 bytes** (about 429 KiB) in the initial editor JavaScript. This is a byte measurement, not a startup-latency claim. The baseline's 8.36 MiB webview included Mermaid eagerly; the current package loads local diagram chunks when permitted and needed.

The tested archive SHA-256 was `45327fff5fef706bb99c4c95ed80639be8ce56e583af57d4d3a13f087526ac69`. Future packaging updates `artifacts/build/package-report.json`; only the workflow-produced, UI-tested archive may be published.

The native harness required separate shared-application state directories on recent VS Code builds. User-data isolation alone was insufficient for trust/extension state. It also waits for contribution registration and explicit native activation before opening fixtures. The minimum version uses its older supported isolation flags. No test failure is silently quarantined.

Review regressions additionally cover a local edit after non-canonical remote Markdown arrives, heading indices with front matter, task creation followed by immediate typing, blockquote/list/nested tables, and a protected fallback for malformed table source. Table content is captured before the Markdown parser restores container offsets; serialization restores those prefixes. Package validation and hashing use one in-memory archive snapshot. macOS launch reads the bundle executable from its property list, and command registration waits refresh the native palette.

## Preserved boundaries and remaining validation

- No Marketplace upload, release tag, merge, publisher-account change or license-policy change is part of this PR.
- Optional web/browser support, note databases, wikilinks, backlinks, daily-note automation, math/export features and repository MCP/skill collections were not added. These were opportunities requiring evidence, not confirmed defects.
- ProseMirror and the one sanctioned custom editor remain. `retainContextWhenHidden` remains until large-document/multiple-tab memory is measured; it is not removed on intuition.
- Actual screen-reader usability, high-contrast/narrow/zoom visual acceptance, cold-open/typing latency, multi-tab memory and real remote-provider sessions still require the release acceptance checks in [TESTING.md](TESTING.md).
- Recovery covers normal delayed-host, save/Source, panel-close and webview-state paths. Abrupt process termination and full VS Code restore/backup behavior are not comprehensively proven by these tests.
- Some rich edits cannot preserve non-canonical source safely. Those edits remain guarded with a Source fallback; corpus conformance is not universal Markdown-dialect compatibility.
- The Linux/macOS/Windows CI matrix is configured as blocking. Local execution here establishes Windows results; hosted results must be checked on the PR.
- The unrelated pre-existing `graphify-out/` directory was preserved and excluded from commits and the VSIX.

## Current sources behind the implementation

The full audit contains the external comparison and benchmark ranking. These primary references support the key implementation choices:

- [VS Code custom text editors](https://code.visualstudio.com/api/extension-guides/custom-editors): TextDocument ownership and native editor integration.
- [VS Code webviews](https://code.visualstudio.com/api/extension-guides/webview): resource/CSP boundaries, state, Find and accessibility.
- [Workspace Trust](https://code.visualstudio.com/api/extension-guides/workspace-trust): limited support, effective trust and restricted settings.
- [Bundling extensions](https://code.visualstudio.com/api/working-with-extensions/bundling-extension): production bundling and debugging separation.
- [Publishing extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension): numeric versions and explicit pre-release distribution.
- [Playwright Electron](https://playwright.dev/docs/api/class-electron): real Electron application automation; this API is experimental.
- [ProseMirror guide](https://prosemirror.net/docs/guide/): transactions, node views and history.
- [Spec Kit](https://github.com/github/spec-kit) and [OpenSpec](https://github.com/Fission-AI/OpenSpec): plain-document compatibility patterns, without runtime integrations.

## Later validation: Ponytail cleanup on 2026-09-26

This section is a separate macOS validation snapshot for the later cleanup branch, not an update to the Windows results above. The cleanup branch passed 198 unit/bundled-DOM tests (85.08% lines, 72.68% branches), 7/7 extension-host integration tests on both VS Code 1.85.2 and 1.139.1, the 58/58 no-edit round-trip corpus, typecheck, lint, formatting, no-telemetry, and package/archive checks. Its tested VSIX SHA-256 was `6b35e55e1fe4f9b6afc68dfd7ed5b7975be4edbb2ef1042a47a0acc2b0a3b2e4`.

The installed-VSIX suite did not pass initially: 4/9 cases passed on the cleanup branch. A packaged comparison of the original `c17b4e9` source in the same macOS/VS Code environment passed 5/9. Both runs failed the same four cases: undo after typing (the test reads a closed webview frame), deleted-table undo, image insertion, and New Markdown Note. Restricted Mode timed out on the cleanup branch while waiting for a hidden workbench panel. After removing that panel-visibility assumption from the test harness, a second cleanup run passed Restricted Mode and 5/9 total; the four shared failures remained. These comparisons establish that the four shared failures predate the cleanup; they do not establish that those product journeys work.

The cleanup removed retired v1 specifications, generated issue-source files, one-shot scripts, obsolete root reports, the custom logger, an inert setting's runtime reads, unused configuration caching, and direct unused development dependencies. Current contributor rules and retained manual checks are in [Architecture](ARCHITECTURE.md), [Development](DEVELOPMENT.md), [Source fidelity](ROUNDTRIP_CONTRACT.md), and [Testing](TESTING.md). The primary checkout's unrelated local changes were preserved.
