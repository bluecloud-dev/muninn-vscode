// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import { formatString, getString } from '../localization';
import {
  normalizeTableSource,
  parseMarkdownTable,
  serializeMarkdownTable,
} from './markdown-table-utilities';

export const isTableNode = (node: ProseMirrorNode): boolean => node.type.name === 'table';
export const getTableSource = (node: ProseMirrorNode): string => node.attrs.source as string;

export type TableEdit =
  | { type: 'addRow' | 'addColumn' | 'delete' }
  | { type: 'cell'; row: number; column: number; value: string }
  | { type: 'source'; source: string };

export const editTable = (
  view: EditorView,
  position: number | undefined,
  edit: TableEdit,
): 'applied' | 'unchanged' | 'rejected' => {
  if (position === undefined) return 'rejected';
  const node = view.state.doc.nodeAt(position);
  if (!node || !isTableNode(node)) return 'rejected';

  const transaction = view.state.tr;
  if (edit.type === 'delete') {
    transaction.deleteRange(position, position + node.nodeSize).scrollIntoView();
  } else {
    let source: string;
    if (edit.type === 'source') {
      source = normalizeTableSource(edit.source);
    } else {
      const table = parseMarkdownTable(getTableSource(node));
      switch (edit.type) {
        case 'addRow': {
          table.rows.push(Array.from({ length: table.headers.length }, () => ''));
          transaction.scrollIntoView();
          break;
        }
        case 'addColumn': {
          table.headers.push(
            formatString(getString('tableNewColumnHeaderTemplate'), table.headers.length + 1),
          );
          for (const row of table.rows) row.push('');
          transaction.scrollIntoView();
          break;
        }
        case 'cell': {
          const row = edit.row < 0 ? table.headers : table.rows[edit.row];
          if (!row) return 'rejected';
          if (row[edit.column] === edit.value) return 'unchanged';
          row[edit.column] = edit.value;
          break;
        }
      }
      source = serializeMarkdownTable(table);
    }
    transaction.setNodeMarkup(position, undefined, { ...node.attrs, source });
  }
  if (view.state.doc.eq(transaction.doc)) return 'unchanged';
  view.dispatch(transaction);
  return view.state.doc.eq(transaction.doc) ? 'applied' : 'rejected';
};
