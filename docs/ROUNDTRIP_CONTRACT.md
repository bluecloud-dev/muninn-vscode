# Markdown source fidelity contract

Muninn edits ordinary CommonMark and GFM files through a ProseMirror custom text editor. Source preservation is an acceptance requirement: opening and closing a file without an edit must leave its bytes unchanged, and a rich edit must leave every untouched source range unchanged. This is a requirement for changes to the editor, not a claim of universal Markdown compatibility.

## Required behavior

- Preserve existing line endings, terminal newline, indentation, list markers and numbers, hard wraps, heading style, emphasis markers, escapes, entities, reference definitions, and table source outside the intended edit.
- Apply the smallest safe source edit. Reparse the candidate Markdown and compare its structure with the intended ProseMirror document. If the mapping is ambiguous or changes protected source, reject the rich edit and direct the user to Source.
- Keep raw table source as a separate draft until Apply. Save, Source, and normal panel close must flush or recover pending rich edits and table drafts.
- Treat the VS Code `TextDocument` as the persistence authority. Delay acknowledgments and external changes must not overwrite later local typing. Merge only independent edits; preserve overlapping drafts in a separate unsaved Markdown document.
- Preserve a sensible selection and undo history when applying external content. Do not run both host and ProseMirror undo for one shortcut.

## Evidence and change procedure

The executable corpus is in `tests/unit/round-trip/fixtures/`; its generated status is [ROUNDTRIP_REPORT.md](ROUNDTRIP_REPORT.md), with deviations recorded in `tests/unit/round-trip/deviations.json`. The report is a no-edit comparison. It does not establish edited-file fidelity or full CommonMark/GFM coverage.

For changes to the schema, parser tokens, serializer, table model, or `src/webview/editor/markdown-codec.ts`:

1. Read the generated report and deviations registry. Keep fixture bytes fixed.
2. Add a regression that performs an actual edit and asserts the exact resulting Markdown, including surrounding untouched source. Cover the syntax variant being changed.
3. Run `npm run test:roundtrip` and `npm run coverage`, then inspect the generated report diff.

For sync or host-provider changes, also test delayed and reordered acknowledgments, no-ops, external edits, selection/undo, Save, Source, and panel close. Run extension-host and installed-VSIX tests when behavior reaches the UI. See [TESTING.md](TESTING.md) for the commands and evidence boundaries.

Some rich edits cannot be represented safely against noncanonical source. The Source fallback is part of the contract; do not silently normalize input to make a rich action appear successful. See [manual acceptance](TESTING.md#manual-acceptance-before-release) for validation beyond the automated suites.
