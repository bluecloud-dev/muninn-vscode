# Historical changelog

These notes preserve the legacy extension and earlier development version plans. Muninn's first Marketplace release was reset to 1.0.0 Preview on 2026-09-30. Use the root [CHANGELOG.md](../CHANGELOG.md) for the current release sequence; the version headings below are historical notes, not proof of registry publication.

## [Unreleased]

## [2.1.0] - 2026-09-25

### Added

- Native New Markdown Note, file-link and heading pickers; standard GFM tasks and strikethrough.
- Operation acknowledgments, independent-edit merging and unsaved recovery copies for conflicting or unapplied drafts.
- Installed-VSIX Electron UI gates, production bundle/archive budgets and generated third-party notices.

### Fixed

- Save/source/close synchronization, focused table input persistence and duplicate undo processing.
- Source churn in no-op round trips and rich edits, escaped/aligned table cells and intermediate whitespace typing.
- Restricted-workspace Mermaid enforcement, resource scopes, remote image fetches and image-size checks.
- Automatic editor preference mutation, duplicated diagram presentation, toolbar action state and cancellation.
- Production minification, stale generated assets, obsolete development dependencies and release artifact drift.

### Changed

- Numeric 2.1.0 version on the explicit pre-release channel; Node 24 contributor/CI toolchain.
- Minimum tested VS Code patch is 1.85.2. Existing desktop custom-editor architecture and AGPL policy remain.
- WebDriver quarantine replaced by blocking tests of the packaged extension on current/minimum VS Code.
- Current architecture, onboarding, test and agent guidance consolidated.

## Historical unreleased notes

### Added

- Preview flag in extension manifest for alpha distribution
- Refreshed README with current product scope and setup guidance
- Updated migration, troubleshooting, release, and roadmap docs for the v2 custom editor workflow

### Changed

- Marketplace metadata and description refresh in `package.json` / `package.nls.json`
- Architecture doc cleanup to remove stale sample content
- Marked the legacy v1 preview-first spec as superseded by the v2 custom-editor behavior in release docs

### Fixed

- Changelog/doc drift where docs referenced commands and settings not shipped in v2

### Deprecated

- None

## [2.0.0] - 2026-02-21

### Changed

- First major rebrand release under the Muninn suite identity

### Breaking

- New extension identifier: `blueclouddev.muninn-vscode`
- Hard namespace break:
  - Settings: `markdownReader.*` → `muninn.*`
  - Commands: `markdownReader.*` → `muninn.*`
  - Context keys: `markdownReader.*` → `muninn.*`
- Existing user/workspace settings and custom keybindings using `markdownReader.*` must be migrated manually

## [1.0.1] - 2025-12-28

### Fixed

- Ensure exit edit mode closes the correct markdown editor tab(s)
- Clear pending open debounces when the file handler is disposed

## [1.0.0] - 2025-12-27

### Added

- Conflict marker detection that opens files directly in edit mode
- Preview failure fallback with an Open in Editor action and Output channel logging
- Status bar announcements for edit/preview mode transitions
- Performance validation tests for preview open and mode switching targets
- Marketplace metadata improvements (keywords, license)
- Expanded README with installation, accessibility notes, and troubleshooting details
- Developer docs (architecture, testing, release, troubleshooting, getting started)
- Manual acceptance checklist for quickstart scenarios and accessibility flows

### Changed

- Debounced markdown file open handling to reduce rapid event churn
- Binary preview warning text aligned with specification wording
- Localized command titles, submenu labels, and settings descriptions

## [0.4.0] - 2025-12-27

### Added

- Configuration settings for enablement, exclusion patterns, and max file size
- Inspect Configuration command for effective settings diagnostics
- Configuration integration tests for exclusions, disabled state, and workspace overrides

### Changed

- Configuration cache reloads and context updates when settings change

## [0.3.0] - 2025-12-27

### Added

- Format context menu with heading and code submenus in edit mode
- Keyboard shortcuts for toggle edit mode, bold, and italic (edit mode only)
- Context menu and shortcut coverage in integration tests

## [0.2.0] - 2025-12-27

### Added

- Formatting toolbar actions in edit mode for bold, italic, strikethrough, lists, code, links, and headings
- Formatting commands with selection-aware placeholder handling
- URL prompt placeholder for link insertion

### Changed

- Formatting commands now require an active markdown editor
- Settings resolve per resource/workspace scope

## [0.1.0] - 2025-12-27

### Added

- Preview markdown files by default using VS Code's native renderer
- Edit mode split view with Done button and toggle command
- Large file handling with opt-in preview and per-file opt-out
- Binary markdown detection fallback with warning
- One-time welcome message with quick-start link
- Localization scaffolding for user-facing strings
