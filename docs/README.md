# Documentation

This folder is the current source of contributor guidance for **Muninn for VS Code**, for humans and AI agents alike. The root `AGENTS.md` and `CONTRIBUTING.md` only route readers here. Code and tests remain the evidence for implemented behavior; live GitHub issues are the task-status tracker. Dated audits, strategy snapshots, and decision history are labeled as such and must not be read as current instructions.

> **Note:** For end-user guidance, installation instructions, and feature overview, see the [root README](../README.md).

## Documentation Index

| Document                                                                       | Description                                                  | Audience                 |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------ |
| [GETTING_STARTED.md](GETTING_STARTED.md)                                       | New contributor onboarding, first run, and common commands   | Newcomers                |
| [ARCHITECTURE.md](ARCHITECTURE.md)                                             | System design, module overview, and data flow diagrams       | Developers, Contributors |
| [DEVELOPMENT.md](DEVELOPMENT.md)                                               | Contributor rules, setup, workflow, and planning conventions | All Contributors         |
| [ROUNDTRIP_CONTRACT.md](ROUNDTRIP_CONTRACT.md)                                 | Source fidelity requirements and edit-level verification     | Editor Contributors      |
| [TESTING.md](TESTING.md)                                                       | Test structure, running tests, and writing new tests         | Developers, QA           |
| [RELEASE.md](RELEASE.md)                                                       | Release process checklist and versioning guidelines          | Maintainers              |
| [SECURITY_POSTURE.md](SECURITY_POSTURE.md)                                     | Code-cited security posture and maintainer review checklist  | Maintainers, Security    |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md)                                       | Common issues and solutions for developers                   | All                      |
| [ROADMAP.md](ROADMAP.md)                                                       | Current product direction; issues carry live task status     | All                      |
| [BRAND_NAMING_CONTRACT.md](BRAND_NAMING_CONTRACT.md)                           | Canonical naming, IDs, and logo rules for the Muninn suite   | Maintainers, Product     |
| [MIGRATION_FROM_MARKDOWN_PREVIEW.md](MIGRATION_FROM_MARKDOWN_PREVIEW.md)       | Hard-break migration from legacy extension ID and namespaces | Maintainers, Users       |
| [STRATEGIC_ROADMAP.md](STRATEGIC_ROADMAP.md)                                   | Historical 2026 planning snapshot                            | Maintainers, Product     |
| [COMPETITIVE_BRIEF.md](COMPETITIVE_BRIEF.md)                                   | Historical May 2026 competitive snapshot                     | Maintainers, Product     |
| [MARKET_POSITION_2026-06.md](MARKET_POSITION_2026-06.md)                       | Historical June 2026 market position and AGPL rationale      | Maintainers, Product     |
| [ROUNDTRIP_REPORT.md](ROUNDTRIP_REPORT.md)                                     | Generated round-trip conformance report (do not hand-edit)   | All                      |
| [design/ACCESSIBILITY_AUDIT_2026-06.md](design/ACCESSIBILITY_AUDIT_2026-06.md) | WCAG 2.1 AA audit findings driving the a11y issues           | Developers               |
| [design/DESIGN_CRITIQUE_2026-06.md](design/DESIGN_CRITIQUE_2026-06.md)         | UX critique findings driving the polish issues               | Developers, Design       |
| [decisions/](decisions/)                                                       | ADR-style decision records (D-001…D-006)                     | All                      |

## Quick Links

- **Current architecture and rules:** [Architecture](ARCHITECTURE.md), [Development](DEVELOPMENT.md), [Source fidelity](ROUNDTRIP_CONTRACT.md), and [Testing](TESTING.md)
- **Dated evidence:** [September 2026 audit](MUNINN_AUDIT_2026-09.md) and [implementation record](AUDIT_IMPLEMENTATION_2026-09.md) describe earlier snapshots; verify current source before reusing their conclusions
- **Getting Started:** Begin with [GETTING_STARTED.md](GETTING_STARTED.md) for a guided first run
- **Environment Setup:** Use [DEVELOPMENT.md](DEVELOPMENT.md) for day-to-day workflow
- **Understanding the Code:** Read [ARCHITECTURE.md](ARCHITECTURE.md) for the big picture
- **Security Posture:** Review [SECURITY_POSTURE.md](SECURITY_POSTURE.md) before publishing security claims
- **Running Tests:** See [TESTING.md](TESTING.md) for test commands and structure
- **Releasing:** Follow [RELEASE.md](RELEASE.md) when preparing a release

## Project Structure Overview

```
muninn-vscode/
├── src/                    # Extension source code
│   ├── extension.ts        # Extension host activation + command wiring
│   ├── custom-editor/      # CustomTextEditorProvider host + protocol + sync
│   ├── integrations/       # Integration adapters (Mermaid trust/config gate)
│   ├── services/           # Resource-scoped configuration reads
│   ├── types/              # TypeScript type definitions
│   ├── utils/              # Utility functions (localization)
│   └── webview/editor/     # Webview editor application (ProseMirror + Mermaid/table UI)
├── l10n/                   # Localization bundles
├── tests/                  # Test suites
│   ├── unit/               # Unit tests (mocked VS Code APIs)
│   ├── integration-cli/    # Integration tests via @vscode/test-cli
│   ├── electron/           # Installed-VSIX Electron UI tests
│   └── fixtures/           # Test data files
├── docs/                   # Current contributor guidance and dated records
├── .github/workflows/      # CI, security, and release gates
└── assets/                 # Images and icons
```

## Key Concepts

### Custom Editor Default

- Markdown files open in `muninn.markdownEditor` by default.
- The webview editor is the primary editing surface.
- `muninn.openRawMarkdown` is the explicit escape hatch to VS Code's default text editor.

### Host/Webview Split

- Extension host handles activation, command registration, trust-aware config, and `TextDocument` synchronization.
- Webview app handles rich editing UI, formatting actions, and inline Mermaid/table rendering.

### Event-Driven Design

The extension responds to VS Code events:

1. `onCustomEditor:muninn.markdownEditor` - Activates custom editor provider
2. `workspace.onDidChangeTextDocument` - Propagates document updates to webview sessions
3. `onDidChangeConfiguration` - Notifies open editor sessions to read current settings

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) in the project root for contribution guidelines.

## Need Help?

- **Bugs:** [Open an issue](https://github.com/bluecloud-dev/muninn-vscode/issues)
- **Questions:** Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md) first
- **Feature Requests:** [Open a feature request](https://github.com/bluecloud-dev/muninn-vscode/issues/new)
