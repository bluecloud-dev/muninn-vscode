// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import highlight from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import java from 'highlight.js/lib/languages/java';
import csharp from 'highlight.js/lib/languages/csharp';
import cpp from 'highlight.js/lib/languages/cpp';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import yaml from 'highlight.js/lib/languages/yaml';
import sql from 'highlight.js/lib/languages/sql';
import markdown from 'highlight.js/lib/languages/markdown';
import xml from 'highlight.js/lib/languages/xml';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { Plugin, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { getCodeFenceLanguage } from '../../shared/code-languages';

const highlighter = highlight.newInstance();
for (const [language, grammar] of Object.entries({
  javascript,
  typescript,
  python,
  go,
  rust,
  java,
  csharp,
  cpp,
  bash,
  json,
  yaml,
  sql,
  markdown,
  xml,
})) {
  highlighter.registerLanguage(language, grammar);
}

type CodeToken = { from: number; to: number; classes: string };

const highlightCode = (node: ProseMirrorNode): CodeToken[] => {
  // shortcut: blocks over 20,000 UTF-16 units stay plain; use a worker if larger blocks need highlighting.
  if (node.content.size > 20_000) return [];
  const language = getCodeFenceLanguage((node.attrs.params as string | undefined) ?? '');
  if (!highlighter.getLanguage(language)) return [];
  try {
    const template = document.createElement('template');
    template.innerHTML = highlighter.highlight(node.textContent, {
      language,
      ignoreIllegals: true,
    }).value;
    if (template.content.textContent !== node.textContent) return [];
    const tokens: CodeToken[] = [];
    let offset = 0;
    const visit = (parent: Node, classes: string): void => {
      for (const child of parent.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          const end = offset + (child.textContent?.length ?? 0);
          if (classes && end > offset) tokens.push({ from: offset, to: end, classes });
          offset = end;
        } else if (child instanceof Element) {
          visit(child, [classes, child.className].filter(Boolean).join(' '));
        }
      }
    };
    visit(template.content, '');
    return tokens;
  } catch {
    return [];
  }
};

// Ranges of the final document that the transaction's steps changed.
const changedRanges = (transaction: Transaction): [number, number][] => {
  let ranges: [number, number][] = [];
  for (const [index, map] of transaction.mapping.maps.entries()) {
    ranges = ranges.map(([from, to]) => [map.mapResult(from, -1).pos, map.mapResult(to, 1).pos]);
    const count = ranges.length;
    // ProseMirror StepMap.forEach is not Array.forEach.
    // eslint-disable-next-line unicorn/no-for-each
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => ranges.push([newStart, newEnd]));
    if (ranges.length > count) continue;
    // Attribute and mark steps keep every position, so a document diff locates them.
    const before = transaction.docs[index].content;
    const after = (transaction.docs[index + 1] ?? transaction.doc).content;
    const start = before.findDiffStart(after);
    if (start !== null) ranges.push([start, before.findDiffEnd(after)?.b ?? start]);
  }
  return ranges;
};

export const createCodeHighlighting = (): Plugin<DecorationSet> => {
  const cache = new WeakMap<ProseMirrorNode, CodeToken[]>();
  const decorateBlock = (node: ProseMirrorNode, position: number): Decoration[] => {
    let tokens = cache.get(node);
    if (!tokens) {
      tokens = highlightCode(node);
      cache.set(node, tokens);
    }
    return tokens.map((token) =>
      Decoration.inline(position + 1 + token.from, position + 1 + token.to, {
        class: token.classes,
      }),
    );
  };
  const decorate = (doc: ProseMirrorNode): DecorationSet => {
    const decorations: Decoration[] = [];
    doc.descendants((node, position) => {
      if (node.type.name !== 'code_block') return;
      decorations.push(...decorateBlock(node, position));
      return false;
    });
    return DecorationSet.create(doc, decorations);
  };
  // Map existing decorations and rebuild only the textblocks that the steps touched.
  const redecorate = (transaction: Transaction, previous: DecorationSet): DecorationSet => {
    const { doc } = transaction;
    // eslint-disable-next-line unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument -- This is ProseMirror DecorationSet.map, not Array.map.
    let decorations = previous.map(transaction.mapping, doc);
    const visited = new Set<number>();
    for (const [from, to] of changedRanges(transaction)) {
      doc.nodesBetween(from, to, (node, position) => {
        if (!node.isTextblock) return true;
        if (visited.has(position)) return false;
        visited.add(position);
        decorations = decorations.remove(
          decorations.find(position + 1, position + node.nodeSize - 1),
        );
        if (node.type.name === 'code_block')
          decorations = decorations.add(doc, decorateBlock(node, position));
        return false;
      });
    }
    return decorations;
  };
  const plugin: Plugin<DecorationSet> = new Plugin({
    state: {
      init: (_, state) => decorate(state.doc),
      apply: (transaction, previous) =>
        transaction.docChanged ? redecorate(transaction, previous) : previous,
    },
    props: { decorations: (state) => plugin.getState(state) },
  });
  return plugin;
};
