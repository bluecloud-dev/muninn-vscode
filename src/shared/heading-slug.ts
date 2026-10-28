// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

export const headingSlug = (text: string): string =>
  text
    .toLowerCase()
    .trim()
    .replaceAll(/[^\p{L}\p{N}\p{M}_\-\s]/gu, '')
    .replaceAll(/\s/g, '-');

/**
 * Anchors are named from a heading's text as GitHub reads it: code spans count and
 * image alt text does not. ProseMirror's textContent already reads a heading this
 * way (code is a mark, an image a text-less leaf, a soft break a space), so the
 * editor uses it directly; HTML export reads markdown-it inline tokens here.
 */
export const headingTokenText = (tokens: readonly { type: string; content: string }[]): string =>
  tokens
    .map((token) => {
      if (token.type === 'text' || token.type === 'code_inline') return token.content;
      return token.type === 'softbreak' ? ' ' : '';
    })
    .join('');
