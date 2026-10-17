// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import path from 'node:path';
import * as vscode from 'vscode';
import MarkdownIt from 'markdown-it';
import frontMatterPlugin from 'markdown-it-front-matter';
import { t } from '../utils/l10n';
import { headingSlug } from '../shared/heading-slug';
import {
  ALLOWED_IMAGE_EXTENSIONS,
  getMarkdownImagePath,
  resolveMarkdownImageUri,
} from './image-assets';

export const exportHtml = async (document: vscode.TextDocument): Promise<void> => {
  const markdown = document.getText();
  const name = path.posix.basename(document.uri.path).replace(/\.(?:md|markdown)$/i, '');
  try {
    const destination = await vscode.window.showSaveDialog({
      title: t('Export HTML'),
      saveLabel: t('Export'),
      defaultUri:
        document.uri.scheme === 'untitled'
          ? undefined
          : vscode.Uri.joinPath(document.uri, '..', `${name}.html`),
      filters: { HTML: ['html'] },
    });
    if (!destination) return;
    if (
      destination.toString() === document.uri.toString() ||
      path.posix.extname(destination.path).toLowerCase() !== '.html'
    ) {
      await vscode.window.showErrorMessage(
        t('Choose an HTML file distinct from the Markdown source.'),
      );
      return;
    }
    const notices = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: t('Exporting HTML…') },
      async () => {
        const parser = MarkdownIt('commonmark', { html: false, linkify: true })
          .enable(['table', 'strikethrough'])
          .use(frontMatterPlugin, () => {});
        const tokens = parser.parse(markdown, {});
        const headingIds = new Set<string>();
        let title = name;
        let foundTitle = false;
        for (const [index, token] of tokens.entries()) {
          if (token.type !== 'heading_open') continue;
          const text = parser.renderer.renderInlineAsText(
            tokens[index + 1].children ?? [],
            parser.options,
            {},
          );
          if (!foundTitle && token.tag === 'h1') {
            title = text;
            foundTitle = true;
          }
          const base = headingSlug(text);
          let slug = base;
          let suffix = 0;
          while (headingIds.has(slug)) slug = base + '-' + ++suffix;
          headingIds.add(slug);
          token.attrSet('id', slug);
        }
        const warnings = new Set<string>();
        if (
          tokens.some(
            (token) =>
              token.type === 'fence' &&
              token.info.trim().split(/\s+/)[0].toLowerCase() === 'mermaid',
          )
        )
          warnings.add(t('Mermaid diagrams are included as source code in this export.'));
        for (const token of tokens.flatMap((block) => block.children ?? [])) {
          if (token.type === 'link_open') {
            const href = token.attrGet('href') ?? '';
            if (href.startsWith('#') || /^(?:https?:|mailto:)/i.test(href)) continue;
            const [relative, fragment] = href.split('#');
            const target = resolveMarkdownImageUri(document.uri, relative);
            token.attrs = token.attrs?.filter(([key]) => key !== 'href') ?? [];
            if (
              target &&
              target.scheme === destination.scheme &&
              target.authority === destination.authority
            )
              token.attrSet(
                'href',
                getMarkdownImagePath(destination, target) + (fragment ? '#' + fragment : ''),
              );
            continue;
          }
          if (token.type !== 'image') continue;
          const source = token.attrGet('src') ?? '';
          const imageUri = resolveMarkdownImageUri(document.uri, source);
          const extension = imageUri
            ? path.posix.extname(imageUri.path).slice(1).toLowerCase()
            : '';
          if (imageUri && ALLOWED_IMAGE_EXTENSIONS.has(extension)) {
            try {
              const limit = 2 * 1024 * 1024;
              const metadata = await vscode.workspace.fs.stat(imageUri);
              if (metadata.size <= limit) {
                const bytes = await vscode.workspace.fs.readFile(imageUri);
                if (bytes.length > 0 && bytes.length <= limit) {
                  const mime =
                    extension === 'svg'
                      ? 'image/svg+xml'
                      : `image/${extension === 'jpg' ? 'jpeg' : extension}`;
                  token.attrSet(
                    'src',
                    `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`,
                  );
                  continue;
                }
              }
            } catch {
              /* Retain an output-relative reference when an asset cannot be embedded. */
            }
          }
          token.attrs = token.attrs?.filter(([key]) => key !== 'src') ?? [];
          if (
            imageUri &&
            ALLOWED_IMAGE_EXTENSIONS.has(extension) &&
            imageUri.scheme === destination.scheme &&
            imageUri.authority === destination.authority
          )
            token.attrSet('src', getMarkdownImagePath(destination, imageUri));
          warnings.add(
            t(
              'Some images could not be embedded. Include any referenced image files when sharing this HTML.',
            ),
          );
        }
        const renderImage = parser.renderer.rules.image!;
        parser.renderer.rules.image = (items, index, options, environment, renderer) =>
          items[index].attrGet('src')
            ? renderImage(items, index, options, environment, renderer)
            : `<span>${parser.utils.escapeHtml(t('Image: {0}', items[index].content))}</span>`;
        const html = `<!doctype html>
<html lang="${parser.utils.escapeHtml(vscode.env.language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Muninn">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${parser.utils.escapeHtml(title)}</title>
<style>
body { max-width: 74ch; margin: 2rem auto; padding: 0 1.5rem; color: #24292f; background: #fff; font: 16px/1.6 system-ui, sans-serif; overflow-wrap: anywhere; }
h1, h2, h3, h4, h5, h6 { line-height: 1.25; break-after: avoid; }
pre, code { font-family: ui-monospace, monospace; }
pre { padding: 1rem; background: #f6f8fa; overflow: auto; }
img { max-width: 100%; height: auto; }
table { border-collapse: collapse; width: 100%; table-layout: fixed; }
th, td { border: 1px solid #d0d7de; padding: .4rem .6rem; text-align: left; }
blockquote { margin-inline: 0; padding-inline-start: 1rem; border-inline-start: 3px solid #d0d7de; }
a { color: #0969da; }
@page { margin: 20mm; }
@media print {
  body { max-width: none; margin: 0; padding: 0; font-size: 11pt; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; overflow: visible; }
  tr, img, blockquote { break-inside: avoid; }
  p { orphans: 3; widows: 3; }
}
</style>
</head>
<body>
${[...warnings].map((warning) => `<p role="note">${parser.utils.escapeHtml(warning)}</p>\n`).join('')}${parser.renderer.render(tokens, parser.options, {})}</body>
</html>
`;
        await vscode.workspace.fs.writeFile(destination, Buffer.from(html, 'utf8'));
        return [...warnings];
      },
    );
    const message = [
      t(
        'Exported {0}. Open the HTML in a browser and choose Print → Save as PDF for PDF output.',
        destination.toString(true),
      ),
      ...notices,
    ].join(' ');
    if (notices.length > 0) await vscode.window.showWarningMessage(message);
    else await vscode.window.showInformationMessage(message);
  } catch (error) {
    await vscode.window.showErrorMessage(
      t('Could not export HTML: {0}', error instanceof Error ? error.message : String(error)),
    );
  }
};
