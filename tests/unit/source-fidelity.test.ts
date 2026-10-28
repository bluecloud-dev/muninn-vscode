// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { characterDiff } from 'diff';
import { EditorState, TextSelection } from 'prosemirror-state';
import sinon from 'sinon';
import { continueList, toggleTask } from '../../src/webview/editor/document-navigation';
import {
  markdownSerializer,
  parseHostMarkdown,
  serializeToHostMarkdown,
  schema,
  setDocumentSource,
} from '../../src/webview/editor/markdown-codec';
import {
  parseMarkdownTable,
  serializeMarkdownTable,
} from '../../src/webview/editor/tables/markdown-table-utilities';
import {
  mergeIndependentChanges,
  textChanges,
  applyTextChanges,
} from '../../src/shared/text-edits';

const editWord = (source: string, before: string, after: string): string => {
  const state = EditorState.create({ doc: parseHostMarkdown(source) });
  let from: number | undefined;
  let replacement = schema.text(after);
  state.doc.descendants((node, position) => {
    if (from === undefined && node.isText && node.text?.includes(before)) {
      from = position + node.text.indexOf(before);
      replacement = schema.text(after, node.marks);
    }
  });
  assert.notEqual(from, undefined);
  return serializeToHostMarkdown(
    state.tr.replaceWith(from!, from! + before.length, replacement).doc,
  );
};

describe('source-preserving edits', () => {
  for (const eol of ['\n', '\r\n']) {
    it(
      'preserves the final newline after lifting the last empty task: ' + JSON.stringify(eol),
      () => {
        const source = '- [X] Done' + eol + '- [ ]' + eol;
        let state = EditorState.create({ doc: parseHostMarkdown(source) });
        state = state.apply(state.tr.setSelection(TextSelection.atEnd(state.doc)));
        assert.equal(
          continueList(state, (tr) => {
            state = state.apply(tr);
          }),
          true,
        );
        const lifted = serializeToHostMarkdown(state.doc);
        setDocumentSource(state.doc, lifted);
        state = state.apply(state.tr.insertText('Next'));
        assert.equal(serializeToHostMarkdown(state.doc), '- [X] Done' + eol + eol + 'Next' + eol);
      },
    );
  }
  for (const source of ['Alpha\n', '- Alpha\n']) {
    it('keeps the cursor in visible text after creating a task: ' + JSON.stringify(source), () => {
      let state = EditorState.create({ doc: parseHostMarkdown(source) });
      const start = source.startsWith('-') ? 3 : 1;
      state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, start + 2)));
      toggleTask(state, (tr) => {
        state = state.apply(tr);
      });
      assert.equal(state.selection.$from.parentOffset, 6);
      state = state.apply(state.tr.insertText('X'));
      assert.equal(
        serializeToHostMarkdown(state.doc),
        (source.startsWith('-') ? '-' : '*') + ' [ ] AlXpha\n',
      );
    });
  }
  for (const family of ['spec-kit', 'openspec']) {
    for (const file of ['spec.md', 'tasks.md']) {
      it('preserves and edits plain ' + family + '/' + file, () => {
        const source = fs.readFileSync(
          path.join('tests/fixtures/spec-workflows', family, file),
          'utf8',
        );
        assert.equal(serializeToHostMarkdown(parseHostMarkdown(source)), source);
        let target = family === 'spec-kit' ? 'developer' : 'system';
        if (file === 'tasks.md') target = 'Read';
        assert.equal(editWord(source, target, 'Updated'), source.replace(target, 'Updated'));
      });
    }
  }
  for (const source of [
    'Alpha\nBeta\n',
    'Alpha \nBeta\n',
    '# Alpha ###\n',
    'Alpha\n=====\n',
    '- Alpha\n- Beta\n',
    '+ Alpha\n+ Beta\n',
    '7) Alpha\n8) Beta\n',
    '_Alpha_\n',
    '__Alpha__\n',
    '[Alpha][target]\n\n[target]: https://example.com\n',
    'Alpha &amp; Beta\n',
    'Alpha\r\nBeta\r\n',
    'Alpha\r\nBeta\nDelta\r\n',
    'Alpha\n\n\nBeta\n',
    '---\ntitle: preserve\n---\n\nAlpha\n',
    '> Alpha\n> Beta\n',
    '~~Alpha~~\n',
    '- [ ] Alpha\n- [x] Beta\n',
    'Alpha',
    'Alpha 😀\n',
  ]) {
    it('edits a word without changing surrounding bytes: ' + JSON.stringify(source), () => {
      assert.equal(editWord(source, 'Alpha', 'Gamma'), source.replace('Alpha', 'Gamma'));
    });
  }

  for (const eol of ['\n', '\r\n']) {
    it('preserves newline bytes when splitting a paragraph: ' + JSON.stringify(eol), () => {
      const source = ['# Reading ###', '', 'AlphaBeta', '', '_Untouched_  '].join(eol);
      const state = EditorState.create({ doc: parseHostMarkdown(source) });
      let splitAt: number | undefined;
      state.doc.descendants((node, position) => {
        if (node.isText && node.text === 'AlphaBeta') splitAt = position + 5;
      });
      assert.notEqual(splitAt, undefined);
      assert.equal(
        serializeToHostMarkdown(state.tr.split(splitAt!).doc),
        ['# Reading ###', '', 'Alpha', '', 'Beta', '', '_Untouched_  '].join(eol),
      );
    });
    for (const ending of [eol, '']) {
      it(
        'edits a large document without rewriting its line endings: ' +
          JSON.stringify(eol) +
          (ending ? ' with' : ' without') +
          ' a final newline',
        () => {
          const paragraphs = Array.from(
            { length: 600 },
            (_, index) => `Line number ${index} of text.`,
          );
          const source = paragraphs.join(eol + eol) + ending;
          assert.ok(source.length > 15_000);
          assert.equal(
            editWord(source, 'number 10 of', 'number 10X of'),
            source.replace('number 10 of', 'number 10X of'),
          );
        },
      );
    }
  }

  it('keeps intermediate trailing spaces while typing and subsequent undo edits', () => {
    let state = EditorState.create({ doc: parseHostMarkdown('# Reading\n\nAlpha\n') });
    for (const addition of [' ', 'Beta', ' ']) {
      const transaction = state.tr.insertText(addition, state.doc.content.size - 1);
      const markdown = serializeToHostMarkdown(transaction.doc);
      state = state.apply(transaction);
      setDocumentSource(state.doc, markdown);
    }
    assert.equal(serializeToHostMarkdown(state.doc), '# Reading\n\nAlpha Beta \n');
    const transaction = state.tr.delete(state.doc.content.size - 7, state.doc.content.size - 1);
    assert.equal(serializeToHostMarkdown(transaction.doc), '# Reading\n\nAlpha\n');
  });

  it('serializes each typed character once after the first edit', () => {
    const serialize = sinon.spy(markdownSerializer, 'serialize');
    try {
      let state = EditorState.create({ doc: parseHostMarkdown('# Reading\n\nAlpha\n') });
      const counts: number[] = [];
      for (const addition of ['B', 'e', 't', 'a']) {
        serialize.resetHistory();
        const transaction = state.tr.insertText(addition, state.doc.content.size - 1);
        const markdown = serializeToHostMarkdown(transaction.doc);
        state = state.apply(transaction);
        setDocumentSource(state.doc, markdown);
        counts.push(serialize.callCount);
      }
      assert.deepEqual(counts.slice(1), [1, 1, 1]);
      assert.equal(serializeToHostMarkdown(state.doc), '# Reading\n\nAlphaBeta\n');
    } finally {
      serialize.restore();
    }
  });

  it('preserves original table alignment, spacing and escaped pipes after a cell edit', () => {
    const source = '| A   | B |\n| :--- | ---: |\n| a \\| b | old |';
    const model = parseMarkdownTable(source);
    assert.equal(model.rows[0].length, 2);
    model.rows[0][1] = 'new';
    assert.equal(serializeMarkdownTable(model), source.replace('old', 'new'));
    const document = parseHostMarkdown(source + '\n');
    const replacement = schema.nodes.table.create({ source: serializeMarkdownTable(model) });
    const state = EditorState.create({ doc: document });
    assert.equal(
      serializeToHostMarkdown(
        state.tr.replaceWith(0, document.firstChild!.nodeSize, replacement).doc,
      ),
      source.replace('old', 'new') + '\n',
    );
  });

  it('does not turn a real muninn-table code fence into a table', () => {
    const source = '```muninn-table\n| A | B |\n| --- | --- |\n```\n';
    assert.equal(parseHostMarkdown(source).firstChild!.type.name, 'code_block');
    assert.equal(editWord(source, 'A', 'C'), source.replace('A', 'C'));
  });

  it('preserves a diagram fence and surrounding Markdown during a source edit', () => {
    const source = '~~~mermaid\nflowchart LR\n  Alpha --> Beta\n~~~\n\nA note.\n';
    assert.equal(editWord(source, 'Alpha', 'Gamma'), source.replace('Alpha', 'Gamma'));
  });
});

describe('text synchronization changes', () => {
  it('uses UTF-16 offsets without damaging surrogate pairs', () => {
    assert.equal(
      applyTextChanges('😀 alpha\r\nbeta', textChanges('😀 alpha\r\nbeta', '😀 gamma\r\nbeta')),
      '😀 gamma\r\nbeta',
    );
  });
  it('keeps surrogate pairs whole when a large rewrite falls back to one change', () => {
    const loneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    for (const [before, after] of [
      ['😀' + 'a'.repeat(30_000), '😁' + 'b'.repeat(30_000)],
      ['a'.repeat(30_000) + '🈀', 'b'.repeat(30_000) + '😀'],
    ]) {
      const changes = textChanges(before, after);
      assert.equal(changes.length, 1);
      assert.equal(loneSurrogate.test(before.slice(changes[0].from, changes[0].to)), false);
      assert.equal(loneSurrogate.test(changes[0].insert), false);
      assert.equal(applyTextChanges(before, changes) === after, true);
    }
  });
  it('skips the common prefix before diffing without changing the alignment', () => {
    const diff = sinon.spy(characterDiff, 'diff');
    try {
      const before = 'a'.repeat(100_000) + 'Xb';
      const after = 'a'.repeat(100_000) + 'YZb';
      assert.deepEqual(textChanges(before, after), [{ from: 100_000, to: 100_001, insert: 'YZ' }]);
      assert.deepEqual(diff.firstCall.args.slice(0, 2), ['Xb', 'YZb']);
      // A lifted list item keeps the marker space that diffChars aligns first.
      assert.deepEqual(textChanges('- Parent\n  + Child\n  + ', '- Parent\n  + Child\n- '), [
        { from: 19, to: 19, insert: '-' },
        { from: 20, to: 23, insert: '' },
      ]);
      assert.deepEqual(textChanges('a😀b', 'a😁b'), [{ from: 1, to: 3, insert: '😁' }]);
      assert.deepEqual(textChanges('a😀b', 'a😀'), [{ from: 3, to: 4, insert: '' }]);
    } finally {
      diff.restore();
    }
  });
  it('merges independent agent and local edits', () => {
    assert.equal(
      mergeIndependentChanges('Alpha\nBeta\n', 'AlphaX\nBeta\n', 'Alpha\nBetaY\n'),
      'AlphaX\nBetaY\n',
    );
  });
  it('does not silently choose a winner for overlapping edits', () => {
    assert.equal(mergeIndependentChanges('Alpha', 'AlphaX', 'AlphaY'), undefined);
  });
});
