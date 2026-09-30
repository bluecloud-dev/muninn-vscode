// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { NodeType } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';
import { TextSelection } from 'prosemirror-state';

export const getImageAltTextFromSelection = (state: EditorState): string => {
  const { from, to } = state.selection;
  return from === to ? '' : state.doc.textBetween(from, to, ' ');
};

export const createImageInsertionTransaction = (
  state: EditorState,
  imageNodeType: NodeType,
  source: string,
): Transaction => {
  const insertAt = state.selection.from;
  const imageNode = imageNodeType.create({
    src: source,
    // The Markdown parser represents an empty alt attribute as null. Match that
    // shape so source-backed edits pass the exact-AST fidelity check.
    alt: getImageAltTextFromSelection(state) || undefined,
  });
  const transaction = state.tr.replaceSelectionWith(imageNode, false);
  const nextPosition = Math.min(transaction.doc.content.size, insertAt + imageNode.nodeSize);
  return transaction
    .setSelection(TextSelection.near(transaction.doc.resolve(nextPosition), 1))
    .scrollIntoView();
};
