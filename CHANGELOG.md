# Changelog

All notable changes to Muninn are documented here. The release sequence starts at **1.0.0 Preview**. Earlier development version plans and legacy extension notes are preserved in [the historical changelog](docs/CHANGELOG-legacy.md).

## [Unreleased]

### Added

- Theme-aware syntax colors for supported fenced code languages, with editor font settings, a clear language header and contained scrolling for long lines. Unsupported languages and blocks over 20,000 UTF-16 units remain editable as plain text.

## [1.1.1] - 2026-10-11

### Added

- Undo, Redo and Image entry points in the editor toolbar, plus local Table choices for insertion and adding rows or columns to the selected table.

### Changed

- Open Paragraph/Heading choices beside the document, with the current style visible in the toolbar. Choosing the current style leaves the document and undo history unchanged.
- Show as many full-size controls as fit on one toolbar row. Move only the remaining actions into More, and hide More when all controls fit.
- Remove duplicate formatting entries from VS Code's editor-title menu while preserving public commands, shortcuts, Source and configuration access.
- Deprecate `muninn.toolbar.mode`; both legacy values remain valid but visibility now adapts to available pane width.
- Preserve keyboard focus, the original editing selection and raw table drafts while menus open or controls move during resizing; cancel stale menu choices after document changes.

### Release

- Version 1.1.1 retains the Marketplace Preview badge and pre-release channel, with VS Code 1.85.2 or later required.
- Manual screen-reader, OS-specific dialog and remaining platform acceptance are separate from automated results; see [testing](https://github.com/bluecloud-dev/muninn-vscode/blob/v1.1.1/docs/TESTING.md).

## [1.1.0] - 2026-10-11

### Added

- Native **Block style** and **Add to table** pickers that retain the original selection or table, reject stale results, and cancel without editing.
- Local Codicon controls with accessible names and keyboard-focus or hover help.

### Fixed

- Continue bullet, numbered, and task lists while preserving Markdown markers, indentation, line endings, and the final newline; exit empty items correctly.
- Keep Enter inside fenced code blocks nested in lists without splitting the list item.
- Preserve indentation when ordered lists cross 9/10 or 99/100, and keep new unchecked task markers outside surrounding bold, italic, or code formatting.
- Route native Undo/Redo shortcuts through the editor once and retain later typing when an earlier operation is acknowledged.
- Activate focused Markdown links with Enter once and restore focus after native heading navigation.
- Keep native and grid table edits consistent, including one-column tables, aligned or escaped cells, focused-table targeting, and rejected or detached edits.
- Retain unapplied raw table source through preview, Save, and reload; preserve it separately on Source or normal close instead of implicitly applying it.
- Explain invalid table source with associated error text and keep the draft available for correction.

### Changed

- Replace separate heading and table-add controls with compact native pickers; keep More available to expand or collapse advanced actions.
- Adapt toolbar and table controls to narrow panes, enlarged fonts, native zoom, long labels, and reduced motion, with local scrolling for wide table grids.
- Fit table cells to measured glyph widths in their rendered font when opening, editing, and resizing, avoiding excessive reserved width for short text.
- Remove obsolete editor UI plumbing, unused localization entries, and empty directory placeholders while retaining validated messages and source-fidelity guards.
- Expand the existing bundled-editor regressions and installed-VSIX journeys for keyboard editing, pickers, focus, draft retention, and responsive geometry across Linux, Windows, and macOS.

### Release

- Version 1.1.0 retains the Marketplace Preview badge and is distributed on the pre-release channel.
- Requires VS Code 1.85.2 or later; contributor tooling uses Node 24.
- Manual screen-reader, real Remote SSH/Codespaces, abrupt-shutdown recovery, and long-document performance acceptance remain outside the automated evidence; see [testing](https://github.com/bluecloud-dev/muninn-vscode/blob/v1.1.0/docs/TESTING.md).

## [1.0.1] - 2026-10-05

### Fixed

- Preserve dollar sequences literally when inserting values into localized messages.

### Changed

- Update ProseMirror, Markdown synchronization, bundled DOMPurify, and test/build dependencies.
- Upgrade CI linting to ESLint 10 and Unicorn 76 while retaining the project's existing code style.
- Refresh bundled third-party notices and check their freshness in CI.
- Extend edit regression coverage for LF/CRLF paragraph splits and untouched Markdown bytes.

### Release

- Version 1.0.1 retains the Marketplace Preview badge and is distributed on the pre-release channel.
- Requires VS Code 1.85.2 or later. Existing preview limitations remain documented in [testing](https://github.com/bluecloud-dev/muninn-vscode/blob/v1.0.1/docs/TESTING.md).

## [1.0.0] - 2026-10-03

### Added

- A reading-first rich Markdown editor with formatting controls, editable tables, GFM tasks and strikethrough.
- Native New Markdown Note, image, file-link and heading commands, with a raw Markdown escape hatch.
- A contextual **Muninn: Report issue** status-bar action and native VS Code issue reporter, plus GitHub forms for preview feedback.
- Workspace-trust-gated Mermaid diagrams, accessible editor controls and configurable reading width.
- Operation acknowledgments, independent-edit merging and unsaved recovery copies for conflicting or unapplied drafts.
- Installed-VSIX tests on Windows, macOS and Linux, production package budgets and generated third-party notices.
- GitHub Actions publishing to the VS Code Marketplace and Open VSX, with nonpublishing package and credential verification.

### Fixed

- Save/source/close synchronization, focused table input persistence and duplicate undo processing.
- Source churn in no-op round trips and rich edits, escaped/aligned table cells and intermediate whitespace typing.
- Restricted-workspace Mermaid enforcement, resource scopes, remote image fetches and image-size checks.
- Automatic editor preference mutation, duplicated diagram presentation, toolbar action state and cancellation.

### Release

- Version 1.0.0 retains the Marketplace Preview badge and is distributed on the pre-release channel.
- Requires VS Code 1.85.2 or later. Contributor and CI tooling use Node 24.
- AGPL-3.0-only, with no telemetry.

### Preview limitations

- Rich edits that cannot preserve the original Markdown safely require the Source editor.
- Manual screen-reader, real Remote SSH/Codespaces, and long-document performance acceptance remain outstanding; see [testing](docs/TESTING.md).
