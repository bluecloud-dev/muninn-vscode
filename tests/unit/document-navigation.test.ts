// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import assert from 'node:assert/strict';
import { EditorState } from 'prosemirror-state';
import { createDocumentNavigation } from '../../src/webview/editor/document-navigation';
import { parseHostMarkdown, schema } from '../../src/webview/editor/markdown-codec';

const open = (markdown: string) => {
  const plugin = createDocumentNavigation(() => {});
  let state = EditorState.create({ doc: parseHostMarkdown(markdown), plugins: [plugin] });
  return {
    apply: (edit: (current: EditorState) => EditorState['tr']) => {
      state = state.apply(edit(state));
    },
    checkboxes: () =>
      plugin.getState(state)!.find(undefined, undefined, (spec) => typeof spec.key === 'string'),
    headings: () =>
      plugin.getState(state)!.find(undefined, undefined, (spec) => typeof spec.key !== 'string'),
  };
};

const endOf = (state: EditorState, text: string): number => {
  let end = -1;
  state.doc.descendants((node, pos) => {
    if (node.isText && node.text === text) end = pos + text.length;
  });
  return end;
};

describe('document navigation decorations', () => {
  it('maps decorations through edits that touch no heading or task', () => {
    const editor = open('# Notes\n\n# Notes\n\nPlain\n\n- [ ] Task\n');
    const [checkbox] = editor.checkboxes();
    editor.apply((state) => state.tr.insertText('!', endOf(state, 'Plain')));
    const [mapped] = editor.checkboxes();
    assert.equal(mapped.from, checkbox.from + 1);
    assert.ok(mapped.spec === checkbox.spec, 'an unrelated edit must not rebuild decorations');
    editor.apply((state) => state.tr.insertText('s', endOf(state, 'Notes')));
    assert.ok(editor.checkboxes()[0].spec !== mapped.spec, 'a heading edit rebuilds anchors');
  });

  it('rebuilds when a list edit makes or unmakes a task paragraph', () => {
    const lead = open('- Lead\n\n  [ ] Later\n');
    assert.equal(lead.checkboxes().length, 0);
    lead.apply((state) => state.tr.delete(2, 2 + state.doc.nodeAt(2)!.nodeSize));
    assert.equal(lead.checkboxes().length, 1);
    const task = open('- [ ] Task\n');
    assert.equal(task.checkboxes().length, 1);
    task.apply((state) =>
      state.tr.insert(2, schema.nodes.paragraph.create(undefined, schema.text('Lead'))),
    );
    assert.equal(task.checkboxes().length, 0);
  });

  it('names thousands of identical headings within the default timeout', () => {
    // Blockquotes keep prosemirror-view's own per-parent decoration checks small,
    // so the duplicate-slug work across the whole document dominates.
    const editor = open(('> ## Notes\n'.repeat(80) + '\n').repeat(100) + 'Plain\n');
    assert.equal(editor.headings().length, 8000);
    editor.apply((state) => state.tr.insertText('s', endOf(state, 'Notes')));
    editor.apply((state) => state.tr.insertText('!', endOf(state, 'Plain')));
    assert.equal(editor.headings().length, 8000);
  });
});
