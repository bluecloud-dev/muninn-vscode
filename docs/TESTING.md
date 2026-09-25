# Testing

| Layer              | Command                                                     | Evidence                                                                                                                                     |
| ------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Types/lint/format  | `npm run typecheck`, `npm run lint`, `npm run format:check` | Static gates                                                                                                                                 |
| Unit + bundled DOM | `npm run coverage`                                          | Exact source edits, 56 golden fixtures, sync races, host validation, focused table DOM, recovery and sanitized SVG                           |
| Extension host     | `npm test`                                                  | Real VS Code activation, default editor, commands, WorkspaceEdit/newline behavior                                                            |
| Packaged UI        | `npm run package && npm run test:e2e`                       | Installed production VSIX, real typing/save/undo, toolbar, table source/grid/delete, Mermaid chunks/CSP, tasks, navigation, Source and notes |
| Packaging          | `npm run package`                                           | Production minification, notices, size budgets, required/excluded archive files and pre-release metadata                                     |
| Policy             | `npm run check:no-telemetry`, `npm audit`                   | Source telemetry guard and dependency advisories                                                                                             |

## Regressions

The golden corpus lives in `tests/unit/round-trip/fixtures/`. Never change fixture bytes to make a regression pass. `deviations.json` is empty after these fixes. Generate reports with `npm run test:roundtrip`; CI compares generated reports with Git. No-op round trips alone are insufficient: `source-fidelity.test.ts` edits actual ProseMirror documents and asserts exact surrounding bytes.

`host-sync.test.ts` and `provider-behavior.test.ts` exercise delayed acknowledgments, stale/conflicting changes, no-ops, failed applies, flush, close recovery and trust/resource boundaries. `editor-behavior.test.ts` runs the actual bundled editor in JSDOM with a delayed host; it is not a replacement for native UI checks.

## Native tests

`tests/electron/editor.test.mjs` uses Playwright's Electron API and `@vscode/test-electron`. It installs the exact VSIX into temporary user/extension/shared-application directories, without an extension-development-path fallback. The harness waits for contribution registration and invokes the native Inspect Configuration command before opening fixtures; default-editor behavior is tested after activation. No injected application implementation or special production test command is used.

The former quarantined WebDriver runner lost its VS Code renderer connection on the tested current build. Its core journeys now run through Electron: toolbar/focus, formatting, code languages, table operations, Mermaid, reading and source mode. Mock-only message injection is reserved for unit regressions.

Set `VSCODE_VERSION` to `1.85.2` or `stable`. CI runs extension-host tests on both, and packaged UI on Linux (both versions), Windows and macOS (stable). UI failures block CI. Traces/screenshots are saved to `artifacts/e2e/`; temporary profiles are retained in the OS temp directory for diagnosis.

Playwright's Electron API is experimental. A runner failure must be reported as such; never quarantine it silently or replace it with a source-string assertion.

## Manual acceptance before release

- NVDA/VoiceOver reading, table labels, live-region verbosity and keyboard reachability.
- Narrow split editors, 200% zoom, light/dark/high contrast and visible focus.
- Long-document cold-open/typing latency and many retained tabs' memory.
- Actual Remote SSH/Codespaces filesystem providers and multi-root capture preferences.
- Abrupt process termination versus normal save/close recovery; backups remain VS Code's responsibility.

The CI matrix and local results are separate claims. See [implementation status](AUDIT_IMPLEMENTATION_2026-09.md) for what was executed locally.
