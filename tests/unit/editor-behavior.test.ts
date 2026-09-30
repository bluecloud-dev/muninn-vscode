// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import type { HostToViewMessage, ViewToHostMessage } from '../../src/custom-editor/protocol';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 15));
const rect = () => ({
  left: 0,
  right: 10,
  top: 0,
  bottom: 10,
  width: 10,
  height: 10,
  x: 0,
  y: 0,
  toJSON: () => ({}),
});

describe('bundled editor behavior with a delayed host', function () {
  this.timeout(10_000);
  let bundle: string;
  let dom: JSDOM;
  let messages: ViewToHostMessage[];
  let savedState: unknown;
  const send = (message: HostToViewMessage) =>
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: message }));
  const applies = () =>
    messages.filter(
      (m): m is Extract<ViewToHostMessage, { type: 'view.applyDocument' }> =>
        m.type === 'view.applyDocument',
    );
  const ack = (index: number, revision: number) => {
    const operation = applies()[index].payload;
    send({
      type: 'host.applyResult',
      payload: { ...operation, revision, ok: true, imageSources: {} },
    });
  };

  before(() => {
    bundle = fs.readFileSync(path.resolve('artifacts/test-editor.js'), 'utf8');
  });
  afterEach(() => dom?.window.close());

  const open = (markdown: string): HTMLElement => {
    messages = [];
    savedState = undefined;
    dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
      url: 'https://muninn-test.invalid',
    });
    const win = dom.window;
    win.Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
    win.Range.prototype.getBoundingClientRect = rect;
    win.HTMLElement.prototype.scrollIntoView = () => {};
    win.scrollBy = () => {};
    Object.assign(win, {
      acquireVsCodeApi: () => ({
        postMessage: (message: ViewToHostMessage) => messages.push(message),
        getState: () => savedState,
        setState: (state: unknown) => {
          savedState = structuredClone(state);
        },
      }),
    });
    win.eval(bundle);
    send({
      type: 'host.init',
      payload: {
        markdown,
        revision: 0,
        fileName: 'spec.md',
        mermaidEnabled: false,
        toolbarMode: 'basic',
        contentWidth: 'comfortable',
        imageSources: {},
      },
    });
    return win.document.querySelector<HTMLElement>('.ProseMirror')!;
  };

  const append = async (editor: HTMLElement, text: string): Promise<void> => {
    const paragraph = editor.querySelector('p')!;
    const node = paragraph.firstChild as Text;
    const range = dom.window.document.createRange();
    range.setStart(node, node.length);
    range.collapse(true);
    dom.window.getSelection()!.removeAllRanges();
    dom.window.getSelection()!.addRange(range);
    node.appendData(text);
    range.setStart(node, node.length);
    paragraph.dispatchEvent(
      new dom.window.InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }),
    );
    await tick();
  };

  it('preserves remote Markdown bytes during a subsequent unrelated local edit', async () => {
    const editor = open('Alpha\n');
    send({
      type: 'host.documentChanged',
      payload: { markdown: 'Alpha\n\n* _remote_\n', revision: 1, imageSources: {} },
    });
    await tick();
    await append(editor, 'X');
    assert.equal(applies().at(-1)!.payload.markdown, 'AlphaX\n\n* _remote_\n');
  });

  for (const source of [
    '> | A | B |\n> | - | - |\n> | old | value |\n',
    '- | A | B |\n  | - | - |\n  | old | value |\n',
    '> - | A | B |\n>   | - | - |\n>   | old | value |\n',
  ]) {
    it(
      'opens and edits a table inside a Markdown container: ' + JSON.stringify(source),
      async () => {
        open(source);
        const input = dom.window.document.querySelector<HTMLInputElement>('tbody input')!;
        assert.ok(input, 'nested table grid opens');
        input.value = 'new';
        input.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true, data: 'new' }));
        await tick();
        assert.equal(applies().at(-1)!.payload.markdown, source.replace('old', 'new'));
      },
    );
  }

  it('keeps later typing and undo history when an earlier operation is acknowledged', async () => {
    const editor = open('Alpha\n');
    await append(editor, 'X');
    await append(editor, 'Y');
    assert.equal(applies().length, 1);
    ack(0, 1);
    await tick();
    assert.equal(editor.textContent, 'AlphaXY');
    assert.equal(applies()[1].payload.markdown, 'AlphaXY\n');
    ack(1, 2);
    send({ type: 'host.executeCommand', payload: { command: 'undo' } });
    await tick();
    assert.equal(editor.textContent, 'Alpha');
    assert.equal(applies().at(-1)!.payload.markdown, 'Alpha\n');
  });

  it('waits for acknowledgment before switching to Source and retains an unsent draft', async () => {
    const editor = open('Alpha\n');
    await append(editor, 'X');
    assert.match(JSON.stringify(savedState), /AlphaX/);
    dom.window.document
      .querySelector<HTMLButtonElement>('[data-command="openRawMarkdown"]')!
      .click();
    await tick();
    assert.equal(
      messages.some((m) => m.type === 'view.executeCommand'),
      false,
    );
    ack(0, 1);
    await tick();
    assert.ok(
      messages.some(
        (m) => m.type === 'view.executeCommand' && m.payload.command === 'openRawMarkdown',
      ),
    );
    assert.doesNotMatch(JSON.stringify(savedState), /AlphaX/);
  });

  it('commits active table input immediately while preserving its DOM and caret', async () => {
    open('| Name | State |\n| :--- | ---: |\n| Alpha | Todo |\n');
    const input = dom.window.document.querySelector<HTMLInputElement>('tbody input')!;
    input.focus();
    input.value = 'AlXpha';
    input.setSelectionRange(3, 3);
    input.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true, data: 'X' }));
    await tick();
    assert.equal(dom.window.document.activeElement, input);
    assert.equal(input.selectionStart, 3);
    assert.equal(
      applies().at(-1)!.payload.markdown,
      '| Name | State |\n| :--- | ---: |\n| AlXpha | Todo |\n',
    );
  });

  it('retains unapplied table source when returning to preview and persists the buffer', () => {
    open('| Name |\n| --- |\n| Alpha |\n');
    const toggle = dom.window.document.querySelector<HTMLButtonElement>(
      '[data-testid="muninn-table-toggle-source"]',
    )!;
    toggle.click();
    const textarea = dom.window.document.querySelector<HTMLTextAreaElement>('textarea')!;
    textarea.value = '| unfinished draft';
    textarea.dispatchEvent(new dom.window.Event('input'));
    toggle.click();
    toggle.click();
    assert.equal(textarea.value, '| unfinished draft');
    assert.match(JSON.stringify(savedState), /unfinished draft/);
    assert.ok(
      messages.some(
        (m) => m.type === 'view.tableDraft' && m.payload.markdown === '| unfinished draft',
      ),
    );
  });

  it('keeps diagrams disabled and removes the duplicate preview surface', async () => {
    open('~~~mermaid\ngraph TD\nA --> B\n~~~\n');
    await new Promise((resolve) => setTimeout(resolve, 140));
    assert.equal(dom.window.document.querySelectorAll('svg').length, 0);
    // eslint-disable-next-line unicorn/no-incorrect-query-selector -- Count duplicates as well as presence.
    assert.equal(dom.window.document.querySelectorAll('#mermaid-preview-panel').length, 0);
    assert.match(
      dom.window.document.querySelector('.muninn-code-node-mermaid-preview')!.textContent!,
      /disabled/i,
    );
  });

  it('turns GFM tasks into interactive checkboxes without normalizing their source', async () => {
    open('- [ ] Alpha\n- [x] Beta\n');
    const checkbox = dom.window.document.querySelector<HTMLInputElement>('.muninn-task-checkbox')!;
    checkbox.click();
    await tick();
    assert.equal(applies()[0].payload.markdown, '- [x] Alpha\n- [x] Beta\n');
  });

  it('routes links through the host and creates unique Unicode heading anchors', () => {
    const editor = open('# Étape\n\n# Étape\n\n[Spec](design%20notes.md)\n');
    assert.deepEqual(
      [...editor.querySelectorAll('h1')].map((h) => h.id),
      ['étape', 'étape-1'],
    );
    editor
      .querySelector('a')!
      .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    assert.ok(
      messages.some((m) => m.type === 'view.openLink' && m.payload.href === 'design%20notes.md'),
    );
  });
});
