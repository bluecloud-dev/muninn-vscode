# Contributor documentation

Start with [setup](GETTING_STARTED.md#development-setup) and [development](DEVELOPMENT.md). These guides apply to every contributor, regardless of editor or AI assistant. [AGENTS.md](../AGENTS.md) is the shared entrypoint for development tools.

| Guide                                    | What it covers                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------------- |
| [Getting started](GETTING_STARTED.md)    | Installation, local setup, first run, and migration from the legacy extension       |
| [Architecture](ARCHITECTURE.md)          | Product identity, design decisions, module ownership, and data flow                 |
| [Development](DEVELOPMENT.md)            | Build commands, contribution rules, localization, licensing, and tool configuration |
| [Source fidelity](ROUNDTRIP_CONTRACT.md) | Markdown preservation requirements and edit-level regression checks                 |
| [Testing](TESTING.md)                    | Automated suites and manual UI, accessibility, platform, and visual acceptance      |
| [Troubleshooting](TROUBLESHOOTING.md)    | Editor preferences, rendering, source editing, and test-runner issues               |
| [Roadmap](ROADMAP.md)                    | Preview priorities, focused follow-ups, and product boundaries                      |
| [Release](RELEASE.md)                    | Packaging, versioning, registry authentication, and publication                     |
| [Security posture](SECURITY_POSTURE.md)  | Security controls and their verification limits                                     |

The [root README](../README.md) describes the extension for users. Report vulnerabilities through [SECURITY.md](../SECURITY.md).

The [round-trip report](ROUNDTRIP_REPORT.md) is generated from the regression corpus; regenerate it with `npm run test:roundtrip`. It does not replace tests of actual edits.

Source and tests establish implemented behavior. [GitHub issues](https://github.com/bluecloud-dev/muninn-vscode/issues) track current work, and [Actions](https://github.com/bluecloud-dev/muninn-vscode/actions) records verification for each commit. Superseded audits, AI plans, and strategy drafts remain in Git history. The [historical changelog](CHANGELOG-legacy.md) retains version history from before the 1.0.0 Preview reset.
