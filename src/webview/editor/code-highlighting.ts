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
import { Plugin } from 'prosemirror-state';
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

export const createCodeHighlighting = (): Plugin<DecorationSet> => {
  const cache = new WeakMap<ProseMirrorNode, CodeToken[]>();
  const decorate = (doc: ProseMirrorNode): DecorationSet => {
    const decorations: Decoration[] = [];
    doc.descendants((node, position) => {
      if (node.type.name !== 'code_block') return;
      let tokens = cache.get(node);
      if (!tokens) {
        tokens = highlightCode(node);
        cache.set(node, tokens);
      }
      for (const token of tokens) {
        decorations.push(
          Decoration.inline(position + 1 + token.from, position + 1 + token.to, {
            class: token.classes,
          }),
        );
      }
      return false;
    });
    return DecorationSet.create(doc, decorations);
  };
  const plugin: Plugin<DecorationSet> = new Plugin({
    state: {
      init: (_, state) => decorate(state.doc),
      apply: (transaction, previous) =>
        transaction.docChanged ? decorate(transaction.doc) : previous,
    },
    props: { decorations: (state) => plugin.getState(state) },
  });
  return plugin;
};
