# Muninn VS Code Extension Audit

> This is the audit baseline before the implementation requested afterward. For the resulting changes and current validation, see [Implementation status](AUDIT_IMPLEMENTATION_2026-09.md). The historical observations below are retained as evidence, not a description of the fixed branch.

## 1. Executive Summary

**Verdict: retain the v2 architecture, but treat the current editor as an alpha with unresolved data-integrity and trust-policy blockers.** The next milestone should establish safe editing and reliable reading, before expanding the feature surface or promoting it as a default editor.

Audit date: **25 September 2026**. Repository baseline: `5ec9490`, package `2.0.0-alpha.1`. Local inspection and baseline execution preceded external research. The assessment covers tracked source, contribution points, configuration, tests, build/package output, documentation, and the existing issue backlog. Existing untracked `graphify-out/` was left untouched.

Top strengths:

- The `CustomTextEditorProvider` / host / ProseMirror split is appropriate for rich editing of ordinary Markdown files. No replacement framework is justified.
- Typed protocol validation, a logger, localization infrastructure, strict TypeScript, a raw-source command, and no-telemetry checks provide a useful foundation.
- Adjustable reading width, toolbar keyboard navigation, table semantics, IME-aware keyboard helpers, and accessibility announcements show meaningful implementation work.
- The fidelity corpus and documented deviations expose problems that many editors leave implicit. Preserve and strengthen this investment.

Top weaknesses:

- **A delayed host acknowledgment can erase a newer local edit.** A separate newline acknowledgment resets the caret and undo history.
- **The byte-identical invariant is not met.** Of 56 evaluated corpus cases, one is byte-identical at the codec boundary, 32 differ only by a final newline, and 23 change other content or formatting. Host newline reconciliation addresses part of the 32, not the 23.
- **Inline Mermaid rendering bypasses the host-derived enable/trust flag.** The untrusted-workspace override also accepts workspace configuration without a restriction declaration.
- **Activation can overwrite existing editor associations and does not restore prior values.** Reading a repository should not silently rewrite its editor preferences.
- The test gates omit the main webview/provider behavior, production packaging uses a development bundle, and the reading surface carries too much persistent editing chrome.

The largest external change is competitive: VS Code introduced an **experimental hybrid Markdown editor in 1.131**, including in-place edits and agent-actionable comments. It can be selected through Reopen Editor With in both Agents and ordinary editor windows. The June market assessment now needs an update; merely offering rich Markdown editing is a weaker differentiator. [Official release notes](https://code.visualstudio.com/updates/v1_131)

**Recommended position:** dependable, quiet reading and precise edits to repository documents, notes, and specifications, with ordinary Markdown as the durable artifact. Safety, navigation, accessibility, and clean Git diffs are stronger priorities than another AI panel, graph, or export framework.

Evidence terminology throughout this report:

- **Verified:** inspected in current source or reproduced in the stated test environment.
- **Inference:** a supported risk or UX judgment that still needs the stated runtime validation.
- **Recommendation:** a proposed change, not an assertion that a benchmark or API guarantees the outcome.

## 2. Local Setup Inventory

| File / mechanism                                                                                                                                                                                                                                                                                                                           | Role and current assessment                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [package.json](../package.json), [package.nls.json](../package.nls.json)                                                                                                                                                                                                                                                                   | Extension identity, engine `^1.85.0`, `main: ./dist/extension.js`, 18 commands, five keybindings, six settings, one default custom editor, eight editor-title quick actions. Clear identity; activation, action density, trust configuration, and pre-release versioning need correction. |
| [src/extension.ts](../src/extension.ts)                                                                                                                                                                                                                                                                                                    | Activation, provider registration, command routing, native pickers, automatic editor associations. Useful central wiring; preference mutation is excessive and raw-source switching lacks a save barrier.                                                                                 |
| [custom-editor/provider](../src/custom-editor/muninn-custom-editor-provider.ts)                                                                                                                                                                                                                                                            | Owns webview sessions, document events, HTML/CSP, configuration injection, input dialogs, image persistence. Appropriate boundary; large module and incomplete synchronization/trust/resource guarantees.                                                                                 |
| [document-sync.ts](../src/custom-editor/document-sync.ts), [protocol.ts](../src/custom-editor/protocol.ts)                                                                                                                                                                                                                                 | Revision checks, snapshots, full-document WorkspaceEdit, message schemas. Valuable scaffolding; no explicit operation acknowledgment, no-op completion contract, or minimal-edit application.                                                                                             |
| [image-assets.ts](../src/custom-editor/image-assets.ts)                                                                                                                                                                                                                                                                                    | File naming, destination normalization, image limits and Markdown paths. Useful utility; file-scheme assumptions and pre-decode size limits need attention.                                                                                                                               |
| [editor/index.ts](../src/webview/editor/index.ts), [sync.ts](../src/webview/editor/sync.ts), [messages.ts](../src/webview/editor/messages.ts)                                                                                                                                                                                              | ProseMirror initialization, transactions, command/toolbar state, host messaging and debounce. Core correctness risk; `index.ts` is about 1,000 lines and mixes multiple responsibilities.                                                                                                 |
| [markdown-codec.ts](../src/webview/editor/markdown-codec.ts), [markdown-transforms.ts](../src/webview/editor/markdown-transforms.ts)                                                                                                                                                                                                       | CommonMark parser/serializer, preserved front matter, table-fence transformation. Semantic conversion does not preserve all original syntax. Regex fence handling is fragile.                                                                                                             |
| [table-node-view.ts](../src/webview/editor/nodes/table-node-view.ts), [table utilities](../src/webview/editor/tables/markdown-table-utilities.ts)                                                                                                                                                                                          | Editable table grids, code block controls, inline Mermaid; almost 1,000 lines in one node-view file. Tables and generic code blocks should have clearer ownership. Alignment and escaped pipes are mishandled during edits.                                                               |
| [front-matter-node-view.ts](../src/webview/editor/nodes/front-matter-node-view.ts), [mermaid-node.ts](../src/webview/editor/nodes/mermaid-node.ts)                                                                                                                                                                                         | Special node presentation/helpers. Front matter preserves its source but rich editing requires the raw-source escape hatch.                                                                                                                                                               |
| [bootstrap.ts](../src/webview/editor/bootstrap.ts), [styles.css](../src/webview/editor/styles.css)                                                                                                                                                                                                                                         | Header, toolbar, preview, editor, status and theme-token styling. Reading width is useful; persistent controls and duplicated preview compete with document content.                                                                                                                      |
| [preview.ts](../src/webview/editor/preview.ts), [mermaid-renderer.ts](../src/webview/editor/renderers/mermaid-renderer.ts), [mermaid-adapter.ts](../src/integrations/mermaid-adapter.ts)                                                                                                                                                   | Global preview controller, SVG rendering/sanitization, host trust decision. Two rendering callers apply different policies; accessibility postprocessing removes authored diagram metadata.                                                                                               |
| [toolbar-roving-focus.ts](../src/webview/editor/toolbar-roving-focus.ts), [editor-accessibility.ts](../src/webview/editor/editor-accessibility.ts), [announcements.ts](../src/webview/editor/announcements.ts), [content-width.ts](../src/webview/editor/content-width.ts), [image-insertion.ts](../src/webview/editor/image-insertion.ts) | Focus, names, announcements, reading measure and image interactions. Small purpose-specific helpers worth preserving. Tests are predominantly helpers, not complete user journeys.                                                                                                        |
| [shared strings](../src/shared/webview-strings.ts), [localization.ts](../src/webview/editor/localization.ts), [l10n bundle](../l10n/bundle.l10n.json), [host l10n](../src/utils/l10n.ts)                                                                                                                                                   | Shared localized defaults and host injection. Good mechanism; a few manifest/HTML strings still bypass it.                                                                                                                                                                                |
| [config-service.ts](../src/services/config-service.ts), [logger.ts](../src/services/logger.ts), [config types](../src/types/config.ts), [code-languages.ts](../src/shared/code-languages.ts)                                                                                                                                               | Configuration caching, logging, typed configuration and language lists. Useful lightweight infrastructure; no service framework needed.                                                                                                                                                   |
| [esbuild.mjs](../esbuild.mjs), [tsconfig.json](../tsconfig.json), [tsconfig.tests.json](../tsconfig.tests.json)                                                                                                                                                                                                                            | Node host and browser bundle, strict compile, separate test compilation. Build output and launch configuration disagreed; production flag is present but unused by packaging.                                                                                                             |
| [.vscode/launch.json](../.vscode/launch.json)                                                                                                                                                                                                                                                                                              | F5 initially compiled `out/` while loading `dist/`. Corrected in this audit with a compound compile/bundle task.                                                                                                                                                                          |
| [.vscodeignore](../.vscodeignore), [scripts/](../scripts/)                                                                                                                                                                                                                                                                                 | Packaging exclusions, test runners, report generation, telemetry check. Existing media contents can leak into VSIX output because bundling does not clean output.                                                                                                                         |
| [tests/unit](../tests/unit), [tests/integration-cli](../tests/integration-cli), [tests/e2e](../tests/e2e), [fixtures](../tests/fixtures)                                                                                                                                                                                                   | Distinct unit, extension-host and UI suites. Useful coverage scaffolding, but delayed acknowledgments, actual edited-table fidelity, and restricted-workspace rendering are inadequately covered.                                                                                         |
| [.vscode-test.mjs](../.vscode-test.mjs), [wdio.conf.cjs](../wdio.conf.cjs)                                                                                                                                                                                                                                                                 | Isolated integration and UI runners. Default integration disables workspace trust; WDIO failed before reliable assertions locally.                                                                                                                                                        |
| [CI](../.github/workflows/ci.yml), [release](../.github/workflows/release.yml), [security](../.github/workflows/security.yml), [Dependabot](../.github/dependabot.yml)                                                                                                                                                                     | Existing quality/security automation. E2E is non-blocking in CI; release gates and artifact provenance need tightening.                                                                                                                                                                   |
| [README](../README.md), [docs](README.md), [AGENTS.md](../AGENTS.md), [specs](../specs), [issue backlog](../.github/issue-backlog)                                                                                                                                                                                                         | Product description, engineering guidance, decisions and planned work. Strong volume of intent; historical v1 contracts, dated claims and overlapping roadmaps create contradictory context.                                                                                              |
| [assets](../assets), [LICENSE](../LICENSE), [SECURITY.md](../SECURITY.md)                                                                                                                                                                                                                                                                  | Product icons/demo and project policies. Preserve branding and AGPL decision; bundled third-party notices are not yet present.                                                                                                                                                            |

Missing at baseline: a tracked debug build task; explicit save/acknowledgment coordination; a tested link/heading/find workflow in the rich editor; task-list rich editing; note capture/link-selection commands; blocking core UI/trust tests; reproducible production packaging. There is no `browser` entry point, contributed tree/view container, shared project skill set, or tracked MCP configuration. These latter absences are scope choices, not automatically defects. No extra sidebar or agent service is needed to repair the editor.

## 3. Local Audit Findings

### 3.1 Extension Architecture

**Keep the custom text editor.** VS Code owns the `TextDocument`, file storage, dirty state and normal lifecycle; the webview supplies the rich surface. This is a reasonable decomposition for the product. `supportsMultipleEditorsPerDocument: false` is an acceptable alpha constraint.

**P0 — newer edits are overwritten by earlier acknowledgments (verified).** In `index.ts`, `host.documentChanged` clears the in-flight state and calls `applyHostMarkdown` before retrying pending edits. The retry serializes the newly replaced document. `HostSyncController` stores booleans, not the pending edit or operation identity.

Reproduction using the **actual bundled webview and a simulated host**:

1. Initialize revision 0 with `Alpha`.
2. Type `X`; let the 80 ms debounce send `view.applyDocument` containing `AlphaX`.
3. Before acknowledging it, type `Y`. The visible editor now contains `AlphaXY`.
4. Send `host.documentChanged` with revision 1 and `AlphaX`, as the host would after the earlier apply.
5. The editor becomes **`AlphaX`**. The newer `Y` is lost.

This is a deterministic protocol/UI reproduction, not an end-to-end certification of VS Code timing. The host's asynchronous edit/event boundary supplies the relevant race in normal operation.

**P0 — acknowledgment resets selection and history (verified).** `applyHostMarkdown` compares the serializer output with host Markdown. The host may preserve a final newline that the serializer omits. The mismatch calls `view.updateState(parseMarkdown(...))`; `parseMarkdown` creates a fresh `EditorState`, including a new history plugin state. With a newline-terminated paragraph, an echoed edit moved the caret to offset zero; local undo then did nothing in the harness.

**Save and no-op completion are fragile (source-verified risks).** `DocumentSync.applyDocument` can succeed without a document change, while the provider has no explicit success acknowledgment. The in-flight webview can consequently await an event that never comes. The webview source button flushes but immediately requests reopening; the host title command bypasses that flush. `beforeunload` only disposes the debounce timer. Table cell drafts wait for `change`/Enter. Immediate Save, source switching and close therefore need a deliberate completion contract and regression tests.

The fix should establish per-document operation identity, explicit completion including no-ops, retained pending local edits, and a defined external-edit conflict policy. Apply source-range changes and mapped ProseMirror transactions where possible. Do not solve this by unconditionally keeping the webview text: that would lose external agent/user edits instead. A CRDT or collaboration platform is not justified by these bugs.

### 3.2 VS Code Contributions and Activation

**P0 — editor preferences can be overwritten (verified source behavior).** `addMarkdownAssociation` replaces matching Markdown associations even when they point to another editor. `syncMarkdownAssociations` reads effective configuration and writes it into workspace settings. Removal remembers added patterns, not their previous values. It can therefore create repository settings churn, promote broader-scope preferences into a workspace, and fail to restore the user's previous editor.

Preserve the declared custom editor and native **Reopen Editor With / Configure Default Editor** flow. Remove automatic settings mutation, with a carefully scoped migration for settings demonstrably owned by Muninn. Do not delete ambiguous user settings.

`onStartupFinished` activates Muninn in unrelated workspaces to run this machinery. Explicit command/custom-editor activation events are redundant for the stated VS Code minimum; they are harmless redundancy, while the startup work and settings writes are material issues. Five keybindings check the active custom editor rather than sufficiently precise input focus; verify that formatting shortcuts do not intercept Quick Input and embedded input fields.

The command surface is broad but missing parity: image insertion is present outside the web toolbar; table actions offer only part of the grid workflow. Prefer one shared command registry/state definition over separately maintained action lists.

### 3.3 UI / Webview / Editor / Toolbar

The toolbar's roving tab stop, visible names, pressed states, status announcements and table header semantics are real strengths. Native pickers for dimensions/actions are appropriate.

**Too much persistent chrome (UX assessment grounded in `bootstrap.ts`, `styles.css` and `package.json`).** Eight editor-title icons coexist with the web toolbar, branding/help header, table/code toolbars and a global Mermaid panel. The first document content sits below product controls. Retain at most one primary title action, put secondary commands in overflow, and make block controls contextual while retaining keyboard access. Keep one inline diagram location.

**The editing affordances are inconsistent.** Link cancellation sends no result, leaving an awaiting-input status. Block insertion uses selection replacement, which can delete selected content when the user's intent is to insert below it. Table action selection can fall back to the first table. These should be explicit context-sensitive actions rather than guessed targets. Existing backlog items already describe several of these issues; update their acceptance evidence rather than duplicating them.

**Accessibility needs integrated validation.** The main ProseMirror root lacks the required base whitespace styling; the browser console reported the ProseMirror `white-space` requirement. Some descendants do use `pre-wrap`, but that does not establish the root behavior. Link colors are not mapped to VS Code theme tokens; the dark-theme harness showed browser-default blue. Root text is fixed at 13 px. High-contrast, zoom, screen reader reading order and narrow split editors need manual checks. HTML hardcodes `lang="en"`; some manifest strings remain unlocalized.

`applyDiagramA11y` removes SVG titles/descriptions and replaces labels with generated text. Preserve safely sanitized author-provided accessible titles/descriptions and use a fallback only when they are missing. This is more useful than generating a label from the first diagram line.

### 3.4 Reading-First Markdown Experience

The adjustable 40–120 ch reading measure, 70 ch default, line height and ordinary headings/lists provide a credible reading foundation. Raw source remains available. The current surface is nevertheless always editable and automatically focused: reading-first is currently a presentation choice, not a protected reading interaction.

**P0 — source fidelity is a documented limitation, not a fulfilled guarantee.** The corpus evaluation yielded:

| Codec result                           | Cases |
| -------------------------------------- | ----: |
| Byte-identical                         |     1 |
| Final-newline difference only          |    32 |
| Other construct/formatting differences |    23 |
| Total                                  |    56 |

The host restores one trailing newline where appropriate; do not misreport all 55 codec differences as identical user-visible corruption. However, full-document serialization after an edit still changes untouched syntax such as wrapping, reference links and list markers. Merely opening a document was not shown to modify it.

The schema does not provide full GFM task-list/strikethrough editing. Task markers are displayed as text and can be escaped on serialization. `markdown-transforms.ts` detects fences with a boolean toggle rather than matching fence character, length and nesting, and uses a special `muninn-table` fence. Real fenced examples using that language need collision protection.

**Edited-table fidelity is worse than no-edit corpus results suggest (verified).** `MarkdownTable` has no alignment field; `serializeMarkdownTable` recreates delimiters as `---`. A left/right-aligned table loses alignment on parse/edit/serialize. Splitting on every pipe treats `a \| b` as two cells; a two-column example became a three-column model. Test cell edits, escaped pipes, code spans, alignment and untouched neighboring text, not only preserved raw table blocks.

**Navigation is underdeveloped.** The rich editor has no explicit host link-opening protocol, generated heading IDs, registered heading navigation or configured find widget. The harness confirmed headings without IDs. Relative files, anchors, external links, Find and returning from source need deliberate behavior and tests. A `DocumentSymbolProvider` alone should not be assumed to populate native Outline for this custom editor; verify platform support before promising it. A native heading Quick Pick is a lean fallback.

### 3.5 Note-Taking Experience

Muninn can edit an existing note, paste/drop an image, and keep content in ordinary files. These are useful primitives. It does not yet offer a coherent capture → link → return workflow: no new-note command, native note picker, link-to-file picker, template flow or reliable rich-editor navigation appears in the manifest and command implementation.

First make Save, Undo, links and checkboxes dependable. Then add a small **New Markdown Note** command using an explicit destination, optional plain Markdown template and native dialogs; allow standard relative-link insertion. Reuse Explorer, Quick Open and workspace search for retrieval. Backlinks or daily notes can follow demonstrated demand. A vault database, graph panel, wikilinks and proprietary metadata would expand scope and contradict existing syntax decisions.

Image insertion is a good existing capability, but filenames as default alt text are weak descriptions. Offer a lightweight alt-text edit path. `image-assets.ts` constructs file URIs from `fsPath`, so non-file/virtual documents need URI-preserving handling or explicit unsupported capabilities. This does not prove every Remote SSH workspace is broken.

### 3.6 Spec-Driven Workflow Support

Current support is generic document editing; there is no substantial spec-specific runtime workflow. The repository's own specification files do not constitute product support.

Specifications depend on stable requirement IDs, task checkboxes, internal anchors, code paths, tables, diagrams and small reviewable diffs. Existing source churn and task-list limitations directly undermine that use case. External agent edits also exercise the synchronization conflict path more often than isolated writing.

Add realistic compatibility fixtures for a Spec Kit `spec.md` / `plan.md` / `tasks.md` sequence and an OpenSpec proposal/design/tasks/change-spec set. Preserve wording and IDs byte-for-byte outside the intended edit. Later, a native **Related specification documents** picker could navigate nearby artifacts without running an agent or imposing a workflow. Checkbox completion must never be presented as proof that implementation or verification succeeded.

### 3.7 Build / Performance / Maintainability

**Production output is not actually production-configured (verified).** `esbuild.mjs` supports `--production`, but the package/prepublish scripts call it without that flag. The webview is an 8.36 MiB IIFE; dynamic `import('mermaid')` is included in that bundle, delaying initialization rather than download/parsing. A separate audit-only build with minification produced a 3.70 MiB webview, approximately **56% smaller**. This measures bytes, not startup speed.

**Package contents depend on prior builds (verified).** The local VSIX contained 91 files / 2.96 MB compressed, including 75 stale `media/chunks/` files totaling 2.63 MB plus `bundle-metadata.json`. The current IIFE build does not generate those chunks. Clean only explicitly owned generated output and inspect the resulting archive; do not recursively remove mixed asset directories without first separating them.

Other performance risks require measurement: retained contexts for every hidden editor; reparsing all Markdown to resolve images on every host update; full-document serialization and replacement; repeated diagram work on selection changes. Measure cold open, edit acknowledgment latency, long-document typing and memory across multiple hidden tabs before a larger optimization project. Retain-context behavior may be justified if measured and paired with state recovery.

Maintainability improvements should follow ownership boundaries: separate table and generic code node views; extract synchronization/session logic from `index.ts`; consolidate the renderer policy and command metadata. No monorepo conversion, React migration, dependency-injection framework or new state library is warranted.

Build tooling mixes WDIO CLI 9 with several WDIO 8 packages; this deserves a compatible version audit but is not a proven explanation for the local runner failure. CI still uses Node 20, now EOL; move the development/CI toolchain to Node 24 LTS while separately validating the minimum VS Code runtime and API types. Do not raise the VS Code engine floor simply to match build-time Node types. [Node release status](https://nodejs.org/en/about/previous-releases)

**Verification performed:** Windows, Node 24.20.0, npm 11.12.1; integration runtime VS Code 1.139.1.

| Check                             | Outcome and limitation                                                                                                                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compile / typecheck               | Passed; typecheck repeated after the targeted changes.                                                                                                                                    |
| Bundle                            | Passed; host approximately 282.6 KiB, webview 8.36 MiB before audit-only minification.                                                                                                    |
| No-telemetry check                | Passed. This does not certify all security properties.                                                                                                                                    |
| Unit + coverage baseline          | 131 passed, one timezone-dependent filename assertion failed in Europe/Paris.                                                                                                             |
| Unit + coverage after fixture fix | **132 passed**, 84.99% lines / 73.66% branches in the configured subset. All 132 also passed in UTC and America/Los_Angeles.                                                              |
| Coverage scope                    | Excludes the custom editor provider and the webview directory; it cannot substantiate end-to-end editor reliability.                                                                      |
| Extension-host integration        | **Seven passed**. The configuration disables workspace trust and does not validate the rich-editor races.                                                                                 |
| Reading-first E2E                 | Failed with WebDriver `invalid session id`; no product behavior pass can be claimed. CI also marks its E2E job non-blocking.                                                              |
| Lint                              | Could not run successfully: installed `@typescript-eslint/scope-manager` was missing `dist/lib/dom.js`. This is an environment/dependency failure, not a diagnosed source lint violation. |
| Repository formatting baseline    | Failed on `tests/unit/image-assets.test.ts`, `package.json`, `package-lock.json`. The changed test was formatted; unrelated manifest/lock formatting was left for its own change.         |
| VSIX packaging                    | Succeeded locally; exposed stale media inclusion. Marketplace upload was not attempted.                                                                                                   |
| Debug setup                       | Task dependencies, script resolution, `dist` entrypoint and source-map existence verified. Interactive F5 breakpoint binding was not separately exercised.                                |
| Browser examination               | Actual bundled webview in a simulated host; inspected layout/DOM and reproduced delayed-ack loss plus newline caret/undo reset. No native-theme or assistive-technology certification.    |

### 3.8 Docs / Onboarding / Repo Guidance

The root `AGENTS.md` correctly identifies v2 as a custom-editor webview and supersedes retired native-preview rules. However, its fidelity promise needed an explicit distinction between requirement and current behavior. It also pointed E2E contributors to integration tests and described manual l10n injection despite automatic mapping. These were corrected during the audit.

The development guide contained another contributor's absolute macOS paths and F5 instructions that did not build the actual entrypoint. Both are corrected. A stable short architecture map and runnable commands are more valuable agent context than another large planning framework.

`specs/markdown-preview/` retains v1 requirements banning the current architecture. Multiple roadmaps and market documents overlap. Keep historical records but label their status and point to current contracts; do not delete decision history. The security-posture document's resource-root and trust claims need comparison with current code: workspace-wide local roots and HTTPS images are currently allowed.

The README should lead with three user tasks: read an existing document, make a precise edit, and reopen source/change the default editor. Add honest alpha limitations, note/spec examples and a current screenshot. An exhaustive command-ID list is not onboarding. The existing icon/demo assets are useful; a larger brand redesign is unnecessary.

The absence of tracked skills/MCP configuration is not a readiness failure. A concise root `AGENTS.md`, reproducible commands and trustworthy tests suffice. If repeated work warrants it, add small repository skills for fidelity regressions or release checks, referencing scripts rather than duplicating policy. Keep credentials and personal tool settings out of source control.

### 3.9 Overall Product Coherence

Muninn currently combines a calm text measure with a comparatively busy editing shell and an incomplete safety contract. The product identity is coherent in the decisions, but execution is uneven. Its strongest potential is a reliable reader/editor for Git-managed knowledge and specifications.

The native hybrid Markdown editor makes a June assumption about future competition current reality. Rebenchmark actual journeys against it: open a long spec, follow a requirement link, inspect a diagram, change a task, receive an external edit, save and review the Git diff. Preserve Muninn only where its experience is demonstrably better or more dependable. That is a product validation task, not a reason for an immediate rewrite.

## 4. External Research Summary

### 4.1 VS Code Extension Best Practices

**Official guidance:** custom text editors are the appropriate API when the underlying file is text and the presentation is specialized. Synchronize through the `TextDocument`, handle external updates and use narrowly scoped edits. Muninn has the right API but an incomplete synchronization contract. [Custom editor guide](https://code.visualstudio.com/api/extension-guides/custom-editors)

Contributed commands/custom editors activate automatically on the supported modern VS Code baseline; startup activation should have a distinct need. Native editor selection should own user preference. [Activation events](https://code.visualstudio.com/api/references/activation-events)

Webviews should use constrained resources, CSP, theme/accessibility integration and state restoration. `retainContextWhenHidden` has a memory cost; measure its need. [Webview guide](https://code.visualstudio.com/api/extension-guides/webview)

Trust-sensitive overrides belong in restricted configurations so an untrusted repository cannot supply its own permission. Both execution paths and live configuration transitions need enforcement. [Workspace Trust guide](https://code.visualstudio.com/api/extension-guides/workspace-trust)

Separate development/debug builds from production packaging, keep typechecking, and align launch source maps with the actual bundle. The existing esbuild setup can meet this without replacement. [Bundling guide](https://code.visualstudio.com/api/working-with-extensions/bundling-extension)

### 4.2 VS Code UX Best Practices

**Official guidance:** editor actions should be contextual, with one quick-action icon at most and secondary actions in overflow. Muninn currently contributes eight. [Editor actions](https://code.visualstudio.com/api/ux-guidelines/editor-actions)

The specialized document surface justifies a webview; generic settings, selection and navigation should reuse VS Code. Keep typography, focus, accessible naming and theme behavior consistent with the host. [Webview UX](https://code.visualstudio.com/api/ux-guidelines/webviews)

**Recommendation:** one persistent source action, a compact formatting toolbar, contextual table/code actions and one inline diagram. Focus must remain discoverable by keyboard; hiding controls on hover alone would be a regression.

### 4.3 Markdown / Reading / Note-Taking Best Practices

**Official baseline:** VS Code's Markdown tooling already supports substantial document/link navigation and editing assistance. A custom surface must deliberately preserve access to that workflow; it does not inherit every source-editor capability automatically. [Markdown documentation](https://code.visualstudio.com/docs/languages/markdown)

**Engine guidance:** ProseMirror changes should flow through transactions and mapped positions. Recreating state discards the editor's continuity. Exact preservation of Markdown spelling remains Muninn's responsibility; a semantic schema alone does not supply source fidelity. Context7 was used to check current ProseMirror documentation. [ProseMirror guide](https://prosemirror.net/docs/guide/)

**Accessibility guidance:** Mermaid supports author-provided accessible titles and descriptions. Preserve these through sanitization and rendering. [Mermaid accessibility](https://mermaid.js.org/config/accessibility.html)

**Community patterns, not universal standards:** Foam emphasizes rediscovery and connected notes; Markdown All in One emphasizes fast source editing; Spec Kit and OpenSpec emphasize persistent Markdown artifacts. Muninn should borrow their useful journeys while preserving CommonMark/GFM and avoiding unnecessary workflow ownership. Benchmarks are detailed below.

### 4.4 Codex / Repo Setup Best Practices

Official Codex documentation describes repository and directory-scoped instruction discovery. Keep root guidance short, explicit about verification and current architecture, with narrower instructions only when a subsystem genuinely differs. [AGENTS.md guide](https://learn.chatgpt.com/docs/agent-configuration/agents-md)

Skills provide reusable workflows and can live in `.agents/skills`. They are optional: add a fidelity skill only when it makes a repeatable task easier. [Skills guide](https://learn.chatgpt.com/docs/build-skills)

MCP configuration supports project-specific tools, subject to trust. Context7 and official documentation tools are useful for current API research; they should not become extension runtime dependencies. No shared credentials, mass skill installation or new model service is justified. [MCP guide](https://learn.chatgpt.com/docs/extend/mcp)

### 4.5 Relevant Benchmarks and Patterns

Rank benchmarks by the particular question they answer: native VS Code first for integration, its extension samples for architecture, Foam for note rediscovery, and Spec Kit/OpenSpec for artifact compatibility. Rich-editor competitors provide interaction comparisons rather than proof of round-trip safety.

Maintenance observations below were checked through public GitHub metadata on 25 September 2026. Stars are approximate traction signals, not install counts or quality scores; a recent push can be automated. UX/architecture assessments are reasoned judgments from documentation and selected source inspection, not a full audit or usability trial of every product.

## 5. Useful External Repositories / Extensions

| Priority / benchmark                                                                                                     | Purpose and relevance                                                        | Maintenance / traction                                              | UX and architectural assessment; pattern to study                                                                                                                                                                                                                              | Recommendation for Muninn                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. [VS Code](https://github.com/microsoft/vscode)**                                                                    | Native Markdown and experimental hybrid editing; closest platform baseline.  | Active September 2026; about 193k stars for the whole editor.       | Mature host integration, experimental hybrid surface. Its [Markdown editor provider](https://github.com/microsoft/vscode/blob/main/extensions/markdown-language-features/src/preview/markdownEditorProvider.ts) uses edit epochs/queues, scoped replacements and link routing. | **Essential benchmark.** Study lifecycle/navigation and compare real journeys; do not depend on private APIs or assume feature stability.   |
| **2. [VS Code extension samples](https://github.com/microsoft/vscode-extension-samples/tree/main/custom-editor-sample)** | Canonical custom-editor API examples.                                        | Push 5 September; about 10.2k stars across samples.                 | High value for API contracts; deliberately small examples, not production-grade fidelity engines or UX products.                                                                                                                                                               | **Yes, architectural reference.** Apply its boundary patterns with stronger tests.                                                          |
| **3. [Foam](https://github.com/foambubble/foam)**                                                                        | Personal knowledge management and linked notes inside VS Code.               | Active September; release 0.44.6 on 1 September; about 17.4k stars. | Broad, established navigation/template workflows; README still acknowledges alpha-quality areas. Native definition/reference concepts aid rediscovery, but the knowledge model is larger than Muninn needs.                                                                    | **Yes, selected patterns.** Study capture, links and return paths; do not adopt wikilinks, graph scope or the whole knowledge model.        |
| **4. [Markdown All in One](https://github.com/yzhang-gh/vscode-markdown)**                                               | Source-oriented Markdown shortcuts, lists and document helpers.              | Unarchived; latest observed push 13 June; about 3.3k stars.         | Mature narrow editing utility; native source-editor approach has a smaller custom UI burden.                                                                                                                                                                                   | **Yes.** Study keyboard ergonomics, command discoverability and coexistence. Avoid automatic normalization under Muninn's fidelity promise. |
| **5. [GitHub Spec Kit](https://github.com/github/spec-kit)**                                                             | Structured specification-to-implementation workflows and Markdown artifacts. | Active September; about 139k stars.                                 | Strong artifact/workflow reference; fast-moving agent/CLI framework, not a benchmark rich editor.                                                                                                                                                                              | **Yes, compatibility fixtures.** Read and preserve its documents without bundling its agent orchestration.                                  |
| **6. [OpenSpec](https://github.com/Fission-AI/OpenSpec)**                                                                | Change proposals, design, tasks, requirement deltas and archived changes.    | Active September; about 70.3k stars.                                | Useful brownfield artifact hierarchy and related-document model. Its CLI documents telemetry, so importing its runtime would conflict with Muninn's policy.                                                                                                                    | **Yes, artifact patterns only.** Support its ordinary Markdown through navigation and fidelity tests.                                       |
| **7. [Markdown Preview Enhanced](https://github.com/shd101wyy/vscode-markdown-preview-enhanced)**                        | Rich previews, diagrams, math and export.                                    | Release 0.8.37 on 25 September; about 2.1k stars.                   | Mature rendering breadth; broad feature surface and additional execution/export concerns make it a poor scope template.                                                                                                                                                        | **Selective.** Compare long-document rendering and diagram UX; do not copy its full feature catalogue.                                      |
| **8. [Markdown Editor by zaaack](https://github.com/zaaack/vscode-markdown-editor)**                                     | Vditor-based WYSIWYG/instant-rendering editor with images.                   | Unarchived; push 2 September; about 609 stars.                      | Direct interaction comparator, smaller maintenance/community signal; README still lists Custom Text Editor adoption as a TODO. That is a documentation caveat, not proof of every current source path.                                                                         | **Selective UX study.** Compare source switching/image insertion; no engine migration or fidelity assumption.                               |
| **Avoid adopting: [VS Code Webview UI Toolkit](https://github.com/microsoft/vscode-webview-ui-toolkit)**                 | Former themed component library.                                             | Archived; last observed push September 2024; about 2.1k stars.      | Historical examples remain informative, but it is not an actively maintained modernization dependency.                                                                                                                                                                         | **No new dependency.** Keep the existing small DOM/CSS layer with host theme tokens.                                                        |

## 6. Gap Analysis

| Area            | Current state                                                            | Required improvement / disposition                                                                       |
| --------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Architecture    | Correct custom-text-editor API, unsafe acknowledgment/state replacement. | Preserve API; repair synchronization before new editing features.                                        |
| Fidelity        | Explicit invariant, known codec deviations, edited-table corruption.     | Preserve untouched source and define safe source fallback for unsupported constructs; test actual edits. |
| Trust           | Host gate, ungated inline renderer, workspace-controlled override.       | One effective policy enforced by every renderer; protect overrides and test restricted workspaces.       |
| Default editor  | Declared custom editor plus settings mutation.                           | Keep native selection; remove the redundant preference-writing machinery.                                |
| Reading         | Good measure, busy shell, weak navigation.                               | Reduce chrome and provide reliable links, heading navigation and Find.                                   |
| Notes           | Existing-file editing and images.                                        | Reliable save/undo first, then a minimal native capture/link workflow.                                   |
| Specs           | Generic Markdown rendering, source churn and weak checkboxes.            | Stable IDs, anchors, tasks and external-edit handling; artifact compatibility over agent orchestration.  |
| Performance     | Bundled but unminified; stale media; retained contexts.                  | Reproducible production build first; profile before splitting/optimizing further.                        |
| Test confidence | Helpful helper tests and seven integration passes.                       | Blocking behavioral tests for the excluded provider/webview, trust and fidelity.                         |
| Guidance        | Strong constraints mixed with historical contracts and stale setup.      | Keep decisions; publish current evidence and label obsolete implementation documents.                    |
| Agent tooling   | Root instructions, no shared project skills/MCP.                         | Already viable; optional small workflow skills only when beneficial.                                     |

The principal redundant/low-value elements are automatic association synchronization, duplicate Mermaid presentation/policy, duplicated action definitions, stale generated package files, and multiple documents presenting themselves as current roadmaps. Missing high-value elements are reliable document synchronization, safe exact edits, navigable documents, actionable test gates and honest onboarding.

## 7. Prioritized Action Plan

Effort: **S** = roughly 0.5–2 engineering days, **M** = roughly 3–5 days, **L** = a week or more / design plus staged implementation. These are planning estimates, not commitments. Existing backlog work should be updated rather than duplicated; verify live issue status first.

### P0

**P0.1 — Make edit acknowledgment, undo and save reliable.**

- **Issue / importance:** older host snapshots erase pending input; normalization recreates history; save/source switching can outrun pending drafts. This threatens user content.
- **Files:** `src/webview/editor/{index,sync,messages}.ts`, `src/custom-editor/{document-sync,protocol,muninn-custom-editor-provider}.ts`, `src/extension.ts`, core unit/integration/E2E suites.
- **Change:** operation IDs and explicit success/no-op acknowledgments; preserve pending edits; define external-change reconciliation; map transactions/selection; coordinate Save, close and all source-switch paths.
- **Effort / impact / status:** **L / critical data integrity / essential**.
- **Acceptance:** delayed and reordered acknowledgments, no-ops, external edits, newline/CRLF input, rapid typing, Save and source switching preserve the intended text and sensible undo/selection. Include active table-cell drafts.

**P0.2 — Enforce source preservation, including edited tables and tasks.**

- **Issue / importance:** 23 corpus cases change constructs; editing a table loses alignment and splits escaped pipes; full-document serialization churns untouched specs.
- **Files:** `markdown-codec.ts`, `markdown-transforms.ts`, `tables/markdown-table-utilities.ts`, table node view, `tests/unit/round-trip/`, `specs/round-trip-correctness/spec.md`.
- **Change:** retain source ranges/raw spelling for untouched syntax, apply localized edits, preserve table metadata, tokenize escaped cells correctly, and handle GFM tasks. For unsupported constructs, preserve raw content and direct edits to source instead of rewriting it.
- **Effort / impact / status:** **L / trustworthy Git diffs and spec editing / essential**.
- **Acceptance:** exact expected output for edits and no edits, CRLF, references, wrapping, lists, code fences, tasks and aligned/escaped tables. Known deviations must pin exact output so they cannot silently worsen within a category.

**P0.3 — Unify trust and rendering policy.**

- **Issue / importance:** inline Mermaid never receives the host gate; the workspace can supply the untrusted override; HTTPS images contradict the documented no-remote-resource rule.
- **Files:** provider, `protocol.ts`, `messages.ts`, `index.ts`, `preview.ts`, `nodes/table-node-view.ts`, `mermaid-renderer.ts`, `mermaid-adapter.ts`, `package.json`, localization files, `docs/SECURITY_POSTURE.md`.
- **Change:** enforce a single host-derived policy for all render calls and configuration changes; restrict the override to user-controlled settings in Restricted Mode. Consolidate the preview. Resolve the remote-image policy explicitly, with default blocking consistent with current repo rules; constrain local roots and reject oversized encoded image payloads before decoding.
- **Effort / impact / status:** **M / reliable security and configuration promises / essential**.
- **Acceptance:** renderer is not called when disabled or restricted; workspace settings cannot grant permission; trust transitions work; malicious SVG/link/image fixtures remain constrained. Source review found the bypass; actual restricted-mode diagram execution still needs a proper runtime test.

**P0.4 — Stop overwriting editor preferences.**

- **Issue / importance:** startup association writes replace another editor and cannot restore prior values.
- **Files:** `src/extension.ts`, `package.json`, `tests/unit/extension-associations.test.ts`, onboarding/migration docs.
- **Change:** remove automatic writes; use native editor selection. Migrate only preferences proven to have been written by Muninn, preserving explicit choices; remove unnecessary startup activation.
- **Effort / impact / status:** **M / user trust and clean repository settings / essential**.
- **Acceptance:** opening, upgrading or disabling Muninn leaves unrelated user/workspace associations unchanged; existing explicit Markdown choices still work.

**P0.5 — Make behavioral failures release-blocking.**

- **Issue / importance:** coverage excludes core behavior, known-deviation tests are permissive, and E2E failures do not block CI.
- **Files:** `package.json`, lockfile, WDIO config/runners, `.vscode-test.mjs`, `tests/`, `.github/workflows/{ci,release}.yml`.
- **Change:** repair the runner with a compatible dependency set; add provider/webview regression harnesses and restricted-workspace cases; block releases on deterministic safety tests. Keep environment failures distinguishable from assertion failures. Fix remaining formatting and verify lint from a clean install.
- **Effort / impact / status:** **M / credible release evidence / essential**.
- **Acceptance:** a clean checkout has reproducible gates that fail on P0.1–P0.3 reproductions. Publish which code is covered rather than increasing headline coverage cosmetically.

### P1

**P1.1 — Complete document navigation.**

- **Issue / importance:** reading a spec or note is interrupted by missing anchors, link routing and find behavior.
- **Files:** webview codec/index/messages, host protocol/provider, `package.json`, navigation E2E fixtures.
- **Change:** validated host-mediated file/external links, stable heading anchors, native heading Quick Pick and Find. Check native Outline support before committing to it; preserve return position through source switching.
- **Effort / impact / status:** **M / high reading and note usability / essential to the product promise**.
- **Acceptance:** relative file links, encoded filenames, same/cross-file anchors, heading search and Find work from the custom editor without losing pending edits.

**P1.2 — Reduce chrome and finish accessible editing interactions.**

- **Issue / importance:** duplicated actions/diagrams consume reading space; contextual insertion, cancellation and accessibility remain inconsistent.
- **Files:** `package.json`, `bootstrap.ts`, `index.ts`, `styles.css`, node views, preview, strings, toolbar/table E2E tests.
- **Change:** one primary title action; compact toolbar; contextual block actions; explicit insert-below behavior and canceled-input completion; correct root whitespace and theme typography/link colors; preserve Mermaid author descriptions and localize remaining strings.
- **Effort / impact / status:** **M / high clarity and accessibility / essential**.
- **Acceptance:** keyboard-only and screen reader checks, narrow splits, light/dark/high-contrast themes and zoom; selected text is not unexpectedly replaced, and actions target the intended table.

**P1.3 — Produce a clean, supported production build.**

- **Issue / importance:** unused production mode, stale media and Node 20 CI undermine package quality and maintenance.
- **Files:** `esbuild.mjs`, package scripts, `.vscodeignore`, workflows, optional Node version file, release docs.
- **Change:** wire production minification; isolate/clean generated outputs; assert VSIX contents and a documented bundle-size budget; use Node 24 LTS for tooling; validate minimum and current VS Code separately.
- **Effort / impact / status:** **M / smaller reproducible artifacts / essential before public distribution**.
- **Acceptance:** clean and previously built checkouts package the same runtime files; no stale chunks or metadata; the minified editor passes behavioral tests. Keep sourcemaps for local debugging.

**P1.4 — Add the smallest useful note/spec workflow.**

- **Issue / importance:** editing an existing file is supported, but capture and connecting related files require raw-source work.
- **Files:** `src/extension.ts`, `package.json`, l10n files, URI/image helpers, integration fixtures, README.
- **Change:** native New Markdown Note and insert-relative-link pickers; optional plain Markdown templates. Add Spec Kit/OpenSpec compatibility fixtures before any spec-specific command. Reuse Explorer/search.
- **Effort / impact / status:** **M / meaningful capture and spec utility / optional expansion after P0 and navigation**.
- **Acceptance:** create, save, link, reopen and move between documents in a multi-root workspace without proprietary syntax or silent file overwrites.

**P1.5 — Make release metadata and artifacts publishable.**

- **Issue / importance:** `2.0.0-alpha.1` is not the Marketplace's supported version format; `preview: true` is not its pre-release channel. Bundled third-party notices are missing, and publication rebuilds instead of necessarily using the tested archive.
- **Files:** package metadata, release workflow, `.vscodeignore`, `docs/RELEASE.md`, existing licensing backlog.
- **Change:** choose a numeric version and explicit pre-release packaging/publication, test and publish the same VSIX, and complete the already-decided notices/source-header work. Preserve the AGPL decision; publisher accounts and maintainer attestations remain human-owned.
- **Effort / impact / status:** **M / reliable distribution / essential before publication**.
- **Acceptance:** inspect the release archive and metadata, verify notices and source availability under the existing project policy, and demonstrate the pre-release path in an authorized release. No upload was performed in this audit. [Publishing guidance](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)

**P1.6 — Consolidate current guidance and competitive positioning.**

- **Issue / importance:** historical v1 contracts, multiple roadmaps, obsolete development paths and June competitor assumptions mislead contributors and users.
- **Files:** `AGENTS.md`, `.vscode/`, `README.md`, `docs/{DEVELOPMENT,ARCHITECTURE,README,SECURITY_POSTURE,STRATEGIC_ROADMAP}.md`, June market snapshot, legacy specs.
- **Change:** keep one current navigation/architecture contract; label historical specs; lead onboarding with user journeys and known limits; compare native hybrid Markdown in the next product review.
- **Effort / impact / status:** **S / faster maintenance and honest positioning / essential; partially implemented in this audit**.
- **Acceptance:** a new contributor can build/debug without personal paths, find current requirements, and distinguish intent from verified behavior.

### P2

**P2.1 — Optimize measured hot paths.**

- **Issue / importance:** a large Mermaid bundle, repeated parsing/rendering and retained hidden tabs may harm large-document performance; latency and memory have not been profiled.
- **Files:** provider image resolution, editor transactions, renderer/cache, `esbuild.mjs`, performance fixtures.
- **Change:** measure first; then cache image/diagram work and use genuine CSP-compatible lazy chunks or a smaller supported diagram set where justified. Evaluate state restoration before dropping retained contexts.
- **Effort / impact / status:** **M / potentially high, workload-dependent / optional until measured**.
- **Acceptance:** recorded cold-open, typing and multi-tab memory results show improvement without fidelity, trust or state regressions.

**P2.2 — Split large modules along real responsibilities.**

- **Issue / importance:** table/code node views and editor orchestration mix unrelated duties, increasing change coupling.
- **Files:** `nodes/table-node-view.ts`, `index.ts`, command/renderer modules.
- **Change:** extract `table-node-view`, `code-block-node-view`, editor session/sync and shared command definitions when touching these areas. Preserve public contracts and behavior.
- **Effort / impact / status:** **M / moderate maintenance benefit / optional incremental cleanup**.
- **Acceptance:** regression tests stay meaningful and passing; no new framework or parallel abstraction stack.

**P2.3 — Add only demonstrated platform/workflow extensions.**

- **Issue / importance:** virtual/web workspace support, backlinks, daily notes, math and export are possible opportunities, but their demand is unproven and they increase the fidelity/security matrix.
- **Files:** URI helpers, future browser entrypoint/build, native commands and targeted fixtures; relevant existing backlog items.
- **Change:** explicitly document current platform boundaries. Select at most one demand-backed expansion after the core is reliable; keep proprietary syntax, telemetry and extra custom webviews out.
- **Effort / impact / status:** **L for web support; S–M for a narrow native workflow / demand-dependent / optional**.
- **Acceptance:** a concrete user journey and compatibility/security tests justify the added maintenance cost.

**P2.4 — Add focused agent workflows only if repetition warrants them.**

- **Issue / importance:** fidelity and release checks involve repeatable evidence collection; generic skill collections would add noise.
- **Files:** optional `.agents/skills/muninn-fidelity/SKILL.md` or release skill, existing scripts, `AGENTS.md` links.
- **Change:** short instruction-only skills invoking repository commands and reporting limitations. Keep MCP optional and secrets out of tracked files.
- **Effort / impact / status:** **S / modest contributor consistency / optional**.
- **Acceptance:** contributors can perform the same workflow without the agent tooling; no duplicated rules or automatic external publication.

## 8. Final Recommendation

First fix **synchronization, exact edits, trust enforcement and editor preference mutation**. Make their regression tests block release. Then deliver **navigation and a quieter, accessible interface**, followed by reproducible production packaging and a small note/spec capture workflow.

Simplify the automatic association machinery, double Mermaid rendering, repeated action definitions and contradictory current-looking documents. Preserve ProseMirror, the custom text editor, Markdown files, native dialogs, localization, accessibility helpers and no telemetry. Preserve licensing and product decisions already made.

A strong Muninn should make one demanding journey feel ordinary: open a long specification, understand it, follow its links, make a small edit while an agent changes another section, undo safely, save, and see only the intended Git diff. That is the release criterion with the greatest product value.

## 9. Implementation Summary

Implemented only confirmed development/test/documentation fixes:

- Added `.vscode/tasks.json` to compile and bundle before debugging; corrected `launch.json` output/source-map paths for extension and test launches.
- Corrected the image filename test to construct local wall-clock time, matching production behavior. Formatted the touched test. No production filename behavior changed.
- Updated `docs/DEVELOPMENT.md` with portable paths, actual runtime/build instructions, test-scope limitations and current development Node guidance.
- Updated `AGENTS.md` with correct E2E paths, automatic l10n injection, debug-build requirements, fidelity verification expectations and current-versus-historical evidence distinctions.
- Added this audit and linked it from the documentation index.

Production code, dependency versions, lockfile, package metadata, release accounts, core UX and editor architecture were intentionally left unchanged. The coupled editing/trust fixes should be separate reviewable changes with regression coverage; they are not marked complete here. Existing `graphify-out/` was preserved. No commit or publication was made.

Validation after changes: 132 unit tests and configured coverage thresholds passed; all unit tests also passed under UTC and America/Los_Angeles; typecheck and debug task/output checks passed. Targeted formatting and diff checks cover the changed files. Full lint remains unvalidated because of the installed dependency failure; existing package/lock formatting failures and the E2E runner failure remain outstanding. Baseline extension-host integration passed seven tests, but interactive F5, restricted mode, minimum-version compatibility and assistive-technology behavior still require the checks described above.

Audit-only ignored artifacts include test logs, public benchmark metadata, a local protocol/UI harness, a packaged baseline VSIX and a minified bundle-size experiment under `artifacts/`. These are evidence from this machine, not additional release inputs.
