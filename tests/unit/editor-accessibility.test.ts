import {
  getEditorAriaLabel,
  getEditorViewAttributes,
} from '../../src/webview/editor/editor-accessibility';

let expect: Chai.ExpectStatic;

before(async () => {
  ({ expect } = await import('chai'));
});

describe('editor accessibility helpers', () => {
  it('formats the localized editor label with a file name', () => {
    expect(getEditorAriaLabel('README.md')).to.equal('Markdown editor — README.md');
  });

  it('falls back to a plain localized editor label without a file name', () => {
    expect(getEditorAriaLabel('  ')).to.equal('Markdown editor');
  });

  it('builds the ProseMirror contenteditable attributes', () => {
    expect(getEditorViewAttributes('README.md')).to.deep.equal({
      'aria-label': 'Markdown editor — README.md',
      'aria-multiline': 'true',
      role: 'textbox',
    });
  });
});
