# Testing

Use the gates below for changes to the editor. Unit coverage thresholds are enforced at 80% lines/statements and 70% branches/functions; do not lower them to make a change pass. The unit denominator includes the provider, codec, and sync. DOM adapters have bundled-editor tests and installed-VSIX coverage outside that denominator.

| Layer              | Command                                                     | Evidence                                                                                                                                     |
| ------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Types/lint/format  | `npm run typecheck`, `npm run lint`, `npm run format:check` | Static gates                                                                                                                                 |
| Unit + bundled DOM | `npm run coverage`                                          | Exact source edits, golden corpus, sync races, host validation, focused table DOM, recovery and sanitized SVG                                |
| Extension host     | `npm test`                                                  | Real VS Code activation, default editor, commands, WorkspaceEdit/newline behavior                                                            |
| Packaged UI        | `npm run package && npm run test:e2e`                       | Installed production VSIX, real typing/save/undo, toolbar, table source/grid/delete, Mermaid chunks/CSP, tasks, navigation, Source and notes |
| Packaging          | `npm run package`                                           | Production minification, notices, size budgets, required/excluded archive files and pre-release metadata                                     |
| Policy             | `npm run check:no-telemetry`, `npm audit`                   | Source telemetry guard and dependency advisories                                                                                             |

## Regressions

The golden corpus lives in `tests/unit/round-trip/fixtures/`. Never change fixture bytes to make a regression pass. Read `deviations.json` for the current exceptions. Generate reports with `npm run test:roundtrip`; CI compares generated reports with Git. No-op round trips alone are insufficient: `source-fidelity.test.ts` edits actual ProseMirror documents and asserts exact surrounding bytes. The [source fidelity contract](ROUNDTRIP_CONTRACT.md) lists the required checks for codec and sync changes.

`host-sync.test.ts` and `provider-behavior.test.ts` exercise delayed acknowledgments, stale/conflicting changes, no-ops, failed applies, false/delayed/timed-out flushes, delivery failure, close recovery and trust/resource boundaries. `editor-behavior.test.ts` runs the actual bundled editor in JSDOM with a delayed host, covering table command/grid parity, rejected and detached edits, focused-table targeting, raw-draft retention/reload and message validation/cleanup. It is not a replacement for native UI checks.

## Native tests

`tests/electron/editor.test.mjs` uses Playwright's Electron API and `@vscode/test-electron`. It installs the exact VSIX into temporary user/extension/shared-application directories, without an extension-development-path fallback. The harness waits for contribution registration and invokes the native Inspect Configuration command before opening fixtures; default-editor behavior is tested after activation. No injected application implementation or special production test command is used.

The extension-host runner and installed-VSIX runner resolve the executable declared by the downloaded macOS app bundle. Current VS Code bundles may call it `Code`; the library's older default path assumes `Electron`.

Core journeys run through Electron: list continuation/save/undo/redo/reopen, keyboard links, native block-style and table Add pickers, invalid-to-valid table source, formatting, code languages, Mermaid and Source. Mock-only message injection is reserved for unit regressions. Native external-link tests observe one DOM activation without launching a system browser; bundled-editor and provider tests separately verify the host message and allowed URI routing. A real system-browser launch remains manual acceptance.

The packaged profile enables VS Code's built-in simple file dialog for real image selection and note creation. OS-specific file dialogs remain a manual check.

The default packaged journey runs with browser networking offline. `candidate.json` records the archive hash, source commit, Node/VS Code/platform identity and measured native pane widths, target sizes, zoom and theme contrast. Geometry tests include 320–1440 CSS pixels, continuous resizing, short panes, 200% native zoom, a 24px font-token fixture, doubled names/help, reduced motion and raw-draft/caret retention. These controlled stress fixtures supplement real theme and native picker checks. Theme contrast is computed from rendered foregrounds and composited backgrounds, including a visible keyboard focus outline. They do not establish screen-reader acceptance.

CI builds one `tested-vsix` archive in the quality job and installs that download in every packaged UI matrix cell. Compare each cell's `candidate.json` hash; local archives and CI archives are separate candidates unless their hashes match.

Set `VSCODE_VERSION` to `1.85.2` or `stable`. CI runs extension-host tests on both, and packaged UI on Linux (both versions), Windows and macOS (stable). UI failures block CI. Traces/screenshots are saved to `artifacts/e2e/`; temporary profiles are retained in the OS temp directory for diagnosis.

Playwright's Electron API is experimental. A runner failure must be reported as such; never quarantine it silently or replace it with a source-string assertion.

Workspace Trust is disabled in the default integration configuration. Tests that assert Restricted Mode or trust grants need a separate restricted-workspace setup; a passing default integration run cannot establish that behavior. Run `npm run package` before `npm run test:e2e` so the installed VSIX includes the latest code. The extension runs from `dist/extension.js`; `npm run compile` alone refreshes only `out/` and the test bundle.

## Manual acceptance before release

- Install the exact VSIX under review in a clean profile. Open a Markdown file from Explorer and Quick Open; confirm the custom editor and a readable native **Muninn for VS Code** Output channel. Use **Reopen Editor With…** to choose the native text editor, then return to Muninn. The deprecated `muninn.editorAssociations` setting is inert.
- Exercise bold/italic toggles, link and code insertion, table row/column actions, and raw Source. Save and reopen; inspect exact Markdown bytes, including untouched surrounding text and terminal newline.
- Edit a table through its raw-source panel and Apply control, including the keyboard shortcut. Confirm the grid updates and the saved file reflects the edit. Close/reopen during a pending apply and confirm draft recovery or an actionable error.
- Render Mermaid in light, dark, and high-contrast themes; scroll while its preview is focused. Disable Mermaid and repeat in a restricted workspace to confirm the trust gate. Test the explicit application-scoped override separately if enabled.
- Open an empty file and use keyboard-only toolbar/table/Source flows. Check the toolbar's single Tab entry point, arrow/Home/End navigation, and focus when More hides advanced controls. Confirm cell commits keep a usable table focus position.
- Test NVDA/VoiceOver reading, a named editor surface, table and column-header labels, diagram text alternatives, and live-region verbosity. Errors must be distinguishable by text as well as color.
- Narrow split editors, 200% zoom, light/dark/high contrast and visible focus. Follow external HTTP/mail links in the configured system application; verify one activation and return to the editor.
- Review Markdown changes from Source Control, including staged/unstaged diffs and read-only Git revisions. Confirm native review controls remain usable and unchanged source does not create unrelated diffs.
- Click **Muninn: Report issue** while the custom editor is active. Confirm the native reporter selects Muninn, and the status-bar action disappears when switching to another editor.
- Long-document cold-open/typing latency and many retained tabs' memory.
- Actual Remote SSH/Codespaces filesystem providers and multi-root capture preferences.
- Abrupt process termination versus normal save/close recovery; backups remain VS Code's responsibility.

Record the VS Code version, OS, tested VSIX hash, outcome, and any remaining manual or provider limits with the release or issue. CI results and local results are separate claims; link the relevant run for the commit under review.

## Screenshots and assets

Capture the editor overview, table grid and raw-source editing, Mermaid preview, Source action, feedback action, and keyboard focus in light and dark themes. Include a high-contrast focus check. Use the actual packaged extension and remove private document content from shared captures.

Keep `assets/hero.png` aligned with the current editor and release positioning. Check that `assets/icon.png` is readable at small sizes and uses the same crow mark as `assets/muninn-rounded-logo.svg`. Replace screenshots when the depicted UI changes.
