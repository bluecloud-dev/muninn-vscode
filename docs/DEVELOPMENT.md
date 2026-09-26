# Development

Use Node 24 and npm with the committed lockfile. The extension runtime targets VS Code 1.85.2+; the development Node requirement does not imply that the extension host needs Node 24.

```bash
npm ci
npm run compile
npm run bundle
```

Press F5 using the checked-in launch configuration. Its compound prelaunch task builds both TypeScript tests and the bundled runtime. The extension runs `dist/extension.js`; compiling `out/` alone does not refresh it. Webview assets live in `media/generated/`.

Use **Developer: Open Webview Developer Tools** for the custom editor. Rebuild/reopen the development host after changes, or run `node esbuild.mjs --watch` for bundling while developing. Debug bundles include source maps; production bundles do not.

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

Read [AGENTS.md](../AGENTS.md). Preserve source bytes outside an intentional edit. Add actual edit, delayed-host and native UI regressions for corresponding changes. Keep new strings localized, SPDX source headers intact and telemetry absent. Use native VS Code APIs for surrounding workflows.

No agent-specific credential, MCP server or skill is required to build this repository. Context7 can supply current library docs when available; repository scripts remain the reproducible source of checks. Do not add a generic skill collection or duplicate the instructions.

Coverage includes the provider, sync and codec. UI adapters are exercised by the bundled JSDOM tests and native Electron tests, outside the coverage denominator. A passing mock test does not establish native UI behavior. See [testing](TESTING.md) for remaining manual checks.
