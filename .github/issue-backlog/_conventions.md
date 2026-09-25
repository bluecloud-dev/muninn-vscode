
---

### Repo conventions for implementers (read before coding)

- TypeScript strict mode; no `any` without justification. Gates: `npm run typecheck`, `npm run lint` (ESLint + unicorn), `npm run format:check` (Prettier).
- **Every user-facing string is localized.** Webview strings: follow the pattern of an existing key (e.g. `statusInsertedTable`) through `src/shared/webview-strings.ts` (type + `DEFAULT_WEBVIEW_STRINGS`), the host injection in `src/custom-editor/muninn-custom-editor-provider.ts`, and `l10n/bundle.l10n.json`. Host-side command/config strings: `package.nls.json`.
- **No telemetry of any kind** — `npm run check:no-telemetry` must pass. Webview stays CSP-safe: no inline event handlers, no `eval`, no remote resources; scripts are nonced.
- Tests: unit in `tests/unit` (`npm run coverage` — enforced thresholds: 80% lines/statements, 70% branches/functions), VS Code integration via `npm test`, installed-VSIX Electron E2E in `tests/electron` via `npm run package && npm run test:e2e` for UI-behavior changes.
- Architecture rules: native VS Code APIs over custom UI where they exist; the ProseMirror webview is the one sanctioned webview. Markdown round-trip fidelity is sacred — never introduce serialization churn.
- Line references in this issue are against commit `dfafdfe`. Re-locate code by symbol name if lines have drifted.
