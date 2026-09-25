// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { EditorState } from 'prosemirror-state';
import {
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
