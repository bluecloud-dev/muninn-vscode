// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { EditorView } from 'prosemirror-view';
import { markdownParser, setDocumentSource } from './markdown-codec';

/** Update external content without discarding editor history or resetting selection. */
export const applyRemoteDocument = (view: EditorView, markdown: string): void => {
  const next = markdownParser.parse(markdown);
  const previous = view.state.doc;
  const start = previous.content.findDiffStart(next.content);
  let transaction = view.state.tr;
  if (start !== null) {
    const end = previous.content.findDiffEnd(next.content);
    if (end) {
      const overlap = start - Math.min(end.a, end.b);
      const oldEnd = end.a + Math.max(0, overlap);
      const newEnd = end.b + Math.max(0, overlap);
      transaction = transaction.replace(start, oldEnd, next.slice(start, newEnd));
    }
  }
  setDocumentSource(previous, markdown);
  transaction.setMeta('addToHistory', false);
  view.updateState(view.state.apply(transaction));
};
