// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

export const headingSlug = (text: string): string =>
  text
    .toLowerCase()
    .trim()
    .replaceAll(/[^\p{L}\p{N}\p{M}_\-\s]/gu, '')
    .replaceAll(/\s/g, '-');

/**
 * Names headings in document order; a repeated slug takes the first free `-N` suffix.
 * Free suffixes only grow, so each base resumes where it stopped instead of rescanning.
 */
export const createHeadingSlugger = (): ((text: string) => string) => {
  const used = new Set<string>();
  const nextSuffix = new Map<string, number>();
  return (text) => {
    const base = headingSlug(text);
    let suffix = nextSuffix.get(base) ?? 0;
    let slug = suffix === 0 ? base : base + '-' + suffix;
    while (used.has(slug)) slug = base + '-' + ++suffix;
    nextSuffix.set(base, suffix + 1);
    used.add(slug);
    return slug;
  };
};

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
