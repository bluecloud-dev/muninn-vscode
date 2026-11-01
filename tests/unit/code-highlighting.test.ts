// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import sinon from 'sinon';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState, type Transaction } from 'prosemirror-state';
import { Decoration } from 'prosemirror-view';
import { createCodeHighlighting } from '../../src/webview/editor/code-highlighting';
import { markdownParser, schema } from '../../src/webview/editor/markdown-codec';

// Decoration attributes are internal; tests read them to compare whole decoration sets.
const listDecorations = (state: EditorState): string[] =>
  state.plugins[0]
    .getState(state)
    .find()
    .map(
      (decoration: Decoration) =>
        `${decoration.from}-${decoration.to}:` +
        (decoration as unknown as { type: { attrs: { class: string } } }).type.attrs.class,
    );
const create = (doc: ProseMirrorNode): EditorState =>
  EditorState.create({ doc, plugins: [createCodeHighlighting()] });
const blocks = (doc: ProseMirrorNode): { node: ProseMirrorNode; position: number }[] => {
  const found: { node: ProseMirrorNode; position: number }[] = [];
  doc.descendants((node, position) => {
    if (node.isTextblock) found.push({ node, position });
    return !node.isTextblock;
  });
  return found;
};
const source =
  'Intro\n\n```javascript\nconst a = 1;\n```\n\nMiddle\n\n```python title="b.py"\ndef b(): return "b"\n```\n';

// Apply an edit, count new decorations and compare with a fresh build of the result.
const run = (edit: (transaction: Transaction, doc: ProseMirrorNode) => Transaction) => {
  const state = create(markdownParser.parse(source));
  const inline = sinon.spy(Decoration, 'inline');
  const next = state.apply(edit(state.tr, state.doc));
  const created = inline.callCount;
  inline.restore();
  const expected = listDecorations(create(next.doc));
  assert.deepEqual(listDecorations(next), expected);
  return { before: listDecorations(state), after: expected, created };
};

describe('incremental code highlighting', () => {
  const dom = new JSDOM('');
  const globals = {
    document: dom.window.document,
    Node: dom.window.Node,
    Element: dom.window.Element,
  };
  const previous = new Map<string, PropertyDescriptor | undefined>();
  before(() => {
    for (const [name, value] of Object.entries(globals)) {
      previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
      Object.defineProperty(globalThis, name, { configurable: true, value });
    }
  });
  afterEach(() => sinon.restore());
  after(() => {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
    dom.window.close();
  });

  it('maps highlighting through an edit outside code without rebuilding it', () => {
    const result = run((transaction, doc) =>
      transaction.insertText('More ', blocks(doc)[2].position + 1),
    );
    assert.ok(result.after.length > 0);
    assert.equal(result.created, 0);
  });

  it('maps highlighting through a mark change outside code without rebuilding it', () => {
    const result = run((transaction, doc) =>
      transaction.addMark(1, blocks(doc)[0].node.nodeSize - 1, schema.marks.strong.create()),
    );
    assert.equal(result.created, 0);
  });

  it('rebuilds only the edited code block', () => {
    const result = run((transaction, doc) =>
      transaction.insertText(' + 2', blocks(doc)[1].position + 1 + 'const a = 1'.length),
    );
    const python = blocks(markdownParser.parse(source))[3].position;
    const pythonTokens = result.before.filter((entry) => Number(entry.split('-')[0]) > python);
    assert.notDeepEqual(result.after, result.before);
    assert.ok(pythonTokens.length > 0);
    assert.ok(result.created > 0);
    assert.equal(result.created, result.after.length - pythonTokens.length);
  });

  it('highlights an inserted code block and drops a deleted one', () => {
    const inserted = run((transaction, doc) =>
      transaction.insert(
        doc.content.size,
        schema.nodes.code_block.create({ params: 'json' }, schema.text('{"c": 3}')),
      ),
    );
    assert.ok(inserted.after.length > inserted.before.length);
    const deleted = run((transaction, doc) => {
      const python = blocks(doc)[3];
      return transaction.delete(python.position, python.position + python.node.nodeSize);
    });
    assert.ok(deleted.after.length < deleted.before.length);
  });

  for (const [name, change] of [
    [
      'node markup',
      (transaction: Transaction, position: number) =>
        transaction.setNodeMarkup(position, undefined, { params: 'python' }),
    ],
    [
      'node attribute',
      (transaction: Transaction, position: number) =>
        transaction.setNodeAttribute(position, 'params', 'python'),
    ],
    [
      'block type',
      (transaction: Transaction, position: number) =>
        transaction.setBlockType(position + 1, position + 1, schema.nodes.paragraph),
    ],
  ] as const) {
    it('rehighlights a code block after a ' + name + ' change', () => {
      const result = run((transaction, doc) => change(transaction, blocks(doc)[1].position));
      assert.notDeepEqual(result.after, result.before);
    });
  }
});
