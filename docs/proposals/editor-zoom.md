# Editor-local zoom and fit-to-width

Research for [#378](https://github.com/bluecloud-dev/muninn-vscode/issues/378), 2026-10-17. Builds on #376 and #377. The user confirmed the bundled-editor, host-message and installed-VSIX behavior seams.

## Decision before implementation

At 100%, retain `muninn.appearance.contentWidth`: comfortable is 70ch, full removes the maximum, and numeric settings remain a character measure. The document already shrinks to the pane with gutters. Fit to width explicitly resets local zoom to 100% and temporarily removes the reading-width maximum; it keeps adapting when the pane resizes. Zoom in/out adjust by ten percentage points, bounded to 50–200%, retaining the active width mode. Reset restores 100%, exits fit mode and reapplies the latest configured reading measure, including a setting changed while fitting. This state belongs to the current editor view; reopening starts at 100% with the configured measure.

Use numeric CSS `zoom` on the document container, inside the scrolling shell and outside the toolbar. Unlike a transform, [CSS zoom participates in layout](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/zoom); [MDN compatibility data](https://github.com/mdn/browser-compat-data/blob/main/css/properties/zoom.json) records support since Chrome 1. Use numeric 1 for reset and no animation. Browser support alone does not prove ProseMirror coordinate behavior, so installed tests must cover editing and selection on the minimum supported VS Code as well as stable. Global workbench zoom continues to scale the whole application independently.

Add Zoom out, a visible percentage/Reset button, Zoom in and Fit to width to the existing adaptive toolbar. Keep the percentage among the first actions retained at narrow widths; other view actions use the existing overflow and roving keyboard focus. Localized help names explain reset and the current percentage; Fit exposes its pressed state. No extra settings, persistence, protocol messages or global key bindings are needed.

## Scope and risk

The change reaches toolbar bootstrap, local command dispatch and state, content-width policy, localized strings, CSS, behavior/native tests and user/architecture docs. It must preserve source byte fidelity, table drafts, selection, undo history and save behavior. The [ProseMirror view contract](https://prosemirror.net/docs/ref/#view.EditorView) maintains document selection separately from DOM rendering; zoom is presentation state and must not dispatch document changes or request host saves. Existing scroll containers for code and tables, and responsive images, remain the containment boundaries.

TDD will cover one behavior at a time: percentage and bounded local zoom; fit/reset with all width settings and live setting changes; selection, drafts and undo/save neutrality; adaptive control reachability. Installed VSIX evidence will check narrow/wide and split panes, local plus application zoom, representative prose/code/tables/images, real editing and reset. Audit the resulting state ownership and toolbar integration before completing the issue. No generic viewport framework or global toolbar rewrite is in scope.

## Findings during implementation

VS Code retains the legacy Chromium CSS-zoom rectangle behavior in the tested build: at 50%, descendant `getBoundingClientRect()` values are expressed before the local scale. The rendered screenshot and scroll-width checks confirm containment. [VS Code issue 233692](https://github.com/microsoft/vscode/issues/233692) tracks adoption of Chromium 128's new coordinate behavior. The native geometry test normalizes descendant horizontal coordinates using the unzoomed shell and the document container, while still checking scroll overflow and actual mouse/keyboard editing. No browser feature flags are changed to make tests pass.

The design/architecture audit found width precedence repeated across initialization, live settings and toolbar updates. `createEditorViewport` now owns configured width, fit state, zoom bounds and CSS application behind two operations. Toolbar labels and focus remain in the existing UI layer; document transactions and host synchronization are unchanged. The old shallow width-helper tests are replaced by the viewport interface test; bundled behavior tests continue unchanged across the refactor.

A behavior test caught an open Reset tooltip retaining the previous percentage. The existing icon-button helper already synchronized visible help, so its label/help operation is shared with text buttons and block-style help. No new tooltip system or toolbar framework was introduced.

Native acceptance also caught table-button help overlapping its anchor at local zoom on the minimum VS Code. The existing tooltip controller now normalizes document coordinates before positioning help outside the scaled content. Both native geometry and pointer calibration use the shell's client width, excluding its scrollbar. Tooltip text uses its intrinsic width within the existing viewport limit, and the existing resize observer repositions help when its label changes. Regression assertions check that visible help remains adjacent to its control and inside the pane.

The native split test uses distinct Markdown documents, respecting the existing single-view-per-document registration on the supported minimum. It verifies each view has independent zoom and restores the editor-group layout afterwards. Application-zoom activation is exercised with native Enter/toolbar-menu navigation; selected text and table-source activation also use real pointer input. The harness normalizes the legacy geometry before hit-testing mouse coordinates.

## Final verification

The combined [#376 highlighting](code-block-highlighting.md), [#377 export](export.md) and #378 viewport candidate passed under Node 24.21.0 on macOS arm64. There are 322 passing unit tests, 58 byte-identical roundtrips with zero deviations, and passing lint, typecheck, formatting, no-telemetry and package-budget checks. Coverage is 83.90% statements, 73.38% branches, 82.05% functions and 84.68% lines, above every configured threshold. Bundled editor behavior and native rendering are tested separately from the host coverage metric.

| VS Code                    | Extension-host integration | Installed VSIX |
| -------------------------- | -------------------------- | -------------- |
| 1.85.2 (supported minimum) | 7 passing                  | 22 passing     |
| 1.142.0 (current stable)   | 7 passing                  | 22 passing     |

The installed suites use the same final archive, SHA-256 `c77eb9e6a0b556e3792638dc89c5bb5afd3a54ebf03cc3753432893b497cf865`, 1,370,712 bytes. Initial editor JavaScript is 527,629 bytes, below the 600 KiB limit. Native evidence includes offline rendering/export, four themes, Restricted Mode, 320–1440px panes, zoom extremes, split-view independence, live tooltips, real selection/formatting/undo/redo and saved source comparisons. The minimum build checks exported HTML and print CSS; current Chromium also generates the four-page PDF. The browser Print → Save as PDF workflow remains the product's PDF route.

Logs: `artifacts/378-e2e-{minimum,stable}-complete.log`, `artifacts/378-integration-{minimum,stable}-complete.log`, `artifacts/378-verification-complete-exits.json`, `artifacts/378-coverage-accepted.log`, `artifacts/378-roundtrip-tooltip.log` and `artifacts/378-package-complete.log`. Raw native metadata records the preceding commit because the candidate was built from the uncommitted #378 changes; `artifacts/latest-issues-verification.json` ties the final commit to the tested archive and verifies its packaged payload. The primary-session architecture review is located by `artifacts/378-architecture-report-path.txt`.

Earlier native attempts exposed guest-frame focus and coordinate assumptions, obsolete toolbar counts, and the tooltip defects described above. One earlier run also recorded a transient selected-text mismatch (`artifacts/378-e2e-minimum-accepted.log`); instrumented reruns did not reproduce it. Failed logs are retained, and both final suites pass the exact source assertions after correcting pointer calibration and routing keyboard activation through the workbench.

Limits: these are primary-session audits and macOS checks, not independent-agent, Windows/Linux, OS clipboard, IME, screen-reader or every-browser print-dialog acceptance. Remote provider behavior has unit coverage but was not exercised against a live remote provider. The dependency audit still reports the seven baseline advisories (five moderate, two low; none high or critical). No release or merge is part of this verification.
