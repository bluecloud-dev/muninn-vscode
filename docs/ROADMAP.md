# Muninn roadmap

The checked-in package is version `1.1.0` with the Preview badge and pre-release distribution metadata. This file describes product direction; it does not claim a Marketplace release or record issue completion. [GitHub issues](https://github.com/bluecloud-dev/muninn-vscode/issues) are the live task tracker. Check each issue's current state, labels, and scope before starting work.

## Current product boundary

Muninn is a desktop VS Code custom editor for ordinary CommonMark/GFM files. Its one-pane ProseMirror surface provides reading navigation, localized formatting, editable tables with raw-source access, trust-gated Mermaid previews, image insertion, native note/file-link pickers, and a Source escape hatch. [ARCHITECTURE.md](ARCHITECTURE.md) and [ROUNDTRIP_CONTRACT.md](ROUNDTRIP_CONTRACT.md) govern implementation and fidelity. The package manifest and tests establish the current shipped command surface.

## Ongoing priorities

1. Keep source fidelity and document synchronization safe across actual edits, Save, Source, external changes, and recovery.
2. Keep accessibility and keyboard behavior testable in the installed extension, with manual screen-reader, contrast, zoom, and platform acceptance before release.
3. Keep the production VSIX, third-party notices, CI gates, release metadata, and user documentation aligned with the exact tested archive.
4. Gather voluntary preview feedback through the status-bar issue action, native issue reporter, and GitHub issue forms. Use reproducible reports to choose the next work.

## Focused follow-ups

Focus Mode and an Outline remain deferred. The current heading picker provides navigation. Revisit those features as a focused change with keyboard, narrow-editor, source-fidelity, and performance acceptance checks.

Richer table operations, additional block commands, math, GFM callouts, HTML export, browser support, and compatibility with other editors need user evidence and fresh scope before implementation. Measure long-document latency and multi-tab memory before making performance changes or expanding platform claims.

## Product constraints

No proprietary Markdown dialect, note database, cloud account layer, agent runtime, or telemetry is planned for the core editor. The ProseMirror custom editor remains the single sanctioned webview; use native VS Code surfaces around it. Initiatives expected to exceed one week need a short proposal under `docs/proposals/`, following the [development workflow](DEVELOPMENT.md#planning-and-task-status).

Past strategy drafts and AI task plans remain in Git history. Their schedules and issue references do not establish current priorities or completion.
