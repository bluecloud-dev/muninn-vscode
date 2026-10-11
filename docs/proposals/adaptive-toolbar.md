# Adaptive editor toolbar

Status: approved and implemented locally on 11 October 2026 in `codex/adaptive-toolbar`; validation results appear below. Requested and researched against `394f34b904a61b7ece501cc6e6ec423ba78bdafb` (`main`, package version `1.1.0`). The change is not published or installed into the user's VS Code profile.

**Recommendation:** make the webview toolbar the complete entry point for document editing. Put a visible Paragraph/Heading selector in that toolbar, opening its choices immediately below it. Keep one row of controls, show as many as fit, and move only the remaining controls into a labeled `…` menu. Remove the fixed basic/advanced split.

[Open the interactive HTML illustration](adaptive-toolbar.html) to resize the sample pane, try the local heading menu and inspect overflow in light and dark themes. Formatting previews affect sample text only; file and insertion actions show explanations. This illustrates the proposed interaction and does not implement it in the extension.

## Problem and research baseline

The requested experience is a traditional editor: formatting choices belong beside the document, and a wider pane should expose more tools automatically. At the research baseline, the source made two different decisions:

- `chooseBlockStyle` is an icon button. Clicking it sends a request to the host, which opens a VS Code Quick Pick containing Heading 1, Heading 2, Heading 3 and Paragraph. The current style appears in help text rather than as a visible selector label. Sources: [toolbar markup](../../src/webview/editor/bootstrap.ts), [click handling and state](../../src/webview/editor/index.ts), [native picker](../../src/custom-editor/muninn-custom-editor-provider.ts).
- More always toggles the same five actions: strikethrough, task, file link, code block and Mermaid. CSS wraps formatting groups; it does not compute which actions fit. Sources: `ADVANCED_TOOLBAR_COMMANDS`, `updateAdvancedToolbarVisibility` and `setToolbarMode` in [index.ts](../../src/webview/editor/index.ts), [layout CSS](../../src/webview/editor/styles.css).
- Image, Undo and Redo have native commands but no main-toolbar buttons. Formatting also appears in the native editor-title menu. Sources: [command contributions](../../package.json), [command registration](../../src/extension.ts), [toolbar markup](../../src/webview/editor/bootstrap.ts).

The previous toolbar issue, [#370](https://github.com/bluecloud-dev/muninn-vscode/issues/370), was confirmed closed on 11 October 2026. It explicitly requested the native block-style picker, wrapping groups and preserved basic/advanced preferences. This proposal changes those product decisions; it does not claim the earlier narrow-pane defect is still present. The earlier UI/UX proposal was background; this approved proposal supersedes its toolbar decisions. Other work in that proposal is outside this request.

The original research used source, existing test inspection, live issue status and primary documentation. It did not exercise a running editor, packaged VSIX or assistive technology. The implementation validation below adds packaged-editor evidence.

## Why this pattern

Microsoft's Fluent toolbar guidance describes a single row whose surplus actions move into an overflow menu, with icons and text labels in that menu. It also recommends logical action groups and discoverable icon names. This directly supports the requested behavior; it is a design reference, not a proposal to install Fluent or React. [Fluent toolbar guidance](https://fluent2.microsoft.design/components/web/react/core/toolbar/usage).

VS Code's custom editor view can use HTML, CSS and JavaScript, and its webview guidance allows toolbar and in-view command actions. Therefore an in-webview style menu is technically feasible. Continue using VS Code theme/font variables and keyboard accessibility. This is an inference from the supported webview model, not an automatic accessibility guarantee. [Custom editors](https://code.visualstudio.com/api/extension-guides/custom-editors), [webview UX](https://code.visualstudio.com/api/ux-guidelines/webviews), [webview theming](https://code.visualstudio.com/api/extension-guides/webview#theming-webview-content).

The UI/UX skill's design-system search was run, followed by toolbar, focus and accessibility searches. Its generic landing-page layout, palette and font suggestions do not suit an embedded VS Code editor. Use Muninn's existing locally bundled Codicons, theme tokens, semantic buttons, visible focus and 32px minimum targets instead. These choices follow the current [development rules](../DEVELOPMENT.md), [toolbar CSS](../../src/webview/editor/styles.css) and [icon helper](../../src/webview/editor/icon-button.ts).

## Proposed interaction

### Headings stay beside the document

Replace the text-size icon with a text selector such as **Paragraph ▾** or **Heading 2 ▾**. It opens a small anchored menu inside the webview, with the current choice marked. For the first change, retain the existing Paragraph and Heading 1–3 choices. Existing H4–H6 content must still display its actual level; adding authoring options for those levels is a separate scope choice, not a prerequisite for this toolbar change. The inherited Markdown schema already supports those nodes. Sources: [schema construction](../../src/webview/editor/markdown-codec.ts), [ProseMirror Markdown schema](https://github.com/ProseMirror/prosemirror-markdown/blob/master/src/schema.ts).

Choosing a style applies to the original editor selection. Choosing the current style, opening the menu or canceling it makes no document edit. A mixed or unsupported selection must not misleadingly display Paragraph: use a neutral Block style label when no single applicable style describes it. Keep **Headings** navigation distinct from the style selector; it moves through the document and can retain its native picker. These are proposed product behaviors, with the existing selection/no-op baseline captured in [editor-behavior.test.ts](../../tests/unit/editor-behavior.test.ts).

**Preserve the distinction between choosing and toggling.** The native picker uses `setBlockType` to choose a style. In contrast, `executeEditorCommand('setHeading1')` calls `toggleHeadingLevel`, which changes an already-active H1 back to Paragraph. Reusing that toggle directly for the new selector would change its behavior. Keep the deterministic style-choice path and leave existing public toggle commands compatible. Sources: `applyPickerResult`, `toggleHeadingLevel` and `executeEditorCommand` in [index.ts](../../src/webview/editor/index.ts), [ProseMirror command reference](https://prosemirror.net/docs/ref/#commands.setBlockType).

### Overflow follows available space

These sketches illustrate the behavior, not fixed breakpoints or literal icon artwork. Words stand in for the existing Codicons.

```text
Roomy pane
[Undo] [Redo] | [Paragraph ▾] | [B] [I] [Strike] | [Bullets] [Numbers] [Task]
             | [Link] [File link] [Image] [Table ▾] [Code] [Mermaid] | [Headings] [Source]
             All of the above occupy one row when they fit; no … is needed.

Less room
[Undo] [Redo] | [Paragraph ▾] | [B] [I] [Strike] [Bullets] [Numbers]       [Source] [⋯]
                                                                                └ Task
                                                                                  Link
                                                                                  File link
                                                                                  Image
                                                                                  Table…
                                                                                  Code block
                                                                                  Mermaid
                                                                                  Headings

Narrow pane
[Paragraph ▾] [B] [I]                                               [Source] [⋯]
             The rest remain available in the same overflow menu.
```

Use a stable visual order: history, block style, text, lists/tasks, insertions, document navigation. Prefer keeping Block style and Source inline, followed by Bold and Italic; remove trailing remaining actions as space runs out. Apply the same priorities on every resize, rather than learning usage or rearranging controls after a click. If even the preferred controls cannot fit, move them into overflow too; only the overflow entry must remain reachable.

The number of visible controls is unrestricted. A wide pane exposes every applicable control, a narrower pane exposes fewer, and each action appears once across the inline toolbar and overflow. More is present only when needed. Separators appear only between nonempty groups; a group may partly overflow so spare space can still hold useful controls. Keep normal target sizes instead of shrinking hit areas to fit. These are the proposed fit rules, derived from the user's request and the Fluent pattern above.

When More is open, show a vertical, text-labeled action menu with icons, shortcuts where already available, and current toggle/disabled states. Close it after activation or Escape; outside clicks dismiss it. Resize closes an open menu and restores focus to a surviving trigger or More when focus was inside that menu. Moving controls during a resize must never steal focus from the document or a table input. Prefer placing the style selector before other formatting controls, so it remains easy to find.

### Complete editing inventory

“Everything” means existing document-editing actions have an entry point here. File dialogs and text input can still use native VS Code APIs. Do not add settings, new-note management or issue reporting to the formatting row.

| Group           | Toolbar surface                                   | Existing action coverage                                                                                                              |
| --------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| History         | Undo, Redo                                        | `undo`, `redo`; disabled when unavailable                                                                                             |
| Block style     | Paragraph/Heading selector                        | `setParagraph`, Heading 1–3 choices with the current picker semantics                                                                 |
| Text            | Bold, Italic, Strikethrough                       | `toggleBold`, `toggleItalic`, `toggleStrike`                                                                                          |
| Lists           | Bullets, Numbered list, Task                      | `toggleBulletList`, `toggleNumberedList`, `toggleTask`                                                                                |
| Links and media | Link, File link, Image                            | `insertLink`, `insertFileLink`, `insertImage`; native input/file selection remains                                                    |
| Blocks          | Table menu, Code block, Mermaid                   | `insertTable`, `insertCodeBlock`, `insertMermaidBlock`                                                                                |
| Table context   | Table menu: Insert new table, Add row, Add column | Covers the choices in `muninn.tableActions`; row/column availability follows the selected table. Existing local table controls remain |
| Document        | Headings, Source                                  | `goToHeading`, `openRawMarkdown`; retain existing host/flush paths                                                                    |

Source inventory: [bootstrap](../../src/webview/editor/bootstrap.ts), [editor command dispatch](../../src/webview/editor/index.ts), [native table-action choices and registration](../../src/extension.ts), [protocol](../../src/custom-editor/protocol.ts), [package contributions](../../package.json). Table/menu labels in the sketch stand for the corresponding local choices in this table, not a new native formatting picker.

Keep all public `muninn.*` commands and shortcuts. Remove duplicate document-formatting entries from `editor/title` after toolbar parity is established; retain Source and configuration access there. Command Palette entries remain alternative access for users who prefer them. Explorer, Find, OS file selection and diagnostic commands retain their current roles. This consolidation is a recommendation, not an external change made during research.

## Smallest implementation

Use the installed ProseMirror commands and existing toolbar/bootstrap, Codicon and focus code. No UI framework, menu package, new preference or parser/serializer change is needed.

1. Replace the fixed advanced visibility list with measured fit against the toolbar's available inline size. First test whether everything fits without More; otherwise reserve More, keep the preferred actions that fit and overflow the rest. Include real widths, padding, gaps and separators. Re-measure after pane resize, label/font changes and font loading. Keep non-rendered controls measurable without putting them into the focus or accessibility tree. Do not cache widths that become stale when the style label changes.
2. Use the platform's `ResizeObserver` to watch the available toolbar size and relevant control sizes. Batch measurement before visibility writes, apply only changed results, and disconnect observers on teardown. Avoid a feedback loop in which hiding an item changes the observed width and continually swaps it back. The browser documents both element-size observation and this loop hazard. [ResizeObserver](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver).
3. Put style and overflow popups in a webview overlay outside the toolbar's clipping/scrolling ancestors. Clamp their positions to the pane and bound their height with internal scrolling for short panes and long labels. The existing icon-help code provides a local positioning pattern; its tooltip is not itself a menu. Source: [icon-button.ts](../../src/webview/editor/icon-button.ts).
4. Route inline and overflow actions through the same existing command handlers and state updates. Add Image to the webview host-command dispatcher; `view.executeCommand` already accepts `insertImage` and the host already handles it, so this does not require a new protocol message. Expose table choices through the existing `editTable` path and preserve failures and original table targeting. Sources: [protocol](../../src/custom-editor/protocol.ts), [host handler](../../src/custom-editor/muninn-custom-editor-provider.ts), [table edits](../../src/webview/editor/tables/table-edit.ts).
5. For a local menu, retain the opening selection and document identity. Restore that selection for execution; if external content changes while open, cancel safely instead of applying to a different block. Reuse the current picker safeguards without retaining the host round trip for block style. Preserve the existing table-local picker where it is still used. Sources: `requestPicker`/`applyPickerResult` in [index.ts](../../src/webview/editor/index.ts), [fidelity contract](../ROUNDTRIP_CONTRACT.md).

Deprecate `muninn.toolbar.mode` with an explicit explanation that visibility now follows available space. Keep its public ID and accepted legacy values for compatibility; neither basic nor advanced should cap visible actions or force wrapping. Do not introduce an additional adaptive setting. This is an intentional change to an existing preference and must be called out in user documentation. Sources for the current setting: [package.json](../../package.json), [configuration service](../../src/services/config-service.ts), [README](../../README.md).

## Keyboard and accessibility requirements

Keep one toolbar Tab entry, Left/Right navigation and Home/End across visible inline controls. Reuse the current roving-focus controller, but exclude popup items from its toolbar button query and key handling. Hidden controls must not remain focus stops; when a focused inline control overflows, transfer focus to More. [WAI toolbar pattern](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/), [current controller](../../src/webview/editor/toolbar-roving-focus.ts).

The selector and More are menu buttons with `aria-haspopup="menu"`, `aria-expanded` and a popup relationship. Enter/Space opens the menu and focuses an item. Inside, Up/Down navigates; Enter activates, Escape returns to the trigger, and Tab exits and closes the menu. Use `menuitemradio` for style choices, `menuitemcheckbox` for formatting toggles and `menuitem` for one-shot actions. Keep names and checked/disabled states synchronized with the editor. [WAI menu button](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/), [WAI menu behavior and roles](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/).

Existing icon-only controls keep accessible names and hover/focus help. Menu rows have visible labels, and selected styles have a non-color indicator. Light, dark and high-contrast themes, reduced motion, larger fonts and 200% zoom remain acceptance requirements. Existing test infrastructure already contains those stress cases; it must be adapted to popup geometry and measured overflow rather than discarded. [Testing guide](../TESTING.md), [installed-VSIX suite](../../tests/electron/editor.test.mjs).

## Reach of the change

| Location                                                                                                 | Required work                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/webview/editor/bootstrap.ts`, `styles.css`                                                          | Selector text, new action entry points, single-row layout, popups and overflow representation                                                                         |
| `src/webview/editor/index.ts`                                                                            | Replace binary visibility, preserve deterministic style choices, share dispatch/state between surfaces, add Image routing, retain selection/stale-document safeguards |
| `src/webview/editor/toolbar-roving-focus.ts`, `icon-button.ts`                                           | Isolate popup and toolbar focus; preserve help. Do not run text-bearing style/menu items through `setIconButton`, which replaces children with a glyph                |
| `src/custom-editor/protocol.ts`, `muninn-custom-editor-provider.ts`                                      | Remove only the unused block-style picker branch if it has no remaining callers; keep validation and table-local request/result behavior                              |
| `package.json`, `package.nls.json`                                                                       | Deprecation text and duplicate title-menu cleanup; preserve public command IDs and keybindings                                                                        |
| `src/services/config-service.ts`, `src/types/config.ts`, `src/extension.ts`                              | Handle the legacy toolbar preference consistently; keep inspection truthful. Internal cleanup is only needed where its old behavior disappears                        |
| `src/shared/webview-strings.ts`, `l10n/bundle.l10n.json`                                                 | Localize selector labels, More help, menu rows and states through the existing injection mechanism                                                                    |
| Existing unit, host and Electron suites                                                                  | Update native block-style assumptions, add local selection/no-op/focus/fit checks, retain table picker and host validation coverage                                   |
| `README.md`, `docs/GETTING_STARTED.md`, `docs/ARCHITECTURE.md`, `docs/TESTING.md`, `docs/DEVELOPMENT.md` | Explain adaptive visibility and the local formatting-menu exception to native-picker guidance                                                                         |
| Existing round-trip fixtures                                                                             | Preserve bytes; reuse them for exact-edit assertions. Add a focused fixture only if a missing syntax case is actually needed                                          |

No new public export or dependency is required. A small toolbar-specific DOM module is reasonable if it owns the measured layout and popups; do not create a general-purpose command or menu framework. Shared table editing, codec, sync, image validation and Mermaid trust enforcement remain the existing boundaries. [Architecture](../ARCHITECTURE.md), [development](../DEVELOPMENT.md).

## Acceptance before shipping

- [ ] At 320, 375, 480, 768, 1024 and 1440 CSS-pixel pane widths, plus continuous dragging, show the maximum controls allowed by their measured sizes and stated priorities. No toolbar wrapping, horizontal scrolling or clipped actions. Once all controls fit, More disappears. Every applicable action remains available exactly once across the inline toolbar and More.
- [ ] Increasing width exposes an action as soon as it fits; decreasing width moves it into More as needed. Test the threshold with and without the More button's own width, fractional pixel sizes, larger fonts, doubled labels and native 200% zoom. No oscillation or observer-loop errors.
- [ ] Open Paragraph/Heading choices next to the selector without a host Quick Pick. Choose H2 on the second paragraph of `Alpha\n\nBeta\n`; Save yields exactly `Alpha\n\n## Beta\n`. Choosing H2 again changes no bytes and creates no undo entry. Canceling preserves the original selection. Test relevant LF/CRLF and terminal-newline variants.
- [ ] Verify local style selection, inline actions and overflow actions use the same safe edit behavior. Opening/closing either menu, resizing and changing themes do not dirty the document, alter undo history or apply raw table drafts.
- [ ] Exercise all entries in the inventory, including Image cancellation, Undo/Redo once, Table Add against the correct selected table, Mermaid policy rejection and Source flushing/recovery. A host-origin document change while a menu is open must not format stale content.
- [ ] Keyboard users can enter/exit the toolbar, open/navigate/dismiss both menus and reach every overflow action. Test a focused button moving into overflow, an open popup during resize, selection spanning multiple styles, an empty document, and a table input that retains focus and its raw draft.
- [ ] Measure popup bounds and scrolling in short panes and long-label cases. Verify named controls, visible focus, theme contrast, no missing Codicons, offline operation and unchanged CSP. Run VoiceOver/NVDA acceptance separately; DOM tests alone do not establish it.
- [ ] Use Node 24 and the applicable repository gates: types, lint, format, coverage, source-fidelity regressions, extension-host tests, a newly packaged VSIX and its Electron suite, package checks and no-telemetry. Record candidate hash, VS Code version and OS. Run round-trip generation if codec/schema work unexpectedly becomes necessary; keep fixtures fixed. [Required procedures](../DEVELOPMENT.md#gates), [test evidence boundaries](../TESTING.md).

## Scope and remaining risk

This proposal adds no framework, toolbar customization, usage-based ordering, ribbon, floating selection toolbar or unrelated formatting commands. It does not reopen the completed UI audit or change shared table/codec rules. The main implementation risks are focus/selection loss while menus open or controls move, clipping/measurement errors, and the intentional retirement of basic/advanced behavior. Those require the exact-edit, keyboard and packaged geometry checks above.

Research deliverables are this document and its interactive HTML illustration. The original research left application code and external resources unchanged. The approved implementation and its validation are isolated in the attached worktree. Other local proposals and GitHub resources remain outside this change.

## Implementation and validation

Implemented the approved single-row toolbar using existing commands, Codicons, theme tokens and roving focus. Paragraph/Heading and Table choices now open local menus; Undo, Redo and Image have toolbar entry points. Measured fit determines overflow, including real gaps and separators, with Block style, Source, Bold and Italic prioritized. Duplicate formatting entries were removed from the editor-title menu while public commands, shortcuts, Source and configuration access remain available. The legacy toolbar preference is deprecated and ignored. No dependencies, Markdown codec, sync or shared table-editing rules changed.

Implementation evidence was collected on macOS arm64 with Node `24.21.0`. The original tested pre-release archive was `muninn-vscode-1.1.0.vsix`, SHA-256 `a653f0e667fffe598e8c2fe4bda329f448bb67ab3646ad59fc7c9a1741713c5c`. Both original packaged runners recorded that hash. These are local results, not hosted CI results; release preparation below identifies the subsequent versioned archive separately.

| Check                                 | Result                                                                                                                                                                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit and bundled-editor coverage      | 301 tests pass; coverage thresholds pass; adaptive toolbar has 96.06% line coverage                                                                                                                                                              |
| Source fidelity                       | 58 of 58 golden fixtures remain byte-identical; no fixture or codec changes                                                                                                                                                                      |
| Extension host                        | 7 tests pass on VS Code 1.85.2 and 1.141.0                                                                                                                                                                                                       |
| Packaged UI                           | 19 tests pass on VS Code 1.85.2 and 1.141.0, including offline operation and Restricted Mode                                                                                                                                                     |
| Geometry and accessibility automation | 320–1440px panes, continuous resize, fractional fit thresholds, 24px fonts, 200% zoom, doubled names/help, short-pane popups, keyboard/focus and four default themes pass                                                                        |
| Exact edits and recovery              | Local heading selection/no-op/Undo, LF/CRLF and final-newline variants, stale menu cancellation, selected-table actions, raw drafts, Image cancellation/insertion and Source paths pass                                                          |
| Static and package gates              | Types, lint, format, no-telemetry, package validation and bundle budgets pass; archive is 1,341,611 bytes                                                                                                                                        |
| Dependency audit                      | Full audit reports 5 moderate development-tool findings and 2 low Mermaid/KaTeX findings; no high or critical findings. The CI high-severity gate passes. Dependency versions are unchanged; the release bump only changes root version metadata |

The first 1.85.2 packaged attempt stalled in global automated Undo keyboard delivery after Save. Targeting the active ProseMirror locator instead preserved the shortcut check and allowed the full suite to complete. The original failed log is retained alongside the successful rerun; it is not counted as a pass.

The acceptance checklist above remains the shipping checklist. Automated results cover the implementation on macOS; VoiceOver/NVDA, Windows/Linux and OS-specific file dialogs still require manual or platform validation. Existing dependency-audit findings also remain unresolved. Local logs are retained in `artifacts/adaptive-toolbar/`; traces and rendered geometry/theme values are in `artifacts/e2e/`.

### v1.1.1 release preparation

The requested version bump updates the manifest, root lockfile metadata, changelog and release documentation. The local `muninn-vscode-1.1.1.vsix` candidate has SHA-256 `45dc3f5c40ea6a0029259c1578375104d75bd9ba37fd5a0f11b4b353192df6b0` and is 1,342,025 bytes. All 115 packaged runtime assets are byte-identical to the tested implementation archive above. The Preview badge and pre-release channel remain enabled.

Fresh packaged runs overwrite `artifacts/e2e/<version>/candidate.json` with the versioned archive's identity. Hosted CI and the nonpublishing release rehearsal produce their own candidates and evidence; their hashes must not be substituted for the local hash. Marketplace access is checked separately on protected `main`. PR merge, remaining manual acceptance and authorization to publish are still required; see [the release guide](../RELEASE.md).
