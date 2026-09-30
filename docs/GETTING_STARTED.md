# Getting started

## Use Muninn

Install the pre-release VSIX through VS Code's **Extensions: Install from VSIX…** command. Open a `.md` or `.markdown` file. Muninn registers as a default editor and respects existing editor preferences. If a different editor opens, use **Reopen Editor With… → Muninn Markdown Editor**; choose **Configure default editor** there when you want to change your preference.

Read and edit in one pane. Use **Headings** to move through a specification, click Markdown links to follow related files, and use VS Code Find within the webview. The compact toolbar shows common formatting; **More** reveals headings, tasks, strikethrough, code, Mermaid and file links. **Source** opens the same file in VS Code's text editor.

Run **Muninn for VS Code: New Markdown Note** to choose a filename with the native save dialog. Existing files are never silently overwritten. **Insert File Link** inserts an ordinary relative Markdown link; Explorer, search and Git remain the organization tools.

Table cells save as you type, including when Save is pressed while a cell is focused. Raw table source uses **Apply Source** or Ctrl/Cmd+Enter. Invalid/unapplied raw source is retained and recovered separately when the panel closes.

Mermaid previews are disabled in Restricted Mode unless explicitly permitted in user settings. Remote images are not fetched automatically. For unsupported Markdown or edits the fidelity guard cannot map safely, use Source.

## Contribute

Use Node 24 (see `.nvmrc`) and VS Code 1.85.2 or newer.

```bash
npm ci
npm run compile
npm run bundle
```

Open this repository in VS Code and press F5. The configured prelaunch task compiles and bundles the runtime. Open a Markdown fixture in the Extension Development Host. See [development](DEVELOPMENT.md) and [testing](TESTING.md).
