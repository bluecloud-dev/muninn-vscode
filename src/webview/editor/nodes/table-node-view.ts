// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { readTableDraft, writeTableDraft } from '../table-drafts';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorView, NodeView, NodeViewConstructor } from 'prosemirror-view';
import { formatErrorAnnouncement, type Announce } from '../announcements';
import { formatString, getString } from '../localization';
import {
  normalizeTableSource,
  parseMarkdownTable,
  serializeMarkdownTable,
} from '../tables/markdown-table-utilities';
import type { MarkdownTable } from '../tables/markdown-table-utilities';

export {
  DEFAULT_TABLE_SOURCE,
  normalizeTableSource,
  parseMarkdownTable,
  serializeMarkdownTable,
  TABLE_FENCE_LANGUAGE,
} from '../tables/markdown-table-utilities';
export type { MarkdownTable } from '../tables/markdown-table-utilities';

export const isTableNode = (node: ProseMirrorNode): boolean => node.type.name === 'table';
export const getTableSource = (node: ProseMirrorNode): string => node.attrs.source as string;

type TableNodeViewOptions = {
  announce: Announce;
};

type TableCellCoordinates = {
  row: number;
  col: number;
};

type TableCellTextSelection = Pick<HTMLInputElement, 'selectionEnd' | 'selectionStart' | 'value'>;

export const shouldDeferTableCellKeyboardNavigation = (
  event: Pick<KeyboardEvent, 'isComposing'>,
): boolean => event.isComposing;

export const shouldNavigateTableCellHorizontally = (
  input: TableCellTextSelection,
  key: string,
): boolean => {
  const selectionStart = input.selectionStart;
  const selectionEnd = input.selectionEnd;
  if (typeof selectionStart !== 'number' || typeof selectionEnd !== 'number') {
    return false;
  }
  if (selectionStart !== selectionEnd) {
    return false;
  }
  if (key === 'ArrowLeft') {
    return selectionStart === 0;
  }
  if (key === 'ArrowRight') {
    return selectionStart === input.value.length;
  }
  return false;
};

const createSourceShortcutHintId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `muninn-table-source-hint-${crypto.randomUUID()}`;
  }
  return `muninn-table-source-hint-${Math.random().toString(36).slice(2)}`;
};

export const getTableGridAriaLabel = (tableIndex: number, table: MarkdownTable): string =>
  formatString(
    getString('tableGridAriaLabelTemplate'),
    tableIndex,
    table.headers.length,
    table.rows.length,
  );

export const formatTableSourceFeedback = (kind: 'success' | 'error', message: string): string =>
  kind === 'success'
    ? formatString(getString('tableSourceFeedbackAppliedTemplate'), message)
    : formatErrorAnnouncement(message);

export const getTableNodeDocumentIndex = (
  documentNode: ProseMirrorNode,
  tablePosition: number,
): number => {
  let tableIndex = 0;
  let matchedIndex: number | undefined;

  documentNode.descendants((node, position) => {
    if (!isTableNode(node)) {
      return true;
    }

    tableIndex += 1;
    if (position !== tablePosition) {
      return true;
    }

    matchedIndex = tableIndex;
    return false;
  });

  return matchedIndex ?? 1;
};

class TableNodeView implements NodeView {
  private updatingCell = false;
  private readonly flushDraft = (): void => {
    if (this.sourceDirty) this.applySourceFromTextarea();
  };
  readonly dom: HTMLDivElement;

  private readonly header = document.createElement('div');
  private readonly actions = document.createElement('div');
  private readonly gridContainer = document.createElement('div');
  private readonly sourceContainer = document.createElement('div');
  private readonly sourceTextarea = document.createElement('textarea');
  private readonly applySourceButton = document.createElement('button');
  private readonly sourceShortcutHint = document.createElement('p');
  private readonly sourceFeedback = document.createElement('div');
  private readonly sourceToggleButton = document.createElement('button');
  private readonly addRowButton = document.createElement('button');
  private readonly addColumnButton = document.createElement('button');
  private readonly deleteTableButton = document.createElement('button');
  private readonly sourceShortcutHintId = createSourceShortcutHintId();

  private sourceVisible = false;
  private sourceDraft = '';
  private sourceDirty = false;
  private readonly draftKey: string;
  private normalizedCurrentSource = '';
  private pendingFocus: TableCellCoordinates | undefined;

  constructor(
    private node: ProseMirrorNode,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined,
    private readonly options: TableNodeViewOptions,
  ) {
    this.dom = document.createElement('div');
    this.dom.className = 'muninn-table-node';
    this.dom.dataset.testid = 'muninn-table-node';

    this.header.className = 'muninn-table-node-header';
    const title = document.createElement('strong');
    title.textContent = getString('tableTitle');

    this.actions.className = 'muninn-table-node-actions';
    this.addRowButton.type = 'button';
    this.addRowButton.textContent = getString('tableAddRowButton');
    this.addColumnButton.type = 'button';
    this.addColumnButton.textContent = getString('tableAddColumnButton');
    this.deleteTableButton.type = 'button';
    this.deleteTableButton.textContent = getString('tableDeleteButton');
    this.deleteTableButton.dataset.testid = 'muninn-table-delete';
    this.deleteTableButton.setAttribute('aria-label', getString('tableDeleteAriaLabel'));
    this.deleteTableButton.classList.add('muninn-button-danger');
    this.sourceToggleButton.type = 'button';
    this.sourceToggleButton.textContent = getString('tableViewSourceButton');
    this.sourceToggleButton.dataset.testid = 'muninn-table-toggle-source';

    this.actions.append(
      this.addRowButton,
      this.addColumnButton,
      this.deleteTableButton,
      this.sourceToggleButton,
    );
    this.header.append(title, this.actions);

    this.gridContainer.className = 'muninn-table-node-grid';

    this.sourceContainer.className = 'muninn-table-node-source';
    this.sourceTextarea.className = 'muninn-table-node-source-text';
    this.sourceTextarea.setAttribute('aria-label', getString('tableSourceAriaLabel'));
    this.sourceTextarea.setAttribute('aria-describedby', this.sourceShortcutHintId);
    this.sourceTextarea.dataset.testid = 'muninn-table-source-text';
    this.applySourceButton.type = 'button';
    this.applySourceButton.textContent = getString('tableApplySourceButton');
    this.applySourceButton.title = getString('tableApplySourceTitle');
    this.applySourceButton.setAttribute('aria-keyshortcuts', 'Control+Enter Meta+Enter');
    this.applySourceButton.dataset.testid = 'muninn-table-apply-source';

    this.sourceShortcutHint.className = 'muninn-table-node-source-hint';
    this.sourceShortcutHint.id = this.sourceShortcutHintId;
    this.sourceShortcutHint.textContent = getString('tableSourceHint');

    this.sourceFeedback.className = 'muninn-table-node-source-feedback';
    this.sourceFeedback.dataset.testid = 'muninn-table-source-feedback';
    this.sourceFeedback.setAttribute('role', 'status');
    this.sourceFeedback.setAttribute('aria-live', 'polite');
    this.sourceFeedback.hidden = true;

    this.sourceContainer.append(
      this.sourceTextarea,
      this.applySourceButton,
      this.sourceShortcutHint,
      this.sourceFeedback,
    );
    this.sourceContainer.hidden = true;
    this.normalizedCurrentSource = normalizeTableSource(getTableSource(this.node));
    this.draftKey = JSON.stringify([getPos(), getTableSource(node)]);
    this.sourceDraft = readTableDraft(this.draftKey) ?? this.normalizedCurrentSource;
    this.sourceDirty = this.sourceDraft !== this.normalizedCurrentSource;
    this.sourceTextarea.value = this.sourceDraft;

    this.dom.append(this.header, this.gridContainer, this.sourceContainer);

    this.addRowButton.addEventListener('click', () => {
      this.addRow();
    });
    this.addColumnButton.addEventListener('click', () => {
      this.addColumn();
    });
    this.deleteTableButton.addEventListener('click', () => {
      this.deleteTable();
    });
    this.sourceToggleButton.addEventListener('click', () => {
      this.toggleSourceVisibility();
    });
    this.applySourceButton.addEventListener('click', () => {
      this.applySourceFromTextarea();
    });
    this.sourceTextarea.addEventListener('input', () => {
      this.sourceDraft = this.sourceTextarea.value;
      this.sourceDirty = this.sourceDraft !== this.normalizedCurrentSource;
      writeTableDraft(this.draftKey, this.sourceDirty ? this.sourceDraft : undefined);
      this.clearSourceFeedback();
      this.updateApplySourceButtonState();
    });
    this.sourceTextarea.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) {
        return;
      }
      event.preventDefault();
      if (this.applySourceButton.disabled) {
        return;
      }
      this.applySourceFromTextarea();
    });

    document.addEventListener('muninn-flush', this.flushDraft);
    this.updateApplySourceButtonState();
    this.render();
    if (this.sourceDirty) this.setSourceVisibility(true);
  }

  update(node: ProseMirrorNode): boolean {
    if (!isTableNode(node)) {
      return false;
    }
    if (node.eq(this.node)) return true;
    let source: string;
    try {
      source = normalizeTableSource(getTableSource(node));
    } catch {
      return false; // Recreate as the protected source fallback.
    }
    this.node = node;
    this.normalizedCurrentSource = source;
    if (!this.updatingCell) {
      this.pendingFocus ??= this.getFocusedCellCoordinates();
      this.render();
    }
    return true;
  }

  destroy(): void {
    document.removeEventListener('muninn-flush', this.flushDraft);
  }

  ignoreMutation(): boolean {
    return true;
  }

  stopEvent(event: Event): boolean {
    const target = event.target;
    return target instanceof Node && this.dom.contains(target);
  }

  selectNode(): void {
    this.dom.classList.add('is-selected');
  }

  deselectNode(): void {
    this.dom.classList.remove('is-selected');
  }

  private render(): void {
    const table = parseMarkdownTable(getTableSource(this.node));
    this.renderGrid(table);

    if (!this.sourceDirty) {
      this.sourceDraft = this.normalizedCurrentSource;
      this.sourceTextarea.value = this.sourceDraft;
      this.sourceDirty = false;
      this.updateApplySourceButtonState();
    }
  }

  private renderGrid(table: MarkdownTable): void {
    const tableElement = document.createElement('table');
    tableElement.className = 'muninn-table-node-grid-table';
    tableElement.setAttribute(
      'aria-label',
      getTableGridAriaLabel(this.getCurrentTableDocumentIndex(), table),
    );

    const head = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (const [columnIndex, value] of table.headers.entries()) {
      const th = document.createElement('th');
      th.setAttribute('scope', 'col');
      if (table.alignments?.[columnIndex]) th.style.textAlign = table.alignments[columnIndex]!;
      th.append(this.createCellInput(value, -1, columnIndex));
      headRow.append(th);
    }
    head.append(headRow);
    tableElement.append(head);

    const body = document.createElement('tbody');
    for (const [rowIndex, row] of table.rows.entries()) {
      const tr = document.createElement('tr');
      for (const [columnIndex, value] of row.entries()) {
        const td = document.createElement('td');
        if (table.alignments?.[columnIndex]) td.style.textAlign = table.alignments[columnIndex]!;
        td.append(this.createCellInput(value, rowIndex, columnIndex));
        tr.append(td);
      }
      body.append(tr);
    }
    tableElement.append(body);

    this.gridContainer.replaceChildren(tableElement);
    this.restorePendingFocus(table);
  }

  private createCellInput(value: string, rowIndex: number, columnIndex: number): HTMLInputElement {
    const input = document.createElement('input');
    const logicalRowIndex = this.toLogicalRowIndex(rowIndex);
    input.type = 'text';
    input.className = 'muninn-table-node-cell';
    input.dataset.tableRow = String(logicalRowIndex);
    input.dataset.tableColumn = String(columnIndex);
    input.setAttribute(
      'aria-label',
      rowIndex < 0
        ? formatString(getString('tableHeaderColumnLabelTemplate'), columnIndex + 1)
        : formatString(getString('tableRowColumnLabelTemplate'), rowIndex + 1, columnIndex + 1),
    );
    input.value = value;
    input.addEventListener('focus', () => {
      if (this.pendingFocus?.row === logicalRowIndex && this.pendingFocus.col === columnIndex) {
        this.pendingFocus = undefined;
      }
    });
    const commitInput = (): void => {
      const start = input.selectionStart;
      const end = input.selectionEnd;
      this.updatingCell = true;
      try {
        this.updateCell(rowIndex, columnIndex, input.value);
      } finally {
        this.updatingCell = false;
      }
      if (input.isConnected) {
        input.focus();
        input.setSelectionRange(start, end);
      }
    };
    input.addEventListener('input', (event) => {
      if (!(event instanceof InputEvent) || !event.isComposing) commitInput();
    });
    input.addEventListener('compositionend', commitInput);
    input.addEventListener('keydown', (event) => {
      if (shouldDeferTableCellKeyboardNavigation(event)) {
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        const table = parseMarkdownTable(getTableSource(this.node));
        const target = this.getVerticalTargetCell(table, logicalRowIndex, columnIndex, {
          direction: event.shiftKey ? -1 : 1,
        });
        this.commitCellAndFocus(input, rowIndex, columnIndex, target);
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        input.focus();
        return;
      }

      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        const table = parseMarkdownTable(getTableSource(this.node));
        const target = this.getVerticalTargetCell(table, logicalRowIndex, columnIndex, {
          direction: event.key === 'ArrowUp' ? -1 : 1,
        });
        this.moveFocusToCell(target);
        return;
      }

      if (
        (event.key === 'ArrowLeft' || event.key === 'ArrowRight') &&
        shouldNavigateTableCellHorizontally(input, event.key)
      ) {
        event.preventDefault();
        const table = parseMarkdownTable(getTableSource(this.node));
        const target = this.getHorizontalTargetCell(table, logicalRowIndex, columnIndex, {
          direction: event.key === 'ArrowLeft' ? -1 : 1,
        });
        this.moveFocusToCell(target);
        return;
      }

      if (event.key === 'Tab') {
        this.pendingFocus = this.getTabTargetCell(
          parseMarkdownTable(getTableSource(this.node)),
          logicalRowIndex,
          columnIndex,
          event.shiftKey,
        );
      }
    });
    return input;
  }

  private updateCell(rowIndex: number, columnIndex: number, value: string): boolean {
    const table = parseMarkdownTable(getTableSource(this.node));
    if (rowIndex < 0) {
      if (table.headers[columnIndex] === value) {
        return false;
      }
      table.headers[columnIndex] = value;
    } else {
      if (!table.rows[rowIndex]) {
        return false;
      }
      if (table.rows[rowIndex][columnIndex] === value) {
        return false;
      }
      table.rows[rowIndex][columnIndex] = value;
    }
    this.applyTable(table, getString('statusTableUpdated'));
    return true;
  }

  private addRow(): void {
    this.pendingFocus ??= this.getFocusedCellCoordinates();
    const table = parseMarkdownTable(getTableSource(this.node));
    const columnCount = table.headers.length;
    table.rows.push(Array.from({ length: columnCount }, () => ''));
    this.applyTable(table, getString('statusTableRowAdded'));
  }

  private addColumn(): void {
    this.pendingFocus ??= this.getFocusedCellCoordinates();
    const table = parseMarkdownTable(getTableSource(this.node));
    const nextColumn = table.headers.length + 1;
    table.headers.push(formatString(getString('tableNewColumnHeaderTemplate'), nextColumn));
    for (const row of table.rows) {
      row.push('');
    }
    this.applyTable(table, getString('statusTableColumnAdded'));
  }

  private deleteTable(): void {
    const position = this.resolveNodePosition();
    if (position === undefined) {
      this.options.announce(getString('statusTableDeleteFailed'), { kind: 'error' });
      return;
    }

    const transaction = this.view.state.tr.deleteRange(position, position + this.node.nodeSize);
    this.view.dispatch(transaction.scrollIntoView());
    this.options.announce(getString('statusTableDeleted'), { kind: 'status' });
  }

  private toggleSourceVisibility(): void {
    this.setSourceVisibility(!this.sourceVisible);
  }

  private setSourceVisibility(visible: boolean): void {
    this.sourceVisible = visible;
    this.dom.classList.toggle('is-source-visible', visible);
    this.sourceContainer.hidden = !visible;
    this.gridContainer.hidden = visible;
    this.sourceToggleButton.textContent = visible
      ? getString('tableBackToPreviewButton')
      : getString('tableViewSourceButton');
    if (visible && !this.sourceDirty) {
      this.sourceDraft = this.normalizedCurrentSource;
      this.sourceTextarea.value = this.sourceDraft;
      this.sourceDirty = false;
      this.clearSourceFeedback();
      this.updateApplySourceButtonState();
      return;
    }

    this.clearSourceFeedback();
    this.updateApplySourceButtonState();
  }

  private applySourceFromTextarea(): void {
    let normalized: string;
    try {
      normalized = normalizeTableSource(this.sourceDraft);
    } catch {
      this.setSourceFeedback('error', getString('statusTableSourceApplyFailed'));
      return;
    }
    if (normalized !== this.normalizedCurrentSource) {
      this.pendingFocus = { row: 0, col: 0 };
      const applied = this.applySource(normalized, getString('statusTableSourceApplied'));
      if (!applied) {
        this.setSourceFeedback('error', getString('statusTableSourceApplyFailed'));
        return;
      }

      this.setSourceFeedback('success', getString('statusTableSourceApplied'));
    }

    this.sourceDraft = normalized;
    this.sourceDirty = false;
    writeTableDraft(this.draftKey);
    this.sourceTextarea.value = normalized;
    this.setSourceVisibility(false);
  }

  private applyTable(table: MarkdownTable, statusMessage: string): void {
    this.applySource(serializeMarkdownTable(table), statusMessage);
  }

  private commitCellAndFocus(
    input: HTMLInputElement,
    rowIndex: number,
    columnIndex: number,
    target: TableCellCoordinates,
  ): void {
    this.pendingFocus = target;
    if (this.updateCell(rowIndex, columnIndex, input.value)) {
      return;
    }

    this.pendingFocus = undefined;
    this.focusCell(target);
  }

  private moveFocusToCell(target: TableCellCoordinates): void {
    this.pendingFocus = target;
    this.focusCell(target);
    if (this.pendingFocus?.row === target.row && this.pendingFocus.col === target.col) {
      this.pendingFocus = undefined;
    }
  }

  private toLogicalRowIndex(rowIndex: number): number {
    return rowIndex + 1;
  }

  private getVerticalTargetCell(
    table: MarkdownTable,
    row: number,
    col: number,
    { direction }: { direction: -1 | 1 },
  ): TableCellCoordinates {
    return this.coerceCellCoordinates(table, { row: row + direction, col });
  }

  private getHorizontalTargetCell(
    table: MarkdownTable,
    row: number,
    col: number,
    { direction }: { direction: -1 | 1 },
  ): TableCellCoordinates {
    return this.coerceCellCoordinates(table, { row, col: col + direction });
  }

  private getTabTargetCell(
    table: MarkdownTable,
    row: number,
    col: number,
    shiftKey: boolean,
  ): TableCellCoordinates | undefined {
    const columnCount = table.headers.length;
    const totalRows = table.rows.length + 1;
    const linearIndex = row * columnCount + col + (shiftKey ? -1 : 1);
    if (linearIndex < 0 || linearIndex >= totalRows * columnCount) {
      return undefined;
    }

    return {
      row: Math.floor(linearIndex / columnCount),
      col: linearIndex % columnCount,
    };
  }

  private coerceCellCoordinates(
    table: MarkdownTable,
    coordinates: TableCellCoordinates,
  ): TableCellCoordinates {
    return {
      row: Math.min(Math.max(coordinates.row, 0), table.rows.length),
      col: Math.min(Math.max(coordinates.col, 0), Math.max(table.headers.length - 1, 0)),
    };
  }

  private getFocusedCellCoordinates(): TableCellCoordinates | undefined {
    const activeElement = document.activeElement;
    if (
      !(activeElement instanceof HTMLInputElement) ||
      !this.gridContainer.contains(activeElement)
    ) {
      return undefined;
    }

    return this.readCellCoordinates(activeElement);
  }

  private readCellCoordinates(input: HTMLInputElement): TableCellCoordinates | undefined {
    const row = Number(input.dataset.tableRow);
    const col = Number(input.dataset.tableColumn);
    if (!Number.isInteger(row) || !Number.isInteger(col)) {
      return undefined;
    }
    return { row, col };
  }

  private restorePendingFocus(table: MarkdownTable): void {
    const target = this.pendingFocus;
    if (!target) {
      return;
    }

    this.pendingFocus = undefined;
    this.focusCell(this.coerceCellCoordinates(table, target));
  }

  private focusCell(target: TableCellCoordinates): boolean {
    const input = this.gridContainer.querySelector<HTMLInputElement>(
      // eslint-disable-next-line unicorn/require-css-escape -- Row and column are numeric indexes.
      `.muninn-table-node-cell[data-table-row="${target.row}"][data-table-column="${target.col}"]`,
    );
    if (!input) {
      return false;
    }

    const focusInput = (): void => {
      input.focus();
      input.select();
    };

    focusInput();
    setTimeout(() => {
      const activeElement = document.activeElement;
      if (
        activeElement !== input &&
        (activeElement === document.body || !this.gridContainer.contains(activeElement))
      ) {
        focusInput();
      }
    }, 0);
    return true;
  }

  private applySource(source: string, statusMessage: string): boolean {
    const nextSource = normalizeTableSource(source);
    const position = this.resolveNodePosition();
    if (position === undefined) {
      this.options.announce(getString('statusTableSourceApplyFailed'), { kind: 'error' });
      return false;
    }

    const replacement = this.node.type.create({ source: nextSource });
    const transaction = this.view.state.tr.setNodeMarkup(position, undefined, replacement.attrs);
    this.view.dispatch(transaction);
    if (!this.view.state.doc.nodeAt(position)?.eq(replacement)) return false;
    this.options.announce(statusMessage, { kind: 'status' });
    return true;
  }

  private getCurrentTableDocumentIndex(): number {
    const position = this.resolveCurrentNodePosition();
    if (position === undefined) {
      return 1;
    }

    return getTableNodeDocumentIndex(this.view.state.doc, position);
  }

  private resolveCurrentNodePosition(): number | undefined {
    try {
      const position = this.getPos();
      if (typeof position === 'number') {
        return position;
      }
    } catch {
      // A detached node must never redirect an edit to an identical table.
    }

    return undefined;
  }

  private resolveNodePosition(): number | undefined {
    return this.resolveCurrentNodePosition();
  }

  private updateApplySourceButtonState(): void {
    const normalizedDraft = this.sourceDraft;
    this.applySourceButton.disabled =
      !this.sourceVisible || normalizedDraft === this.normalizedCurrentSource;
  }

  private clearSourceFeedback(): void {
    this.sourceFeedback.hidden = true;
    this.sourceFeedback.textContent = '';
    this.sourceFeedback.classList.remove('is-success', 'is-error');
  }

  private setSourceFeedback(kind: 'success' | 'error', message: string): void {
    this.sourceFeedback.hidden = false;
    this.sourceFeedback.textContent = formatTableSourceFeedback(kind, message);
    this.sourceFeedback.classList.toggle('is-success', kind === 'success');
    this.sourceFeedback.classList.toggle('is-error', kind === 'error');
  }
}

export const createTableNodeViewConstructor =
  (options: TableNodeViewOptions): NodeViewConstructor =>
  (node, view, getPos) => {
    try {
      normalizeTableSource(getTableSource(node));
    } catch {
      // Unexpected source must never prevent the rest of the document from opening.
      const dom = document.createElement('div');
      dom.className = 'muninn-table-node';
      dom.contentEditable = 'false';
      const message = document.createElement('p');
      message.textContent = getString('statusSourceRequired');
      const source = document.createElement('pre');
      source.textContent = getTableSource(node);
      dom.append(message, source);
      return { dom, ignoreMutation: () => true };
    }
    return new TableNodeView(node, view, getPos, options);
  };
