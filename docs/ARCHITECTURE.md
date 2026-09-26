# Muninn architecture

Muninn is a desktop VS Code custom text editor (`muninn.markdownEditor`) for ordinary CommonMark/GFM files. The existing ProseMirror editor remains the core. Native pickers, commands, Explorer and Find provide the surrounding workflow; there is no separate application shell, note database or agent runtime.

## Ownership and data flow

| Area                                                 | Responsibility                                                                                                                                      |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/extension.ts`                                   | Register one CustomTextEditorProvider and localized native commands. VS Code infers activation from contributions. Never write editor associations. |
| `src/custom-editor/muninn-custom-editor-provider.ts` | Per-document sessions, validated messages, sequential applies, acknowledgments, native dialogs, flush/recovery, resource mapping and trust.         |
| `src/custom-editor/document-sync.ts`                 | Observe TextDocument revisions and apply minimal WorkspaceEdit ranges. The VS Code document remains the persistence authority.                      |
| `src/shared/text-edits.ts`                           | Bounded UTF-16 diff/mapping and conservative merge of independent changes.                                                                          |
| `src/webview/editor/sync.ts`                         | One operation in flight; retain later local typing until acknowledgment. Reject stale responses and recover overlapping edits separately.           |
| `src/webview/editor/markdown-codec.ts`               | Source-preserving parser/serializer. Standard GFM tables are source-carrying atoms; a real muninn-table fence remains code.                         |
| `src/webview/editor/remote-document.ts`              | Apply external content without resetting the EditorState, selection or history wholesale.                                                           |
| `src/webview/editor/document-navigation.ts`          | Task checkboxes, stable Unicode heading IDs and link dispatch.                                                                                      |
| `src/webview/editor/nodes/`                          | Table, code, image/front-matter presentation and editing.                                                                                           |
| `src/webview/editor/table-drafts.ts`                 | Retain unapplied raw table buffers across webview reload; the host preserves them separately when a panel closes.                                   |
| `src/webview/editor/renderers/mermaid-renderer.ts`   | Lazy local Mermaid import, serialized renders and trust checks before/after asynchronous work.                                                      |
| `src/shared/webview-strings.ts`                      | Typed default strings, localized automatically by the host and injected safely.                                                                     |

A webview sends an operation ID, source and base revision. The host acknowledges success, no-op or failure with its authoritative snapshot. Later local edits stay queued. Independent host changes are merged; overlapping edits open an unsaved Markdown recovery document rather than choosing a winner.

Save and Source flush table cells and wait for outstanding acknowledgments. Native Undo/Redo shortcuts dispatch to ProseMirror once; running both VS Code's WorkspaceEdit undo and ProseMirror history for a single key causes a race. Raw table source has its own explicit Apply control; unapplied buffers are retained separately.

## Fidelity contract

Untouched input must serialize byte for byte. Edited output changes only mapped source ranges, preserving surrounding markers, numbering, reference definitions, escapes, spacing and newline conventions. Source is associated with a stable document key in a WeakMap: changing root document attributes on every keystroke would recreate focused node-view inputs.

Candidate edits are reparsed and checked against the intended structure. Empty paragraphs and trailing text whitespace require a narrow equivalence rule because they are temporary editing states that Markdown cannot distinguish as AST nodes. Structural or mark mismatches still reject the edit and announce the Source escape hatch. This is a conservative implementation, not a claim that every possible rich edit on every Markdown dialect is representable.

The golden corpus and exact-edit tests are the executable contract. Add regressions for constructs touched by a change.

## Security and platform boundaries

- Markdown HTML is disabled; link handling allows local document paths, HTTP(S) and mailto. Other executable schemes are rejected.
- Remote images do not load automatically. Local images are rewritten to webview resource URIs; roots cover generated media, the document folder and explicitly referenced image directories.
- Imported images are limited to 10 MiB before reading or base64 decoding.
- CSP uses nonced module entry scripts; local Mermaid chunks load lazily. No eval, remote script or inline handler.
- Mermaid requires the effective enabled setting and workspace trust, or the explicit application-scoped untrusted-workspace override. Workspace settings cannot grant that override.
- URI-based file operations preserve remote schemes. Desktop extension hosts are supported; browser/vscode.dev support is not advertised.

## Build and validation

Node 24 is the contributor/CI toolchain. The host bundle targets Node 18 and the webview targets Chrome 114 for VS Code 1.85.2. Production output is isolated in `dist/` and `media/generated/`; clean builds, bundle budgets and archive checks prevent stale assets.

See [testing](TESTING.md), [implementation status](AUDIT_IMPLEMENTATION_2026-09.md) and the [dated audit](MUNINN_AUDIT_2026-09.md). Historical v1 requirements under `specs/markdown-preview/` do not govern this architecture.
