# Development

Use Node 24 and npm with the committed lockfile. The extension runtime targets VS Code 1.85.2+; the development Node requirement does not imply that the extension host needs Node 24.

Start with the [setup guide](GETTING_STARTED.md#development-setup) and [architecture](ARCHITECTURE.md). This workflow applies to all contributors.

```bash
npm ci
npm run compile
npm run bundle
```

Press F5 using the checked-in launch configuration. Its compound prelaunch task builds both TypeScript tests and the bundled runtime. The extension runs `dist/extension.js`; compiling `out/` alone does not refresh it. Webview assets live in `media/generated/`.

Use **Developer: Open Webview Developer Tools** for the custom editor. Rebuild/reopen the development host after changes, or run `node esbuild.mjs --watch` for bundling while developing. Debug bundles include source maps; production bundles do not.

## Editor and AI tool choice

Use any editor or AI assistant. The npm scripts are the reproducible build and test interface; VS Code is needed to run and debug the extension itself. The checked-in launch configuration is optional convenience.

`AGENTS.md` points tools to the same guides used by human contributors. No assistant account, plugin, MCP server, or skill collection is required. If your tool needs its own instruction file, make it a local pointer to `AGENTS.md` and `docs/` rather than another copy of the project rules.

Keep personal prompts, plans, credentials, and tool configuration out of commits. Common assistant directories are ignored; use `.git/info/exclude` for other local files. Add durable project knowledge to the relevant guide in `docs/`, and keep task status in GitHub issues.

## Gates

```bash
npm run typecheck
npm run lint
npm run format:check
npm run coverage
npm run test:roundtrip
npm test
npm run package
npm run test:e2e
npm run check:no-telemetry
npm audit
```

Set `VSCODE_VERSION=1.85.2` or `stable` in your shell for integration and UI tests. On PowerShell, use `$env:VSCODE_VERSION='1.85.2'`. Linux UI runs require a display; CI uses `xvfb-run -a`.

The Electron UI suite installs the existing VSIX into an isolated profile, so always package after changing runtime code. It does not rebuild before testing. CI tests a single uploaded archive on multiple platforms. Package inspection writes byte counts and SHA-256 to ignored `artifacts/build/package-report.json`.

## Editing rules

Preserve source bytes outside an intentional Markdown edit. Read [ROUNDTRIP_CONTRACT.md](ROUNDTRIP_CONTRACT.md) before schema, codec, table, or sync work. Include an actual edit with exact output assertions; sync changes also need delayed acknowledgments, external edits, selection/undo, Save, Source, and recovery coverage. The generated corpus report alone does not prove editing fidelity.

Keep TypeScript strict and justify any `any`. User-facing host strings use `vscode.l10n.t`; command and setting contribution strings use `package.nls.json`. Webview strings need a key and default in `src/shared/webview-strings.ts` plus an entry in `l10n/bundle.l10n.json`. The provider automatically localizes and injects defaults. Do not add a second mapping.

Keep the host/webview protocol typed and validate messages at the boundary. Own and dispose listeners and resources explicitly. Keep public command and setting IDs stable and namespaced under `muninn.*`; keep user-facing errors actionable without exposing stack traces. Prefer standard and VS Code APIs over new wrappers or dependencies when they meet the same need.

Keep the custom editor CSP-safe: nonced local scripts, no inline handlers, remote resources, or `eval`. Host-side protocol guards validate every webview message. Mermaid rendering stays behind effective workspace trust and the explicit application-scoped permission for Restricted Mode. Markdown HTML remains disabled. No telemetry of any kind; run `npm run check:no-telemetry`.

The ProseMirror custom editor is the only sanctioned webview. Use native VS Code pickers, inputs, notifications, symbols, and surrounding navigation. Do not add proprietary Markdown syntax. Production logging uses VS Code's `LogOutputChannel`; do not use `console.log` in extension or webview code.

Every new source file needs the two-line AGPL-3.0-only SPDX header. Keep `THIRD_PARTY_NOTICES.md` aligned with the production bundle metafile. Sign commits with `git commit -s` for DCO. Preserve unrelated local changes, and use an isolated worktree for broad cleanup in a dirty checkout.

## Planning and task status

The [roadmap](ROADMAP.md) describes current direction. GitHub issues are the live task tracker; confirm the issue's current state and scope before starting. `ai-ready` identifies delegable work; `needs-human` marks steps that require the maintainer's account, judgment, or voice. An issue with both labels can contain separate agent and human steps. Old issue numbers, labels, line references, and dated plans are not a completion ledger.

For a feature expected to take more than one week, write a concise proposal in `docs/proposals/<feature>.md` before coding. Describe the problem, scope, tradeoffs, and acceptance checks; keep its status explicit and link it from the live issue.

Coverage includes the provider, sync and codec. UI adapters are exercised by the bundled JSDOM tests and native Electron tests, outside the coverage denominator. A passing mock test does not establish native UI behavior. See [testing](TESTING.md) for remaining manual checks.
