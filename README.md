# Muninn for VS Code

<img src="assets/icon.png" alt="Muninn for VS Code" width="96" />

A reading-first Markdown editor for specifications, documentation and notes. Read, follow links and make small changes in one pane while keeping ordinary Markdown files and useful Git diffs.

## Help shape the preview

Trying the Muninn preview? Tell us where reading or editing Markdown feels awkward, or what would make it more useful. [Report a bug](https://github.com/bluecloud-dev/muninn-vscode/issues/new?template=bug_report.yml) or [suggest an improvement](https://github.com/bluecloud-dev/muninn-vscode/issues/new?template=feature_request.yml). When a Muninn editor is active, click **Muninn: Report issue** in VS Code's status bar to open the native issue reporter. You can also use **Help: Report Issue…** or **Muninn for VS Code: Report an Issue** from the Command Palette.

Please describe the task you were doing and the result you expected. Include steps to reproduce a bug when possible; remove private content from any sample Markdown or screenshots. Muninn does not collect feedback or usage data automatically.

## Start reading

This source targets **1.1.1 Preview**, distributed on the pre-release channel. See the [changelog](CHANGELOG.md) for versioned changes. Install the pre-release extension and open a `.md` or `.markdown` file. If another editor is already your default, use **Reopen Editor With… → Muninn Markdown Editor**. Muninn respects your editor preferences.

- **Read and navigate:** comfortable line width, Unicode heading links, the native Headings picker, relative file links and VS Code Find.
- **Edit:** a toolbar with local Paragraph/Heading choices and as many controls as fit; More contains only the remaining actions; standard GFM tasks and strikethrough; editable table cells with raw-source access.
- **Capture notes:** **Muninn for VS Code: New Markdown Note** uses the native file dialog. **Insert File Link** connects existing files with ordinary relative Markdown.
- **Review diagrams:** local, lazy-loaded Mermaid previews, gated by workspace trust.
- **Read code:** fenced code uses the editor font, a language selector and theme-aware syntax colors. Long lines scroll within the block. Unknown languages and blocks over 20,000 characters remain editable as plain text.
- **Adjust the reading view:** use **Zoom out**, the percentage/**Reset zoom** button, **Zoom in** and **Fit to width** in the toolbar or More. Local zoom runs from 50% to 200% in 10-point steps, independently of VS Code zoom. Fit uses the full pane at 100% and stays responsive; Reset restores 100% and your latest configured reading width. These controls affect only the current editor view, leaving Markdown and undo history unchanged.
- **Share a document:** **Export HTML** in the toolbar/More menu, editor-title menu or Command Palette writes a standalone HTML snapshot, including accepted unsaved edits, through the native save picker. Open that file in a browser and choose **Print → Save as PDF** for PDF output. Print styles wrap code and keep headings with following content.
- **Use Source:** open the same file in VS Code's Markdown text editor whenever you need the full source syntax.

Untouched files round-trip byte for byte in the regression corpus. Edits preserve surrounding source syntax; changes that cannot be mapped safely are rejected with a Source fallback. Conflicting external edits are preserved in a separate unsaved recovery document. Save and Source wait for pending rich edits. No proprietary note syntax or database is introduced.

## Settings

| Setting                                                  | Purpose                                                                     |
| -------------------------------------------------------- | --------------------------------------------------------------------------- |
| `muninn.toolbar.mode`                                    | Deprecated; both legacy values are ignored. Visibility adapts to pane width |
| `muninn.appearance.contentWidth`                         | `comfortable`, `full`, or 40–120 characters                                 |
| `muninn.images.destination`                              | Image import folder relative to the document; default `images/`             |
| `muninn.integrations.mermaid.enabled`                    | Enable diagram previews                                                     |
| `muninn.integrations.mermaid.allowInUntrustedWorkspaces` | Explicit user-level permission to render in Restricted Mode; default false  |

The old `muninn.editorAssociations` setting is deprecated and has no effect. Configure defaults with VS Code's editor picker.

Remote images do not load automatically. Imported images are limited to 10 MiB. Markdown HTML stays disabled. The extension makes no telemetry calls. Desktop VS Code 1.85.2+ is supported; browser/vscode.dev support is not advertised.

HTML exports embed local PNG, JPEG, GIF, WebP and SVG images up to 2 MiB each. Larger or unreadable images retain relative references when possible, with a warning; share those files alongside the HTML. Remote/data image sources and unavailable cross-provider assets become alt text. Mermaid is exported as readable source with a notice; code blocks and task markers remain plain text. No scripts or remote resources are included. Unapplied table-source drafts are not exported. Export does not save or rewrite the Markdown file. Direct PDF export is not provided; browser/OS print dialogs and PDF destinations vary. See the [export decision](docs/proposals/export.md), which implements the HTML workflow tracked in [#275](https://github.com/bluecloud-dev/muninn-vscode/issues/275).

## Development

Use Node 24 and your preferred editor or AI development environment. The [contributor documentation](docs/README.md) contains the shared [setup](docs/GETTING_STARTED.md#development-setup), [architecture](docs/ARCHITECTURE.md), [development rules](docs/DEVELOPMENT.md), and [testing guide](docs/TESTING.md).

```bash
npm ci
npm run compile
npm run bundle
npm run coverage
npm test
npm run package
npm run test:e2e
```

F5 runs the checked-in compile/bundle task. Packaging produces a minified pre-release VSIX and third-party notices; the UI suite tests that exact archive.

[Security policy](SECURITY.md) · [Security posture](docs/SECURITY_POSTURE.md)

## License

GNU Affero General Public License v3.0 (AGPL-3.0-only). See [LICENSE](LICENSE).

### License — plain language

Using Muninn to edit files imposes nothing on those files, your employer's code, or any repository you open.
Your markdown, and anything you write with Muninn, is yours.
The AGPL governs copying, distributing, or modifying Muninn itself.
If you distribute a modified Muninn, share it under the same license and keep required notices.
If you serve a modified Muninn through hosted VS Code environments such as code-server, Codespaces, or Gitpod, offer users the source for that modified Muninn.
Redistributing unmodified Muninn keeps the [LICENSE](LICENSE) and notices with the extension.
Common-understanding summary, not legal advice; the [LICENSE](LICENSE) text governs.
