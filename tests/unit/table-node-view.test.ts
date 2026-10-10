import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { DecorationSet, type EditorView } from 'prosemirror-view';
import { DEFAULT_WEBVIEW_STRINGS } from '../../src/shared/webview-strings';
import { schema } from '../../src/webview/editor/markdown-codec';
import {
  createTableNodeViewConstructor,
  getTableGridAriaLabel,
  getTableNodeDocumentIndex,
  formatTableSourceFeedback,
  shouldDeferTableCellKeyboardNavigation,
  shouldNavigateTableCellHorizontally,
} from '../../src/webview/editor/nodes/table-node-view';
import {
  DEFAULT_TABLE_SOURCE,
  type MarkdownTable,
} from '../../src/webview/editor/tables/markdown-table-utilities';

let expect: Chai.ExpectStatic;

before(async () => {
  ({ expect } = await import('chai'));
});

const createTableNode = () => schema.nodes.table.create({ source: DEFAULT_TABLE_SOURCE });

const createInputState = (
  value: string,
  selectionStart: number,
  selectionEnd: number,
): HTMLInputElement =>
  ({
    value,
    selectionStart,
    selectionEnd,
  }) as HTMLInputElement;

describe('table node view accessibility helpers', () => {
  it('formats localized grid names from the parsed table model', () => {
    const table: MarkdownTable = {
      headers: ['Name', 'Score', 'Notes'],
      rows: [
        ['Alice', '7', ''],
        ['Ben', '9', ''],
      ],
    };

    expect(DEFAULT_WEBVIEW_STRINGS.tableGridAriaLabelTemplate).to.equal(
      'Table {0}: {1} columns, {2} rows',
    );
    expect(getTableGridAriaLabel(2, table)).to.equal('Table 2: 3 columns, 2 rows');
  });

  it('counts only editable table nodes when deriving document-order table names', () => {
    const firstTable = createTableNode();
    const secondTable = createTableNode();
    const documentNode = schema.nodes.doc.create(undefined, [
      firstTable,
      schema.nodes.code_block.create({ params: 'typescript' }, schema.text('const value = 1;')),
      schema.nodes.paragraph.create(undefined, schema.text('Between tables')),
      secondTable,
    ]);

    const tablePositions: number[] = [];
    documentNode.descendants((node, position) => {
      if (node.type.name === 'table') {
        tablePositions.push(position);
      }
      return true;
    });

    expect(tablePositions).to.have.length(2);
    expect(getTableNodeDocumentIndex(documentNode, tablePositions[0])).to.equal(1);
    expect(getTableNodeDocumentIndex(documentNode, tablePositions[1])).to.equal(2);
  });

  it('formats source feedback with text cues beyond color', () => {
    expect(DEFAULT_WEBVIEW_STRINGS.tableSourceFeedbackAppliedTemplate).to.equal('Applied: {0}');
    expect(formatTableSourceFeedback('success', 'Table source applied.')).to.equal(
      'Applied: Table source applied.',
    );
    expect(
      formatTableSourceFeedback('error', 'Could not apply table source. Please retry.'),
    ).to.equal('Error: Could not apply table source. Please retry.');
  });
});

describe('table cell keyboard helpers', () => {
  it('lets IME composition keystrokes stay native', () => {
    expect(shouldDeferTableCellKeyboardNavigation({ isComposing: true })).to.equal(true);
    expect(shouldDeferTableCellKeyboardNavigation({ isComposing: false })).to.equal(false);
  });

  it('moves left or right only at collapsed text boundaries', () => {
    expect(
      shouldNavigateTableCellHorizontally(createInputState('Score', 0, 0), 'ArrowLeft'),
    ).to.equal(true);
    expect(
      shouldNavigateTableCellHorizontally(createInputState('Score', 5, 5), 'ArrowRight'),
    ).to.equal(true);

    expect(
      shouldNavigateTableCellHorizontally(createInputState('Score', 1, 1), 'ArrowLeft'),
    ).to.equal(false);
    expect(
      shouldNavigateTableCellHorizontally(createInputState('Score', 4, 4), 'ArrowRight'),
    ).to.equal(false);
    expect(
      shouldNavigateTableCellHorizontally(createInputState('Score', 0, 5), 'ArrowLeft'),
    ).to.equal(false);
    expect(shouldNavigateTableCellHorizontally(createInputState('Score', 0, 0), 'Home')).to.equal(
      false,
    );
  });
});
it('protects malformed table source without preventing the document from opening', () => {
  const dom = new JSDOM('');
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  try {
    const source = '<script>invalid table</script>';
    const create = createTableNodeViewConstructor({ announce: () => {} });
    const nodeView = create(
      schema.nodes.table.create({ source }),
      {} as EditorView,
      () => 0,
      [],
      DecorationSet.empty,
    );
    assert.equal((nodeView.dom as HTMLElement).querySelector('pre')!.textContent, source);
    assert.ok(!(nodeView.dom as HTMLElement).querySelector('script'));
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
    dom.window.close();
  }
});
