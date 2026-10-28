// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { NodeType } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';
import { NodeSelection, TextSelection } from 'prosemirror-state';

export const getImageAltTextFromSelection = (state: EditorState): string => {
  const { from, to } = state.selection;
  if (state.selection instanceof NodeSelection) return '';
  return from === to ? '' : state.doc.textBetween(from, to, ' ');
};

export const createImageInsertionTransaction = (
  state: EditorState,
  imageNodeType: NodeType,
  source: string,
): Transaction => {
  const imageNode = imageNodeType.create({
    src: source,
    // The Markdown parser represents an empty alt attribute as null. Match that
    // shape so source-backed edits pass the exact-AST fidelity check.
    alt: getImageAltTextFromSelection(state) || undefined,
  });
  const { selection } = state;
  // A selected table, code block or image is a target, not text to overwrite:
  // add the image after it, in its own paragraph when the selection is a block.
  if (selection instanceof NodeSelection) {
    const block = selection.node.isBlock;
    const node = block ? state.schema.nodes.paragraph.create(undefined, imageNode) : imageNode;
    const transaction = state.tr.insert(selection.to, node);
    const caret = selection.to + (block ? 1 : 0) + imageNode.nodeSize;
    return transaction
      .setSelection(TextSelection.near(transaction.doc.resolve(caret), 1))
      .scrollIntoView();
  }
  const insertAt = selection.from;
  const transaction = state.tr.replaceSelectionWith(imageNode, false);
  const nextPosition = Math.min(transaction.doc.content.size, insertAt + imageNode.nodeSize);
  return transaction
    .setSelection(TextSelection.near(transaction.doc.resolve(nextPosition), 1))
    .scrollIntoView();
};
