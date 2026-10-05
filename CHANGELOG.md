# Changelog

All notable changes to Muninn are documented here. The release sequence starts at **1.0.0 Preview**. Earlier development version plans and legacy extension notes are preserved in [the historical changelog](docs/CHANGELOG-legacy.md).

## [Unreleased]

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
