import { DEFAULT_WEBVIEW_STRINGS } from '../../src/shared/webview-strings';
import { schema } from '../../src/webview/editor/markdown-codec';
import {
  DEFAULT_TABLE_SOURCE,
  getTableGridAriaLabel,
  getTableNodeDocumentIndex,
  formatTableSourceFeedback,
  shouldDeferTableCellKeyboardNavigation,
  shouldNavigateTableCellHorizontally,
  type MarkdownTable,
} from '../../src/webview/editor/nodes/table-node-view';

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
