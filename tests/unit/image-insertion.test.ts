import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import {
  createImageInsertionTransaction,
  getImageAltTextFromSelection,
} from '../../src/webview/editor/image-insertion';
import {
  markdownParser,
  parseHostMarkdown,
  schema,
  serializeToHostMarkdown,
} from '../../src/webview/editor/markdown-codec';

let expect: Chai.ExpectStatic;

before(async () => {
  ({ expect } = await import('chai'));
});

describe('webview image insertion helpers', () => {
  it('inserts an image into a source-backed document without changing surrounding Markdown', () => {
    const source = 'Alpha\n\n+ _untouched_\n';
    const documentNode = parseHostMarkdown(source);
    const state = EditorState.create({
      doc: documentNode,
      selection: TextSelection.create(documentNode, 6),
    });

    const transaction = createImageInsertionTransaction(
      state,
      schema.nodes.image,
      'images/icon.png',
    );

    expect(serializeToHostMarkdown(transaction.doc)).to.equal(
      'Alpha![](images/icon.png)\n\n+ _untouched_\n',
    );
  });

  for (const [name, block] of [
    ['table', '| A | B |\n| --- | --- |\n| 1 | 2 |'],
    ['code block', '```js\nconst code = 1;\n```'],
  ]) {
    it('inserts an image after a selected ' + name + ' instead of replacing it', () => {
      const source = `Intro\n\n${block}\n\nOutro\n`;
      const documentNode = parseHostMarkdown(source);
      const position = documentNode.child(0).nodeSize;
      const state = EditorState.create({
        doc: documentNode,
        selection: NodeSelection.create(documentNode, position),
      });

      expect(getImageAltTextFromSelection(state)).to.equal('');
      const transaction = createImageInsertionTransaction(
        state,
        schema.nodes.image,
        'images/pic.png',
      );

      expect(serializeToHostMarkdown(transaction.doc)).to.equal(
        `Intro\n\n${block}\n\n![](images/pic.png)\n\nOutro\n`,
      );
      expect(transaction.selection.$from.parent.type.name).to.equal('paragraph');
      expect(transaction.selection.$from.nodeBefore?.type.name).to.equal('image');
    });
  }

  it('uses selected text as alt text and serializes markdown image syntax', () => {
    const documentNode = parseHostMarkdown('A screenshot appears here.');
    const selectedFrom = 3;
    const selectedTo = 'A screenshot'.length + 1;
    const state = EditorState.create({
      doc: documentNode,
      selection: TextSelection.create(documentNode, selectedFrom, selectedTo),
    });

    expect(getImageAltTextFromSelection(state)).to.equal('screenshot');

    const transaction = createImageInsertionTransaction(
      state,
      schema.nodes.image,
      'images/screenshot.png',
    );
    expect(serializeToHostMarkdown(transaction.doc)).to.equal(
      'A ![screenshot](images/screenshot.png) appears here.',
    );
  });

  it('keeps empty alt text when no text is selected', () => {
    const documentNode = markdownParser.parse('Before after.');
    const state = EditorState.create({
      doc: documentNode,
      selection: TextSelection.create(documentNode, 8),
    });
    const transaction = createImageInsertionTransaction(
      state,
      schema.nodes.image,
      'images/empty.png',
    );

    expect(getImageAltTextFromSelection(state)).to.equal('');
    expect(serializeToHostMarkdown(transaction.doc)).to.equal('Before ![](images/empty.png)after.');
  });

  it('preserves encoded image paths as markdown image syntax', () => {
    const documentNode = markdownParser.parse('Before after.');
    const state = EditorState.create({
      doc: documentNode,
      selection: TextSelection.create(documentNode, 8),
    });
    const transaction = createImageInsertionTransaction(
      state,
      schema.nodes.image,
      'images/Screen%20Shot%20%231.png',
    );

    expect(serializeToHostMarkdown(transaction.doc)).to.equal(
      'Before ![](images/Screen%20Shot%20%231.png)after.',
    );
  });
});
