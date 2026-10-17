# Code block presentation and highlighting

Research for [#376](https://github.com/bluecloud-dev/muninn-vscode/issues/376), 2026-10-17. Base: `4d54564`. Status: implemented and locally verified; the user confirmed the bundled editor, host commands/messages and installed-VSIX test seams on 2026-10-17.

## Existing design

The code block node view already owns the language selector, editable `contentDOM`, and Mermaid preview. The editor registers it once and already uses a ProseMirror decoration plugin for document navigation. Reuse these interfaces. The source fidelity contract requires exact preservation outside intentional edits; decoration changes must never generate Markdown changes. Sources: [node view](../../src/webview/editor/nodes/code-block-node-view.ts), [editor](../../src/webview/editor/index.ts), [navigation](../../src/webview/editor/document-navigation.ts), [contract](../ROUNDTRIP_CONTRACT.md).

The current language list includes TypeScript/TSX, JavaScript/JSX, Python, Go, Rust, Java, C#, C++, Bash, JSON, YAML, SQL, Markdown, Mermaid and plain/unsupported options. No syntax highlighting dependency is present in the current manifest or lockfile. Sources: [language options](../../src/shared/code-languages.ts), [manifest](../../package.json), [lockfile](../../package-lock.json).

## Primary-source findings

- ProseMirror draws inline decorations inside a node view's `contentDOM`. A plugin can maintain a `DecorationSet` and supply it through `props.decorations`; formatting therefore need not change document nodes or marks. Sources: [node views](https://prosemirror.net/docs/ref/#view.EditorProps.nodeViews), [decorations](https://github.com/ProseMirror/prosemirror-view/blob/master/src/decoration.ts).
- highlight.js supports a core-only import, individual grammar registration, explicit language selection, and public HTML output from `highlight`. `getLanguage` recognizes registered names/aliases and returns undefined for unknown ones. Sources: [imports](https://github.com/highlightjs/highlight.js#custom-usage), [public interface](https://highlightjs.readthedocs.io/en/latest/api.html).
- highlight.js escapes source text in its HTML renderer. The integration can parse that output in an inert template and extract text offsets/classes, without inserting the generated markup into the live editor. Sources: [renderer](https://github.com/highlightjs/highlight.js/blob/main/src/lib/html_renderer.js), [escaping](https://github.com/highlightjs/highlight.js/blob/main/src/lib/utils.js). The inert-template integration is a proposed design, not an upstream guarantee; verify text equality before accepting offsets.
- Lowlight offers an alternative public syntax-tree output built on highlight.js. It would avoid the template traversal, but adds another runtime dependency. Source: [Lowlight documentation](https://github.com/wooorm/lowlight#what-is-this).
- VS Code supplies theme classes, workbench color variables and editor font variables to webviews. These support adaptive code surfaces and token palettes; the webview guide does not promise direct access to the native editor's full TextMate token theme. Source: [webview theming](https://code.visualstudio.com/api/extension-guides/webview#theming-webview-content).
- The current build targets Chrome 114 and limits the initial webview bundle to 600 KiB. Production bundling generates third-party notices. Validate the selected grammars against those existing checks. Sources: [build](../../esbuild.mjs), [notices generator](../../scripts/third-party-notices.mjs).

Registry check on 2026-10-17: `npm view highlight.js version license dependencies dist.unpackedSize --json` returned version `11.12.0`, BSD-3-Clause, no dependencies, and 5,503,982 unpacked bytes. Unpacked package size is not the shipped bundle size. Registry metadata is time-specific; the lockfile and production bundle will identify the implemented candidate.

## Proposed implementation

Use one decoration plugin, with highlight.js core and explicitly selected grammars matching the existing language options. Keep grammar handling and offset conversion private to that module. Read only public highlighter output; retain the existing node view as the editing and Mermaid adapter. Cache token ranges by immutable code node so unrelated edits do not repeatedly tokenize unchanged blocks.

Unknown/omitted languages and Mermaid remain readable plain text. On tokenization failure or a text mismatch, omit highlighting without affecting editing. A documented per-block size limit may be needed to bound synchronous work; choose it from representative measurements and keep the complete text editable.

Adjust the existing code header/body styles for narrow panes, editor font tokens and contained long lines. Use theme variables with explicit high-contrast behavior. Do not promise exact replication of every third-party TextMate theme. The native test must measure actual token readability.

## Scope and verification

Expected changes: new decoration module; plugin registration in `index.ts`; existing code styles; manifest/lockfile/notices; bundled editor and installed-VSIX tests; user-facing code-block documentation. The parser, serializer, host protocol, source fixtures, public commands and Mermaid trust policy need no new behavior.

Confirmed test seams for this issue:

1. Bundled editor DOM/input and emitted host messages: visible highlighting, literal code preservation, real edits, language changes, fallback, selection and undo. This does not prove native layout.
2. Installed VSIX: typing/paste/save/undo/redo, narrow panes, light/dark/high-contrast themes, language selection and Mermaid. This does not establish screen-reader or all-platform acceptance.

Implement one failing behavior test and its smallest passing implementation at a time. After implementation, audit the changed modules and their callers using the codebase-design principles, record candidates in a temporary HTML report, and perform justified in-scope refactors before moving to #377. Existing architecture and source fidelity decisions remain the acceptance contract. Sources: [architecture](../ARCHITECTURE.md), [testing](../TESTING.md).

## Baseline evidence

Clean `npm ci` under Node 24.21.0 completed. `npm run coverage` passed all 301 existing tests and the configured coverage thresholds (82.59% statements, 72.19% branches, 82.05% functions, 83.26% lines). Local output: `artifacts/baseline-coverage.log`.

`npm audit --json` reports seven existing affected packages: five moderate entries in the NYC/sprintf-js dependency chain and two low entries in the Mermaid/KaTeX chain, with no high or critical entries. These are baseline findings, not introduced by this proposal. Local output: `artifacts/baseline-audit.json`. Packaged/native tests have not run at this research stage.

## Implementation, audit and evidence

The decoration plugin owns grammar registration, text verification, the 20,000 UTF-16-unit cutoff and token caching. The architecture review traced its node-view, transaction, serializer and host-sync boundaries; the justified refactor was caching offsets by immutable code node so unrelated edits avoid retokenization. A broader command-session extraction was deferred because this issue does not change command ownership. The temporary visual review is recorded by `artifacts/376-architecture-report-path.txt`.

Five behavior tests were added at the confirmed bundled-editor seam; native coverage extends the existing geometry/theme journeys and adds code editing. Red/green cycles demonstrated missing highlighting, unsupported selected grammars, unbounded large-block decoration and insufficient native contrast before their fixes. The native high-contrast-light check exposed inherited inline-code backgrounds, corrected locally in the existing code styles. A transient Playwright version-query startup failure also exposed missing cleanup when no window was assigned; the harness now waits for workbench readiness and closes the test app in `finally`.

Node 24.21.0 on macOS arm64: 306 unit tests, all configured coverage thresholds, typecheck, lint, formatting, 58 byte-identical round trips, 7 real extension-host tests, all 20 installed-VSIX tests and the no-telemetry audit passed. Native VS Code: 1.142.0, with browser networking offline; light, dark and both high-contrast themes passed measured token contrast. The candidate VSIX is 1,367,046 bytes, SHA-256 `c4c7de160108183299fac2fffaf7f5c17d95e207ee8758b8f74b9e63537cad89`; initial editor JavaScript is 525,565 bytes, below the 600 KiB budget. Logs use `artifacts/376-*`; native evidence is in `artifacts/e2e/stable/`. Bundle behavior is tested separately from the host coverage metric.

Limits: this local run does not establish Windows/Linux, minimum-version, OS clipboard, IME or screen-reader acceptance. Third-party themes can override the color variables; the plugin does not reproduce native TextMate token colors. No release, merge or deployment was performed.
