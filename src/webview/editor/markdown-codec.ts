// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import MarkdownIt from 'markdown-it';
import frontMatterPlugin from 'markdown-it-front-matter';
import { Schema, type Node as ProseMirrorNode } from 'prosemirror-model';
import {
  MarkdownParser,
  MarkdownSerializer,
  type ParseSpec,
  defaultMarkdownParser,
  defaultMarkdownSerializer,
} from 'prosemirror-markdown';
import {
  applyTextChanges,
  mapTextOffset,
  textChanges,
  type TextChange,
} from '../../shared/text-edits';

const defaultSchema = defaultMarkdownParser.schema;

export const schema = new Schema({
  nodes: defaultSchema.spec.nodes
    .update('doc', {
      ...defaultSchema.spec.nodes.get('doc'),
      attrs: { source: { default: undefined } },
    })
    .addToEnd('table', { attrs: { source: {} }, group: 'block', atom: true, selectable: true })
    .addToEnd('front_matter', {
      attrs: { raw: {} },
      group: 'block',
      atom: true,
      selectable: true,
      draggable: false,
    }),
  marks: defaultSchema.spec.marks.addToEnd('strike', {
    parseDOM: [{ tag: 's' }, { tag: 'del' }],
    toDOM: () => ['s', 0],
  }),
});

// Tables carry their own source; real fences never become editable tables.
const markdownItParser = MarkdownIt('commonmark', { html: false, linkify: true })
  .enable(['table', 'strikethrough'])
  .use(frontMatterPlugin, () => {});
markdownItParser.core.ruler.after('block', 'muninn-table-source', (state) => {
  const lines = state.src.split('\n');
  for (let index = 0; index < state.tokens.length; index++) {
    const token = state.tokens[index];
    if (token.type !== 'table_open' || !token.map) continue;
    let end = index + 1;
    while (end < state.tokens.length && state.tokens[end].type !== 'table_close') end++;
    const replacement = new state.Token('muninn_table', 'table', 0);
    replacement.content = lines.slice(token.map[0], token.map[1]).join('\n');
    replacement.map = token.map;
    replacement.block = true;
    state.tokens.splice(index, end - index + 1, replacement);
  }
});

const parserTokens = {
  ...(defaultMarkdownParser as unknown as { tokens: Record<string, ParseSpec> }).tokens,
  fence: {
    block: 'code_block',
    noCloseToken: true,
    getAttrs: (token) => ({ params: token.info || '' }),
  },
  muninn_table: { node: 'table', getAttrs: (token) => ({ source: token.content }) },
  s: { mark: 'strike' },
  front_matter: {
    block: 'front_matter',
    getAttrs: (token) => ({ raw: token.markup + '\n' }),
    noCloseToken: true,
  },
} satisfies Record<string, ParseSpec>;

export const markdownParser = new MarkdownParser(schema, markdownItParser, parserTokens);
export const markdownSerializer = new MarkdownSerializer(
  {
    ...defaultMarkdownSerializer.nodes,
    table: (state, node) => {
      state.write(node.attrs.source as string);
      state.closeBlock(node);
    },
    front_matter: (state, node) => {
      const raw = typeof node.attrs.raw === 'string' ? node.attrs.raw : '';
      state.write(raw.endsWith('\n') ? raw : raw + '\n');
      state.closeBlock(node);
    },
  },
  {
    ...defaultMarkdownSerializer.marks,
    strike: { open: '~~', close: '~~', mixable: true, expelEnclosingWhitespace: true },
  },
);

const documentSources = new WeakMap<object, { source: string; document: ProseMirrorNode }>();
export const setDocumentSource = (document: ProseMirrorNode, source: string): void => {
  const key: unknown = document.attrs.source;
  if (key && typeof key === 'object') documentSources.set(key, { source, document });
};
export const parseHostMarkdown = (source: string): ProseMirrorNode => {
  const parsed = markdownParser.parse(source);
  const key = {};
  const document = schema.nodes.doc.create({ source: key }, parsed.content);
  setDocumentSource(document, source);
  return document;
};

export class SourceFidelityError extends Error {
  constructor() {
    super('This edit cannot preserve the original Markdown. Use the source editor.');
    this.name = 'SourceFidelityError';
  }
}

let cachedSource: string | undefined;
let cachedOriginal: ProseMirrorNode | undefined;
let cachedCanonical = '';
let cachedDocument: ProseMirrorNode | undefined;
let protectedRanges: { from: number; to: number }[] = [];

// Markdown cannot encode empty paragraphs or trailing text spaces as distinct AST nodes.
// Permit those intermediate typing states without weakening structural/mark validation.
const comparableContent = (node: ProseMirrorNode): unknown => {
  if (node.isText) return { text: node.text, marks: node.marks.map((mark) => mark.toJSON()) };
  const children: unknown[] = [];
  // ProseMirror Node.forEach is not Array.forEach; Node is not iterable.
  // eslint-disable-next-line unicorn/no-array-for-each
  node.forEach((child) => {
    if (child.type.name === 'paragraph' && child.content.size === 0) return;
    children.push(comparableContent(child));
  });
  if (node.isTextblock && !node.type.spec.code) {
    const last = children.at(-1) as { text?: string; marks?: unknown[] } | undefined;
    if (last?.text) {
      last.text = last.text.replace(/[ \t]+$/, '');
      if (!last.text) children.pop();
    }
  }
  return { type: node.type.name, attrs: node.type.name === 'doc' ? {} : node.attrs, children };
};

/** Preserve original syntax; validate every changed candidate against the intended AST. */
export const serializeToHostMarkdown = (document: ProseMirrorNode): string => {
  const key: unknown = document.attrs.source;
  const metadata = key && typeof key === 'object' ? documentSources.get(key) : undefined;
  const source = metadata?.source;
  if (typeof source !== 'string') return markdownSerializer.serialize(document);
  if (cachedSource !== source || cachedDocument !== metadata?.document || !cachedOriginal) {
    cachedSource = source;
    cachedDocument = metadata?.document;
    cachedOriginal = cachedDocument ?? markdownParser.parse(source);
    cachedCanonical = markdownSerializer.serialize(cachedOriginal);
    const covered = new Set<number>();
    for (const token of markdownItParser.parse(source, {})) {
      if (token.level === 0 && token.map) {
        for (let line = token.map[0]; line < token.map[1]; line++) covered.add(line);
      }
    }
    let offset = 0;
    protectedRanges = [];
    for (const [line, text] of source.split('\n').entries()) {
      // Reference definitions and other non-rendered source must survive rich edits.
      if (!covered.has(line) && text.trim())
        protectedRanges.push({ from: offset, to: offset + text.length });
      offset += text.length + 1;
    }
  }
  if (cachedOriginal.content.eq(document.content)) return source;
  const canonical = markdownSerializer.serialize(document);
  const syntaxChanges = textChanges(cachedCanonical, source);
  const intendedChanges = textChanges(cachedCanonical, canonical);
  const eol = source.includes('\r\n') ? '\r\n' : '\n';

  for (const association of [-1, 1] as const) {
    const edits: TextChange[] = [];
    let valid = true;
    for (const edit of intendedChanges) {
      const from = mapTextOffset(edit.from, syntaxChanges, association);
      const to = mapTextOffset(edit.to, syntaxChanges, edit.from === edit.to ? association : -1);
      if (from === undefined || to === undefined || from > to) {
        valid = false;
        break;
      }
      if (protectedRanges.some((range) => from < range.to && to > range.from)) {
        valid = false;
        break;
      }
      edits.push({ from, to, insert: edit.insert.replaceAll('\n', eol) });
    }
    if (!valid) continue;
    try {
      const candidate = applyTextChanges(source, edits);
      const parsed = markdownParser.parse(candidate);
      if (
        parsed.content.eq(document.content) ||
        JSON.stringify(comparableContent(parsed)) === JSON.stringify(comparableContent(document))
      )
        return candidate;
    } catch {
      // Ambiguous boundaries must not silently normalize or discard content.
    }
  }
  throw new SourceFidelityError();
};
