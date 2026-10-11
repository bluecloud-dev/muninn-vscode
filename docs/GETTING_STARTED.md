# Getting started

## Use Muninn

Install the pre-release VSIX through VS Code's **Extensions: Install from VSIX…** command. Open a `.md` or `.markdown` file. Muninn registers as a default editor and respects existing editor preferences. If a different editor opens, use **Reopen Editor With… → Muninn Markdown Editor**; choose **Configure default editor** there when you want to change your preference.

Read and edit in one pane. Use **Headings** to move through a specification, follow Markdown links with a click or Tab then Enter, and use VS Code Find within the webview. The Codicon toolbar shows common formatting; **Block style** chooses Heading 1–3 or Paragraph in a native picker. **More** reveals tasks, strikethrough, code, Mermaid and file links. Hover or focus an icon for its name and shortcut. Tables have one **Add to table** picker for rows and columns. **Source** opens the same file in VS Code's text editor.

Run **Muninn for VS Code: New Markdown Note** to choose a filename with the native save dialog. Existing files are never silently overwritten. **Insert File Link** inserts an ordinary relative Markdown link; Explorer, search and Git remain the organization tools.

Table cells save as you type, including when Save is pressed while a cell is focused. Raw table source uses **Apply Source** or Ctrl/Cmd+Enter. Invalid/unapplied raw source is retained and recovered separately when the panel closes.

Mermaid previews are disabled in Restricted Mode unless explicitly permitted in user settings. Remote images are not fetched automatically. For unsupported Markdown or edits the fidelity guard cannot map safely, use Source.

## Development setup

Use Node 24 (see `.nvmrc`) and VS Code 1.85.2 or newer.

```bash
npm ci
npm run compile
npm run bundle
```

On Windows PowerShell, use `npm.cmd` if the execution policy blocks `npm.ps1`.

Open this repository in VS Code and press F5. The configured prelaunch task compiles and bundles the runtime. Open a Markdown fixture in the Extension Development Host. You can edit the source in any environment; see [tool choice](DEVELOPMENT.md#editor-and-ai-tool-choice) and [testing](TESTING.md) for the shared workflow.

## Moving from the legacy extension

The legacy extension ID was `blueclouddev.markdown-preview`; the current ID is `bluecloud-dev.muninn-vscode`. Install Muninn, verify your Markdown files open correctly, then uninstall the old extension.

Remove obsolete `markdownReader.*` settings and keybindings. Mermaid and toolbar settings use the corresponding `muninn.*` names; current settings are listed in the [README](../README.md#settings), and command IDs are declared in [package.json](../package.json). There are no legacy command aliases.

Use **Reopen Editor With… → Configure default editor** for editor preferences. Both the legacy association setting and the deprecated `muninn.editorAssociations` have no active effect. Check **Muninn for VS Code: Inspect Configuration** and **Open Raw Markdown** after migrating.
