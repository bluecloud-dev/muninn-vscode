# Standalone HTML and browser printing

Research for [#377](https://github.com/bluecloud-dev/muninn-vscode/issues/377) and its linked HTML implementation [#275](https://github.com/bluecloud-dev/muninn-vscode/issues/275), 2026-10-17. Base: `c2389f3`. The user confirmed the host-command/message, bundled-editor and installed-VSIX test seams.

## Decision before implementation

Deliver one `muninn.exportHtml` command, exposed in the existing toolbar/overflow, Command Palette and editor-title overflow. It exports a synchronized snapshot of the current TextDocument, including accepted unsaved edits, through the native destination picker. It never saves or rewrites the Markdown file. Unapplied table-source drafts remain drafts. This is the #275 implementation, not a second export pipeline.

The first PDF workflow is to open the exported HTML in a browser and choose Print, then Save as PDF. The public [VS Code Webview API](https://code.visualstudio.com/api/references/vscode-api#Webview) exposes messages/resources and HTML, but no print/PDF method. Inferring a supported desktop PDF API from Electron internals would couple the extension to implementation details. Browser [print media styles and `@page`](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Media_queries/Printing) support pagination without adding a rendering engine. Native print dialogs and PDF destinations differ by OS/browser; direct PDF is not advertised.

Use the installed markdown-it parser on the host, with CommonMark, `html: false`, `linkify: true`, table/strikethrough extensions and the existing front-matter plugin. Its [safety policy](https://github.com/markdown-it/markdown-it/blob/master/docs/safety.md) disables raw HTML and dangerous link protocols by default; generated attributes/text must still be escaped. Export never executes document content. A restrictive document CSP additionally blocks scripts and remote resources. Code remains readable plain text. Task markers remain readable text in list items.

The existing Mermaid renderer is a DOM adapter, with sanitization and a workspace-trust gate. Mermaid's [render API example](https://mermaid.js.org/config/usage.html#api-usage) requires a browser document; host rendering without that context is not a reliable path here. Preserve fenced Mermaid source and add a localized notice in the export and notification. Do not add a headless browser dependency or bypass the trust gate.

Reuse URI-aware image resolution. Embed supported local image formats up to 2 MiB each as data URIs. Larger/unreadable images use an output-relative reference when the destination uses the same provider, with a warning; cross-provider references and remote/data input sources use an alt-text fallback. No remote images are downloaded or automatically loaded. The self-contained case requires every image to be embedded; fallback assets must travel with the export.

## Scope and failure behavior

The change reaches command contributions/localization, extension registration, provider session flush, validated host-command messages, the existing toolbar, one host export module, output fixtures, unit behavior tests, packaged journeys and user/architecture docs. It does not change parser serialization or Mermaid execution policy.

The host module owns parsing, embedded assets, escaped HTML, print CSS, writing and localized progress/result/error messages. The provider owns synchronization and the source session. Reject a non-HTML destination and the original source URI. Picker cancellation writes nothing. A failed flush stops export; write failures report clearly. Relative links remain links, with provider-aware rebasing where possible. Anchor navigation uses the existing heading slug convention.

Verification will proceed one behavior at a time: an export command writes current unsaved content without saving Markdown; representative output and security checks; asset and Mermaid fallbacks; cancellation/failure; toolbar flush; installed-VSIX destination selection and browser rendering/printing. A reviewed representative HTML fixture is the golden output. Coverage does not substitute for rendered/print evidence. Windows/Linux dialogs, assistive technology and real remote providers require separate acceptance.

## Implemented and verified

The design and architecture audit consolidated toolbar/message and native-command entry points into one provider operation that enforces session readiness and flush before exporting. A shared pure heading slug keeps exported anchors coherent with editor navigation. Parser configuration remains local because source serialization and static HTML have different contracts; a generic rendering factory would add coupling without reducing an actual public boundary.

Validation on Node 24.21.0: 319 unit tests, all coverage thresholds (83.93% statements, 73.41% branches, 82.08% functions, 84.72% lines), 58 byte-identical round trips, 7 VS Code integration tests, typecheck, lint, format, telemetry check and package budgets. The installed VSIX on VS Code 1.142.0/macOS arm64 passed all 20 other journeys; after replacing obsolete toolbar action counts and waiting for native layout to settle, the affected narrow-pane and export journeys both passed. The exact tested archive SHA-256 is `986ffd9c201d976ac94a631f038b507df3663d6844b6b37cfa685e48cb43869d` (1,369,738 bytes, initial editor JavaScript 525,789 bytes).

Native evidence exercises toolbar cancellation, the palette command, a chosen destination different from the source, unsaved content, unchanged Markdown on disk, offline rendering, embedded SVG, Mermaid notice and print CSS. Chromium's PDF writer is used only by the test harness; the product uses ordinary browser printing. The four-page A4 PDF was text-checked and rendered for inspection, including final-paragraph presence and wrapped long code. Evidence: `artifacts/377-*` and `artifacts/e2e/stable/export.{html,png,pdf}`. The HTML golden fixture is reviewed test data, not a product rendering input.

The existing dependency baseline has seven low/moderate advisories; this issue adds no dependency. Minimum-version native checks are part of the final three-issue verification. Windows/Linux native dialogs, assistive technology, browser-specific print UI and real remote providers remain separate acceptance checks.
