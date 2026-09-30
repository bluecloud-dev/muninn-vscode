# Migration Guide: `markdown-preview` -> `muninn-vscode`

## Scope

This guide covers migration from the legacy listing:

- Old extension ID: `blueclouddev.markdown-preview`
- New extension ID: `blueclouddev.muninn-vscode`

This is a breaking migration. There is no compatibility shim.

## What Changed

| Area                     | Old                             | New                          |
| ------------------------ | ------------------------------- | ---------------------------- |
| Marketplace extension ID | `blueclouddev.markdown-preview` | `blueclouddev.muninn-vscode` |
| Package name             | `markdown-preview`              | `muninn-vscode`              |
| Settings namespace       | `markdownReader.*`              | `muninn.*`                   |
| Command namespace        | `markdownReader.*`              | `muninn.*`                   |
| Custom editor view type  | legacy preview flow             | `muninn.markdownEditor`      |

## Required Steps

1. Install `blueclouddev.muninn-vscode`.
2. Uninstall `blueclouddev.markdown-preview` after verification.
3. Update existing user/workspace settings to the new namespace.
4. Update custom keybindings and automations to new command IDs.

## Settings Mapping (Current v2 Surface)

Only these settings are currently shipped by v2:

| Old Setting                                                      | New Setting                                                                             |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `markdownReader.editorAssociations`                              | No active replacement; use VS Code's **Reopen Editor With… → Configure default editor** |
| `markdownReader.integrations.mermaid.enabled`                    | `muninn.integrations.mermaid.enabled`                                                   |
| `markdownReader.integrations.mermaid.allowInUntrustedWorkspaces` | `muninn.integrations.mermaid.allowInUntrustedWorkspaces`                                |
| `markdownReader.toolbar.mode`                                    | `muninn.toolbar.mode`                                                                   |

`muninn.editorAssociations` remains a deprecated, inert setting solely to explain the migration. Do not enable it or write `workbench.editorAssociations` automatically. If your workspace relied on legacy settings that are not listed above, remove them or keep them as comments until equivalent features are introduced.

## Command Mapping

The v2 command surface is editor-centric. Use these command IDs:

- `muninn.openRawMarkdown`
- `muninn.toggleBold`
- `muninn.toggleItalic`
- `muninn.setHeading1`
- `muninn.setHeading2`
- `muninn.setHeading3`
- `muninn.setParagraph`
- `muninn.toggleBulletList`
- `muninn.toggleNumberedList`
- `muninn.insertLink`
- `muninn.insertMermaidBlock`
- `muninn.insertTable`
- `muninn.insertCodeBlock`
- `muninn.addTableRow`
- `muninn.addTableColumn`
- `muninn.tableActions`
- `muninn.inspectConfiguration`
- `muninn.newNote`
- `muninn.goToHeading`
- `muninn.insertFileLink`
- `muninn.insertImage`
- `muninn.toggleTask`
- `muninn.toggleStrike`
- `muninn.undo` / `muninn.redo`

## Manual Checks After Migration

1. Open a `.md` file and confirm it opens with `muninn.markdownEditor`.
2. Run `Muninn for VS Code: Inspect Configuration` from the command palette.
3. Confirm the output channel shows expected values for Mermaid and toolbar mode.
4. Run `Muninn for VS Code: Open Raw Markdown` and verify fallback works.

## Deprecation Policy

- `blueclouddev.markdown-preview` is migration-only.
- New development targets `blueclouddev.muninn-vscode`.
