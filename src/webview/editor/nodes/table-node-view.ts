// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { setIconButton } from '../icon-button';
import { readTableDraft, writeTableDraft } from '../table-drafts';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { NodeSelection } from 'prosemirror-state';
import type { EditorView, NodeView, NodeViewConstructor } from 'prosemirror-view';
import { formatErrorAnnouncement, type Announce } from '../announcements';
import { formatString, getString } from '../localization';
import { normalizeTableSource, parseMarkdownTable } from '../tables/markdown-table-utilities';
import type { MarkdownTable } from '../tables/markdown-table-utilities';
import { editTable, getTableSource, isTableNode, type TableEdit } from '../tables/table-edit';

type TableNodeViewOptions = {
  announce: Announce;
  pickAdd: (position: number) => void;
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
  private readonly addButton = document.createElement('button');
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
    this.addButton.type = 'button';
    setIconButton(this.addButton, 'add', getString('tableAddButton'));
    this.deleteTableButton.type = 'button';
    setIconButton(this.deleteTableButton, 'trash', getString('tableDeleteAriaLabel'));
    this.deleteTableButton.dataset.testid = 'muninn-table-delete';
    this.deleteTableButton.classList.add('muninn-button-danger');
    this.sourceToggleButton.type = 'button';
    setIconButton(this.sourceToggleButton, 'code', getString('tableViewSourceButton'));
    this.sourceToggleButton.dataset.testid = 'muninn-table-toggle-source';

    this.actions.append(this.addButton, this.deleteTableButton, this.sourceToggleButton);
    this.header.append(title, this.actions);

    this.gridContainer.className = 'muninn-table-node-grid';

    this.sourceContainer.className = 'muninn-table-node-source';
    this.sourceTextarea.className = 'muninn-table-node-source-text';
    this.sourceTextarea.setAttribute('aria-label', getString('tableSourceAriaLabel'));
    this.sourceTextarea.setAttribute('aria-describedby', this.sourceShortcutHintId);
    this.sourceTextarea.dataset.testid = 'muninn-table-source-text';
    this.applySourceButton.type = 'button';
    setIconButton(
      this.applySourceButton,
      'check',
      getString('tableApplySourceButton'),
      getString('tableApplySourceTitle'),
    );
    this.applySourceButton.setAttribute('aria-keyshortcuts', 'Control+Enter Meta+Enter');
    this.applySourceButton.dataset.testid = 'muninn-table-apply-source';

    this.sourceShortcutHint.className = 'muninn-table-node-source-hint';
    this.sourceShortcutHint.id = this.sourceShortcutHintId;
    this.sourceShortcutHint.textContent = getString('tableSourceHint');

    this.sourceFeedback.className = 'muninn-table-node-source-feedback';
    this.sourceFeedback.dataset.testid = 'muninn-table-source-feedback';
    this.sourceFeedback.id = this.sourceShortcutHintId + '-feedback';
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

    this.dom.addEventListener('focusin', () => {
      const position = this.resolveCurrentNodePosition();
      const { state } = this.view;
      if (
        position !== undefined &&
        (!(state.selection instanceof NodeSelection) || state.selection.from !== position)
      )
        this.view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, position)));
    });

    this.addButton.addEventListener('click', () => {
      const position = this.getPos();
      if (position !== undefined) this.options.pickAdd(position);
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
    input.style.minInlineSize = Math.max(12, value.length + 2) + 'em';
    input.addEventListener('focus', () => {
      if (this.pendingFocus?.row === logicalRowIndex && this.pendingFocus.col === columnIndex) {
        this.pendingFocus = undefined;
      }
    });
    const commitInput = (): void => {
      input.style.minInlineSize = Math.max(12, input.value.length + 2) + 'em';
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
    return this.applyEdit(
      { type: 'cell', row: rowIndex, column: columnIndex, value },
      getString('statusTableUpdated'),
    );
  }

  private deleteTable(): void {
    if (this.applyEdit({ type: 'delete' }, getString('statusTableDeleted'))) this.view.focus();
  }

  private toggleSourceVisibility(): void {
    this.setSourceVisibility(!this.sourceVisible);
  }

  private setSourceVisibility(visible: boolean): void {
    this.sourceVisible = visible;
    this.dom.classList.toggle('is-source-visible', visible);
    this.sourceContainer.hidden = !visible;
    this.gridContainer.hidden = visible;
    setIconButton(
      this.sourceToggleButton,
      visible ? 'preview' : 'code',
      visible ? getString('tableBackToPreviewButton') : getString('tableViewSourceButton'),
    );
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
      const message = getString('statusTableSourceInvalid');
      this.sourceTextarea.setAttribute('aria-invalid', 'true');
      this.setSourceFeedback('error', message);
      this.options.announce(message, { kind: 'error' });
      this.sourceTextarea.focus();
      return;
    }
    if (normalized !== this.normalizedCurrentSource) {
      this.pendingFocus = { row: 0, col: 0 };
      const applied = this.applyEdit(
        { type: 'source', source: normalized },
        getString('statusTableSourceApplied'),
      );
      if (!applied) {
        this.setSourceFeedback(
          'error',
          getString(
            this.resolveCurrentNodePosition() === undefined
              ? 'statusTableSourceApplyFailed'
              : 'statusSourceRequired',
          ),
        );
        this.sourceTextarea.focus();
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

  private commitCellAndFocus(
    input: HTMLInputElement,
    rowIndex: number,
    columnIndex: number,
    target: TableCellCoordinates,
  ): void {
    this.pendingFocus = target;
    const accepted = this.updateCell(rowIndex, columnIndex, input.value);
    if (accepted && this.pendingFocus) this.focusCell(target);
    this.pendingFocus = undefined;
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

  private applyEdit(edit: TableEdit, statusMessage: string): boolean {
    const position = this.resolveCurrentNodePosition();
    const result = editTable(this.view, position, edit);
    if (result === 'rejected') {
      this.pendingFocus = undefined;
      if (position === undefined)
        this.options.announce(
          getString(
            edit.type === 'delete' ? 'statusTableDeleteFailed' : 'statusTableSourceApplyFailed',
          ),
          { kind: 'error' },
        );
      return false;
    }
    if (result === 'applied') this.options.announce(statusMessage, { kind: 'status' });
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

  private updateApplySourceButtonState(): void {
    const normalizedDraft = this.sourceDraft;
    this.applySourceButton.disabled =
      !this.sourceVisible || normalizedDraft === this.normalizedCurrentSource;
  }

  private clearSourceFeedback(): void {
    this.sourceTextarea.removeAttribute('aria-invalid');
    this.sourceTextarea.setAttribute('aria-describedby', this.sourceShortcutHintId);
    this.sourceFeedback.hidden = true;
    this.sourceFeedback.textContent = '';
    this.sourceFeedback.classList.remove('is-success', 'is-error');
  }

  private setSourceFeedback(kind: 'success' | 'error', message: string): void {
    this.sourceTextarea.setAttribute(
      'aria-describedby',
      this.sourceShortcutHintId + ' ' + this.sourceFeedback.id,
    );
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
