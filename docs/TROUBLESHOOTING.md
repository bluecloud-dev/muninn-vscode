# Troubleshooting Guide

This guide covers common issues for the current Muninn v2 custom editor workflow.

## 1) Markdown does not open with Muninn

### Symptoms

- Opening `.md` files still shows VS Code's default editor.

### Checks

1. Ensure the extension is installed and enabled.
2. Use **Reopen Editor With… → Muninn Markdown Editor** on the tab. Choose **Configure default editor** there if you want Muninn as your default.
3. If a different editor keeps opening, inspect existing `workbench.editorAssociations` user/workspace preferences for `.md` and `.markdown`; VS Code owns those preferences. The deprecated `muninn.editorAssociations` setting has no effect.
4. Use `Muninn for VS Code: Inspect Configuration` for Muninn settings and workspace trust. It does not change the editor preference.

## 2) Mermaid is not rendering

### Symptoms

- Mermaid blocks are visible as source but no rendered preview appears.

### Checks

1. Confirm `muninn.integrations.mermaid.enabled` is `true`.
2. If the workspace is untrusted, Mermaid stays disabled by default.
3. If you choose to render diagrams in Restricted Mode, set this **in user settings**, not workspace settings:

```json
{
  "muninn.integrations.mermaid.allowInUntrustedWorkspaces": true
}
```

4. If the preview remains stale after changing trust or settings, reopen the Markdown tab and inspect the extension output.

## 3) Toolbar actions are missing

### Symptoms

- Expected buttons are hidden in the custom editor toolbar.

### Checks

1. Confirm the active editor is `muninn.markdownEditor`.
2. Check toolbar mode:
   - `muninn.toolbar.mode = "basic"` hides advanced actions.
   - `muninn.toolbar.mode = "advanced"` shows all authoring buttons.
3. Run `Inspect Configuration` to verify effective setting scope.

## 4) Table source mode does not apply edits

### Symptoms

- Edited table source does not persist.

### Checks

1. Open table source via `View Source` on a table node.
2. Apply with button or `Ctrl/Cmd+Enter`.
3. Wait for source panel to close and grid to reappear.
4. Reopen source to confirm persisted markdown.

## 5) Raw markdown fallback does not open

### Symptoms

- `Muninn for VS Code: Open Raw Markdown` appears to do nothing.

### Checks

1. Ensure a Muninn markdown editor tab is active.
2. Re-run command from command palette while the markdown tab is focused.
3. If needed, use tab menu -> `Reopen Editor With...` -> `Text Editor`.

## 6) Automated tests fail locally

### Known Environment Notes

- Integration or installed-VSIX Electron tests can fail to launch when the local VS Code runtime or display environment is unavailable. Separate runner failures from product assertions.

### What to do

1. Run core local gates first:

```bash
npm run lint
npm run typecheck
npm run coverage
```

2. Re-run the affected suite after checking the runtime and display setup:

```bash
npm test
npm run test:e2e
```

3. Inspect CI for the exact commit and packaged archive. A failing or unavailable local runner is unvalidated behavior, even when another platform passes.

## 7) Useful Debug Commands

```bash
npm run compile
npm run bundle
npm test
npm run test:e2e
```

VS Code:

- `Developer: Show Running Extensions`
- `Developer: Reload Window`
- `Muninn for VS Code: Inspect Configuration`

## Need More Help

- File an issue: https://github.com/bluecloud-dev/muninn-vscode/issues
- Include:
  - VS Code version
  - Extension version
  - OS
  - Repro steps
  - Output from `Inspect Configuration`
