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
  let resize: () => Promise<void>;
  const send = (message: HostToViewMessage) =>
    dom.window.dispatchEvent(
      new dom.window.MessageEvent('message', {
        data: message,
        origin: dom.window.origin,
        source: dom.window as unknown as Window,
      }),
    );
  const setting = (contentWidth: 'comfortable' | 'full' | number) =>
    send({
      type: 'host.settingsChanged',
      payload: { mermaidEnabled: false, toolbarMode: 'basic', contentWidth },
    });
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

  const open = (markdown: string, retainedState?: unknown): HTMLElement => {
    dom?.window.close();
    messages = [];
    savedState = retainedState;
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
    const resizeCallbacks = new Set<() => void>();
    resize = async () => {
      for (const callback of resizeCallbacks) callback();
      await new Promise(win.requestAnimationFrame);
    };
    Object.defineProperty(win.HTMLCanvasElement.prototype, 'getContext', {
      value: () => ({
        font: '14px TestFont',
        measureText(text: string) {
          const scale = Number.parseFloat(this.font.match(/[\d.]+px/)?.[0] ?? '14px') / 14;
          return {
            width: [...text].reduce((width, glyph) => width + (glyph === 'W' ? 16 : 4), 0) * scale,
          };
        },
      }),
    });
    Object.assign(win, {
      ResizeObserver: class {
        private readonly notify: () => void;
        private readonly targets = new Set<Element>();
        constructor(callback: ResizeObserverCallback) {
          this.notify = () => callback([], this as unknown as ResizeObserver);
        }
        observe(target: Element) {
          this.targets.add(target);
          resizeCallbacks.add(this.notify);
        }
        unobserve(target: Element) {
          this.targets.delete(target);
          if (this.targets.size === 0) resizeCallbacks.delete(this.notify);
        }
        disconnect() {
          this.targets.clear();
          resizeCallbacks.delete(this.notify);
        }
      },
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

  const append = async (
    editor: HTMLElement,
    text: string,
    paragraph: HTMLElement = editor.querySelector('p')!,
  ): Promise<void> => {
    if (!(paragraph.lastChild instanceof dom.window.Text)) {
      paragraph.append(dom.window.document.createTextNode(''));
    }
    const node = paragraph.lastChild as Text;
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

  const enterAtEnd = async (editor: HTMLElement, paragraph: Element): Promise<void> => {
    editor.focus();
    const range = dom.window.document.createRange();
    range.selectNodeContents(paragraph);
    range.collapse(false);
    dom.window.getSelection()!.removeAllRanges();
    dom.window.getSelection()!.addRange(range);
    dom.window.document.dispatchEvent(new dom.window.Event('selectionchange'));
    await tick();
    editor.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }),
    );
    await tick();
    if (applies().length > 0) ack(applies().length - 1, applies().length);
  };

  it('changes only the document zoom, shows its percentage and enforces 50–200% bounds', async () => {
    const editor = open('Keep **this** exactly.\r\n');
    const button = (command: string) => {
      const control = dom.window.document.querySelector<HTMLButtonElement>(
        '.muninn-toolbar [data-command="' + command + '"]',
      );
      assert.ok(control, command + ' is reachable from the toolbar');
      return control;
    };
    const surface = dom.window.document.querySelector<HTMLElement>('#editor')!;
    const original = editor.textContent;
    assert.equal(button('resetZoom').textContent, '100%');
    button('zoomIn').click();
    assert.equal(surface.style.zoom, '1.1');
    assert.equal(button('resetZoom').textContent, '110%');
    assert.match(button('resetZoom').getAttribute('aria-label')!, /100%.*110%/);
    button('zoomIn').focus();
    for (let count = 0; count < 20; count++) button('zoomIn').click();
    assert.equal(surface.style.zoom, '2');
    assert.equal(button('zoomIn').disabled, true);
    assert.equal(dom.window.document.activeElement, button('resetZoom'));
    button('zoomOut').focus();
    for (let count = 0; count < 30; count++) button('zoomOut').click();
    assert.equal(surface.style.zoom, '0.5');
    assert.equal(button('zoomOut').disabled, true);
    assert.equal(dom.window.document.activeElement, button('resetZoom'));
    button('resetZoom').click();
    assert.equal(surface.style.zoom, '1');
    assert.equal(button('resetZoom').textContent, '100%');
    assert.equal(button('zoomIn').disabled, false);
    assert.equal(button('zoomOut').disabled, false);
    assert.equal(dom.window.document.querySelector<HTMLElement>('.muninn-toolbar')!.style.zoom, '');
    assert.equal(editor.textContent, original);
    await tick();
    assert.equal(applies().length, 0);
    assert.equal(
      messages.some((message) => message.type === 'view.executeCommand'),
      false,
    );
  });

  it('fits responsively and resets to the latest configured reading width', async () => {
    open('# Width\n\nKeep this.\n');
    const button = (command: string) => {
      const control = dom.window.document.querySelector<HTMLButtonElement>(
        '.muninn-toolbar [data-command="' + command + '"]',
      );
      assert.ok(control, command);
      return control;
    };
    const shell = dom.window.document.querySelector<HTMLElement>('#editor-shell')!;
    const surface = dom.window.document.querySelector<HTMLElement>('#editor')!;
    assert.equal(shell.style.getPropertyValue('--muninn-content-width'), '70ch');
    button('zoomIn').click();
    button('fitToWidth').click();
    assert.equal(surface.style.zoom, '1');
    assert.equal(shell.style.getPropertyValue('--muninn-content-width'), 'none');
    assert.equal(button('fitToWidth').getAttribute('aria-pressed'), 'true');
    button('zoomIn').click();
    setting(90);
    await resize();
    assert.equal(surface.style.zoom, '1.1');
    assert.equal(shell.style.getPropertyValue('--muninn-content-width'), 'none');
    button('resetZoom').click();
    assert.equal(surface.style.zoom, '1');
    assert.equal(button('fitToWidth').getAttribute('aria-pressed'), 'false');
    assert.equal(shell.style.getPropertyValue('--muninn-content-width'), '90ch');
    setting('full');
    button('fitToWidth').click();
    button('resetZoom').click();
    assert.equal(shell.style.getPropertyValue('--muninn-content-width'), 'none');
    setting('comfortable');
    assert.equal(shell.style.getPropertyValue('--muninn-content-width'), '70ch');
    await tick();
    assert.equal(applies().length, 0);
    assert.equal(
      messages.some((message) => message.type === 'view.executeCommand'),
      false,
    );
  });

  it('preserves a text selection and history across local zoom and fit changes', async () => {
    const source = 'Alpha beta gamma.\r\n';
    const editor = open(source);
    editor.focus();
    const node = editor.querySelector('p')!.firstChild!;
    const range = dom.window.document.createRange();
    range.setStart(node, 6);
    range.setEnd(node, 10);
    dom.window.getSelection()!.removeAllRanges();
    dom.window.getSelection()!.addRange(range);
    dom.window.document.dispatchEvent(new dom.window.Event('selectionchange'));
    await tick();
    const click = (command: string) => {
      const button = dom.window.document.querySelector<HTMLButtonElement>(
        '.muninn-toolbar [data-command="' + command + '"]',
      )!;
      button.focus();
      button.click();
    };
    for (const command of ['zoomIn', 'fitToWidth', 'zoomOut', 'resetZoom']) click(command);
    await tick();
    assert.equal(applies().length, 0);
    click('toggleBold');
    await tick();
    assert.equal(applies()[0].payload.markdown, 'Alpha **beta** gamma.\r\n');
    ack(0, 1);
    click('zoomIn');
    click('undo');
    await tick();
    assert.equal(applies()[1].payload.markdown, source);
    ack(1, 2);
    click('fitToWidth');
    click('redo');
    await tick();
    assert.equal(applies()[2].payload.markdown, 'Alpha **beta** gamma.\r\n');
  });

  it('updates visible zoom help and retains unapplied table drafts', async () => {
    const editor = open('| A |\n| --- |\n| Alpha |\n');
    const button = (command: string) =>
      dom.window.document.querySelector<HTMLButtonElement>(
        '.muninn-toolbar [data-command="' + command + '"]',
      )!;
    button('zoomIn').click();
    button('resetZoom').focus();
    const tooltip = dom.window.document.querySelector<HTMLElement>('[role="tooltip"]')!;
    assert.match(tooltip.textContent!, /110%/);
    button('resetZoom').click();
    assert.equal(tooltip.textContent, 'Reset zoom to 100% (current: 100%)');
    editor.querySelector<HTMLButtonElement>('[data-testid="muninn-table-toggle-source"]')!.click();
    const draft = editor.querySelector<HTMLTextAreaElement>('textarea')!;
    draft.value = 'unapplied zoom draft';
    draft.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    draft.focus();
    draft.setSelectionRange(2, 7);
    for (const command of ['zoomIn', 'fitToWidth', 'zoomOut', 'resetZoom']) button(command).click();
    assert.deepEqual(
      [draft.value, draft.selectionStart, draft.selectionEnd],
      ['unapplied zoom draft', 2, 7],
    );
    await tick();
    assert.equal(applies().length, 0);
    open('Another view.\n');
    assert.equal(button('resetZoom').textContent, '100%');
    assert.equal(button('fitToWidth').getAttribute('aria-pressed'), 'false');
  });

  it('highlights fenced code without changing literal text or surrounding Markdown', async () => {
    const source =
      '# Keep  \r\n\r\n~~~javascript\r\nconst greeting = "<b>🚀 & hello</b>";\r\n~~~\r\n\r\nAfter\r\n';
    const editor = open(source);
    const code = editor.querySelector('pre code')!;
    assert.equal(code.querySelector('.hljs-keyword')?.textContent, 'const');
    assert.equal(code.textContent, 'const greeting = "<b>🚀 & hello</b>";');
    assert.equal(code.querySelectorAll('b').length, 0);
    await tick();
    assert.equal(applies().length, 0);
    await append(editor, '!');
    assert.equal(
      applies().at(-1)?.payload.markdown,
      '# Keep  \r\n\r\n~~~javascript\r\nconst greeting = "<b>🚀 & hello</b>";\r\n~~~\r\n\r\nAfter!\r\n',
    );
  });

  it('highlights each supported code language and its common aliases', () => {
    for (const [language, code] of [
      ['typescript', 'const value: number = 1;'],
      ['tsx', 'const view = <b>Hi</b>;'],
      ['jsx', 'const view = <b>Hi</b>;'],
      ['python', 'def greet():\n    return "hi"'],
      ['go', 'func main() {}'],
      ['rust', 'fn main() {}'],
      ['java', 'public class Main {}'],
      ['csharp', 'public class Main {}'],
      ['cpp', 'int main() { return 0; }'],
      ['bash', 'echo "hello"'],
      ['json', '{"value": 1}'],
      ['yaml', 'value: true'],
      ['sql', 'SELECT * FROM users;'],
      ['markdown', '# Hello'],
      ['js', 'const value = 1;'],
      ['ts', 'const value: number = 1;'],
      ['py', 'def greet(): pass'],
    ]) {
      const editor = open('```' + language + '\n' + code + '\n```\n');
      assert.ok(editor.querySelector('pre code span[class*="hljs-"]'), language);
      assert.equal(editor.querySelector('pre code')!.textContent, code, language);
      assert.equal(applies().length, 0, language);
    }
  });

  it('updates code highlighting while editing, changing language and undoing', async () => {
    const source = 'Before\n\n```javascript\nconst first = 1;\n```\n\nAfter\n';
    const editor = open(source);
    const code = editor.querySelector<HTMLElement>('pre code')!;
    await append(editor, '\nconst next = 2;', code);
    assert.equal(code.querySelectorAll('.hljs-keyword').length, 2);
    assert.equal(
      applies().at(-1)?.payload.markdown,
      'Before\n\n```javascript\nconst first = 1;\nconst next = 2;\n```\n\nAfter\n',
    );
    ack(0, 1);
    send({ type: 'host.executeCommand', payload: { command: 'undo' } });
    await tick();
    assert.equal(applies().at(-1)?.payload.markdown, source);
    assert.equal(code.querySelectorAll('.hljs-keyword').length, 1);
    ack(1, 2);
    const language = editor.querySelector<HTMLSelectElement>('.muninn-code-node-language')!;
    language.value = '';
    language.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await tick();
    assert.equal(code.querySelectorAll('span').length, 0);
    assert.equal(code.textContent, 'const first = 1;');
    ack(2, 3);
    send({ type: 'host.executeCommand', payload: { command: 'undo' } });
    await tick();
    assert.equal(code.querySelector('.hljs-keyword')?.textContent, 'const');
    assert.equal(applies().at(-1)?.payload.markdown, source);
  });

  it('keeps unknown, omitted and Mermaid code languages editable as plain text', async () => {
    for (const language of ['', 'Unknown-Lang', 'mermaid']) {
      const source = '~~~' + language + '\nraw <script>& text\n~~~\n';
      const editor = open(source);
      const code = editor.querySelector<HTMLElement>('pre code')!;
      assert.equal(code.querySelectorAll('span').length, 0);
      await append(editor, '!', code);
      assert.equal(
        applies().at(-1)?.payload.markdown,
        '~~~' + language + '\nraw <script>& text!\n~~~\n',
      );
    }
  });

  it('keeps code above the highlighting limit fully editable as plain text', async () => {
    const codeText = 'const value = 1;\n'.repeat(1300).trimEnd();
    const editor = open('```javascript\n' + codeText + '\n```\n');
    const code = editor.querySelector<HTMLElement>('pre code')!;
    assert.equal(code.querySelectorAll('span').length, 0);
    assert.equal(code.textContent, codeText);
    await append(editor, '!', code);
    assert.equal(applies().at(-1)?.payload.markdown, '```javascript\n' + codeText + '!\n```\n');
  });

  it('continues a bullet list with a sibling item and preserves typed Markdown', async () => {
    const editor = open('- First\n- Second\n');
    await enterAtEnd(editor, editor.querySelector('li:last-child p')!);
    await append(
      editor,
      'Next',
      [...editor.querySelectorAll<HTMLParagraphElement>('li p')].at(-1)!,
    );
    assert.equal(applies().at(-1)?.payload.markdown, '- First\n- Second\n- Next\n');
  });

  it('continues a checked task with an unchecked sibling and preserves the old marker', async () => {
    const editor = open('- [X] Done\n');
    await enterAtEnd(editor, editor.querySelector('li p')!);
    await append(
      editor,
      'Next',
      [...editor.querySelectorAll<HTMLParagraphElement>('li p')].at(-1)!,
    );
    assert.equal(applies().at(-1)?.payload.markdown, '- [X] Done\n- [ ] Next\n');
  });

  it('splits formatted task text without formatting its new checkbox marker', async () => {
    for (const [source, selector, expected] of [
      ['- [X] **AlphaBeta**\n', 'strong', '- [X] **Alpha**\n- [ ] **Beta**\n'],
      ['- [X] *AlphaBeta*\n', 'em', '- [X] *Alpha*\n- [ ] *Beta*\n'],
      ['- [X] `AlphaBeta`\n', 'code', '- [X] `Alpha`\n- [ ] `Beta`\n'],
    ]) {
      const editor = open(source);
      editor.focus();
      const range = dom.window.document.createRange();
      range.setStart(editor.querySelector(selector)!.firstChild!, 5);
      range.collapse(true);
      dom.window.getSelection()!.removeAllRanges();
      dom.window.getSelection()!.addRange(range);
      dom.window.document.dispatchEvent(new dom.window.Event('selectionchange'));
      await tick();
      editor.dispatchEvent(
        new dom.window.KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }),
      );
      await tick();
      assert.equal(applies().at(-1)?.payload.markdown, expected);
    }
  });

  it('continues a non-one ordered list with its parenthesis delimiter', async () => {
    const editor = open('7) First\n8) Second\n');
    await enterAtEnd(editor, editor.querySelector('li:last-child p')!);
    await append(
      editor,
      'Next',
      [...editor.querySelectorAll<HTMLParagraphElement>('li p')].at(-1)!,
    );
    assert.equal(applies().at(-1)?.payload.markdown, '7) First\n8) Second\n9) Next\n');
  });

  it('preserves existing indentation when an ordered list grows by a digit', async () => {
    for (const [source, expected] of [
      ['9. First\n', '9. First\n10. Next\n'],
      ['9) First\n', '9) First\n10) Next\n'],
      ['99. First\n', '99. First\n100. Next\n'],
      ['99) First\n', '99) First\n100) Next\n'],
      ['9) First\n   wrapped\n', '9) First\n   wrapped\n10) Next\n'],
    ]) {
      const editor = open(source);
      await enterAtEnd(editor, editor.querySelector('li p')!);
      await append(
        editor,
        'Next',
        [...editor.querySelectorAll<HTMLParagraphElement>('li p')].at(-1)!,
      );
      assert.equal(applies().at(-1)?.payload.markdown, expected);
    }
  });

  for (const marker of ['-', '+', '*', '7.', '7)', '- [ ]', '- [x]', '- [X]']) {
    for (const eol of ['\n', '\r\n']) {
      for (const terminal of ['', eol]) {
        it(
          'continues list syntax exactly: ' + JSON.stringify({ marker, eol, terminal }),
          async () => {
            const prefix = '---' + eol + 'title: Untouched' + eol + '---' + eol + eol;
            const editor = open(prefix + marker + ' First' + terminal);
            await enterAtEnd(editor, editor.querySelector('li p')!);
            await append(
              editor,
              'Next',
              [...editor.querySelectorAll<HTMLParagraphElement>('li p')].at(-1)!,
            );
            let next = marker;
            if (marker.startsWith('7')) next = marker.replace('7', '8');
            else if (marker.startsWith('- [')) next = '- [ ]';
            assert.equal(
              applies().at(-1)?.payload.markdown,
              prefix + marker + ' First' + eol + next + ' Next' + terminal,
            );
          },
        );
      }
    }
  }

  it('continues a nested list while retaining existing indentation and siblings', async () => {
    const editor = open('- Parent\n  + First\n  + Second\n- Last\n');
    await enterAtEnd(editor, editor.querySelectorAll('li p')[2]);
    await append(editor, 'Next', editor.querySelectorAll<HTMLParagraphElement>('li p')[3]);
    assert.equal(
      applies().at(-1)?.payload.markdown,
      '- Parent\n  + First\n  + Second\n  + Next\n- Last\n',
    );
  });

  it('continues a loose list without tightening its existing items', async () => {
    const editor = open('+ First\n\n+ Second\n');
    await enterAtEnd(editor, editor.querySelector('li:last-child p')!);
    await append(
      editor,
      'Next',
      [...editor.querySelectorAll<HTMLParagraphElement>('li p')].at(-1)!,
    );
    assert.equal(applies().at(-1)?.payload.markdown, '+ First\n\n+ Second\n\n+ Next\n');
  });

  it('exits an empty task item without adding another checkbox', async () => {
    const editor = open('- [X] Done\n- [ ]\n');
    await enterAtEnd(editor, editor.querySelector('li:last-child p')!);
    assert.equal(editor.querySelectorAll('li').length, 1);
    assert.equal(editor.lastElementChild?.tagName, 'P');
    await append(editor, 'Next', editor.lastElementChild as HTMLParagraphElement);
    assert.equal(applies().at(-1)?.payload.markdown, '- [X] Done\n\nNext\n');
  });

  it('exits an empty bullet item into a paragraph', async () => {
    const editor = open('- First\n-\n');
    await enterAtEnd(editor, editor.querySelector('li:last-child p')!);
    assert.equal(editor.querySelectorAll('li').length, 1);
    assert.equal(editor.lastElementChild?.tagName, 'P');
    await append(editor, 'Next', editor.lastElementChild as HTMLParagraphElement);
    assert.equal(applies().at(-1)?.payload.markdown, '- First\n\nNext\n');
  });

  for (const empty of ['+', '+ [ ]']) {
    it('lifts an empty nested item one level: ' + empty, async () => {
      const editor = open('- Parent\n  + Child\n  ' + empty + '\n');
      await enterAtEnd(editor, [...editor.querySelectorAll('li p')].at(-1)!);
      assert.equal(editor.querySelectorAll(':scope > ul > li').length, 2);
      assert.equal(editor.querySelectorAll(':scope > ul > li > ul > li').length, 1);
      await append(
        editor,
        'Next',
        [...editor.querySelectorAll<HTMLParagraphElement>('li p')].at(-1)!,
      );
      assert.equal(applies().at(-1)?.payload.markdown, '- Parent\n  + Child\n- Next\n');
    });
  }

  it('keeps paragraph Enter outside the list command', async () => {
    const editor = open('First\n');
    await enterAtEnd(editor, editor.querySelector('p')!);
    await append(editor, 'Next', [...editor.querySelectorAll<HTMLParagraphElement>('p')].at(-1)!);
    assert.equal(applies().at(-1)?.payload.markdown, 'First\n\nNext\n');
  });

  it('inserts a newline in a code block inside a list without splitting the item', async () => {
    for (const eol of ['\n', '\r\n']) {
      const editor = open(
        '- item\n\n  ```js\n  alpha\n  ```\n\n- next\n'.replaceAll('\n', () => eol),
      );
      await enterAtEnd(editor, editor.querySelector('li code')!);
      assert.equal(
        applies().at(-1)?.payload.markdown,
        '- item\n\n  ```js\n  alpha\n  \n  ```\n\n- next\n'.replaceAll('\n', () => eol),
      );
      assert.equal(editor.querySelectorAll('li').length, 2);
      assert.equal(editor.querySelectorAll('li code').length, 1);
      assert.equal(editor.querySelector('li code')!.textContent, 'alpha\n');
    }
  });

  it('keeps Shift+Enter splitting a paragraph inside the same list item', async () => {
    const editor = open('- First\n');
    await append(editor, '');
    const shiftEnter = new dom.window.KeyboardEvent('keydown', {
      key: 'Enter',
      keyCode: 13,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    editor.dispatchEvent(shiftEnter);
    await tick();
    assert.equal(shiftEnter.defaultPrevented, true);
    assert.equal(editor.querySelectorAll('li').length, 1);
    assert.equal(editor.querySelectorAll('li p').length, 2);
  });

  it('handles keyboard undo and redo once and consumes empty history', async () => {
    const editor = open('- First\n');
    const press = async (shiftKey = false) => {
      const event = new dom.window.KeyboardEvent('keydown', {
        key: 'z',
        code: 'KeyZ',
        ctrlKey: true,
        shiftKey,
        bubbles: true,
        cancelable: true,
      });
      editor.dispatchEvent(event);
      await tick();
      assert.equal(event.defaultPrevented, true);
      if (applies().length > 0) ack(applies().length - 1, applies().length);
    };
    await enterAtEnd(editor, editor.querySelector('li p')!);
    await append(
      editor,
      'Next',
      [...editor.querySelectorAll<HTMLParagraphElement>('li p')].at(-1)!,
    );
    ack(applies().length - 1, applies().length);
    await press();
    assert.equal(applies().at(-1)?.payload.markdown, '- First\n');
    const count = applies().length;
    await press();
    assert.equal(applies().length, count);
    await press(true);
    assert.equal(applies().at(-1)?.payload.markdown, '- First\n- Next\n');
  });

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

  for (const eol of ['\n', '\r\n']) {
    for (const finalNewline of [true, false]) {
      for (const outerPipes of [true, false]) {
        it(`preserves the demo around a cell edit and undo/redo (${JSON.stringify(eol)}, final newline: ${finalNewline}, outer pipes: ${outerPipes})`, async () => {
          let source = fs.readFileSync('docs/demos/source-preservation.md', 'utf8');
          if (!outerPipes) source = source.replaceAll(/^\| (.*) \|$/gm, '$1');
          if (!finalNewline) source = source.replace(/\n$/, '');
          source = source.replaceAll('\n', () => eol);
          const expected = source.replace('Draft', 'Done');
          const editor = open(source);
          assert.equal(applies().length, 0);
          const cell = editor.querySelector<HTMLInputElement>(
            '[data-table-row="1"][data-table-column="1"]',
          )!;
          assert.equal(cell.value, 'Draft');
          cell.focus();
          cell.value = 'Done';
          cell.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true, data: 'Done' }));
          await tick();
          assert.equal(applies().at(-1)!.payload.markdown, expected);
          ack(0, 1);
          for (const [command, markdown] of [
            ['undo', source],
            ['redo', expected],
          ] as const) {
            send({ type: 'host.executeCommand', payload: { command } });
            await tick();
            assert.equal(applies().at(-1)!.payload.markdown, markdown);
            ack(applies().length - 1, applies().length);
          }
          open(expected);
          assert.equal(applies().length, 0);
          assert.equal(
            dom.window.document.querySelector<HTMLInputElement>(
              '[data-table-row="1"][data-table-column="1"]',
            )!.value,
            'Done',
          );
        });
      }
    }
  }

  it('applies raw table source without rewriting the demo list, code or references', async () => {
    const source = fs.readFileSync('docs/demos/source-preservation.md', 'utf8');
    const editor = open(source);
    editor.querySelector<HTMLButtonElement>('[data-testid="muninn-table-toggle-source"]')!.click();
    const draft = editor.querySelector<HTMLTextAreaElement>('textarea')!;
    draft.value = draft.value.replace('Draft', 'Done');
    draft.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    assert.equal(applies().length, 0);
    editor.querySelector<HTMLButtonElement>('[data-testid="muninn-table-apply-source"]')!.click();
    await tick();
    assert.equal(applies().at(-1)!.payload.markdown, source.replace('Draft', 'Done'));
  });

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

  it('adds a one-cell row to a one-column table through the native command', async () => {
    open('| Name |\n| :--- |\n| Alpha\\|Beta |\n');
    send({ type: 'host.executeCommand', payload: { command: 'addTableRow' } });
    await tick();
    assert.equal(
      applies().at(-1)?.payload.markdown,
      '| Name |\n| :--- |\n| Alpha\\|Beta |\n|  |\n',
    );
  });

  it('targets the focused table when a native command follows cell editing', async () => {
    open('| First |\n| --- |\n| A |\n\n| Second |\n| --- |\n| B |\n');
    const input = dom.window.document.querySelectorAll<HTMLInputElement>('tbody input')[1];
    input.focus();
    send({ type: 'host.executeCommand', payload: { command: 'addTableRow' } });
    await tick();
    assert.equal(
      applies().at(-1)?.payload.markdown,
      '| First |\n| --- |\n| A |\n\n| Second |\n| --- |\n| B |\n|  |\n',
    );
  });

  for (const action of ['native', 'grid']) {
    it(
      'preserves alignment, escaped pipes and undo when adding a column via ' + action,
      async () => {
        open('| A | B |\n| :--- | ---: |\n| x\\|y | z |\n');
        if (action === 'native')
          send({ type: 'host.executeCommand', payload: { command: 'addTableColumn' } });
        else {
          dom.window.document
            .querySelector<HTMLButtonElement>(
              '.muninn-table-node-actions button[aria-label="Add to table"]',
            )!
            .click();
          const request = messages.at(-1) as Extract<
            ViewToHostMessage,
            { type: 'view.requestPicker' }
          >;
          send({
            type: 'host.pickerResult',
            payload: { requestId: request.payload.requestId, command: 'addTableColumn' },
          });
        }
        await tick();
        assert.equal(
          applies().at(-1)?.payload.markdown,
          '| A | B | Column 3 |\n| :--- | ---: | --- |\n| x\\|y | z |  |\n',
        );
        ack(0, 1);
        send({ type: 'host.executeCommand', payload: { command: 'undo' } });
        await tick();
        assert.equal(
          applies().at(-1)?.payload.markdown,
          '| A | B |\n| :--- | ---: |\n| x\\|y | z |\n',
        );
      },
    );
  }

  it('reports a rejected native table edit while draft recovery is pending', async () => {
    open('| Name |\n| --- |\n| Alpha |\n');
    const input = dom.window.document.querySelector<HTMLInputElement>('tbody input')!;
    input.value = 'Beta';
    input.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true, data: 'Beta' }));
    send({
      type: 'host.applyResult',
      payload: {
        operationId: applies()[0].payload.operationId,
        revision: 0,
        ok: false,
        markdown: '| Name |\n| --- |\n| Alpha |\n',
        imageSources: {},
      },
    });

    send({ type: 'host.executeCommand', payload: { command: 'addTableRow' } });
    await tick();
    assert.equal(applies().length, 1);
    assert.equal(dom.window.document.querySelectorAll('tbody tr').length, 1);
    assert.match(
      dom.window.document.querySelector('#status-alert')!.textContent!,
      /draft is retained.*Source/,
    );
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

  it('fits table cells to their font and glyphs on opening, editing and font resizing', async () => {
    open('| Thin | Wide |\n| --- | --- |\n| iiiiiiiiiiiiiiiiiii | WWWWWWWWWWWWWWWWWWW |\n');
    const style = dom.window.document.createElement('style');
    style.textContent = '.muninn-table-node-cell { font: 14px TestFont; padding: 4px 6px; }';
    dom.window.document.head.append(style);
    await resize();
    const [thin, wide] = dom.window.document.querySelectorAll<HTMLInputElement>('tbody input');
    const fits = (input: HTMLInputElement, minimum: number, maximum: number) => {
      assert.match(input.style.minInlineSize, /px$/);
      const width = Number.parseFloat(input.style.minInlineSize);
      assert.ok(width >= minimum && width <= maximum, input.value + ': ' + width);
    };
    fits(thin, 88, 104);
    fits(wide, 316, 332);

    thin.focus();
    thin.value = 'WWWWWWWWWWWWWWWWWWW';
    thin.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true }));
    await tick();
    fits(thin, 316, 332);
    assert.equal(
      applies().at(-1)?.payload.markdown,
      '| Thin | Wide |\n| --- | --- |\n| WWWWWWWWWWWWWWWWWWW | WWWWWWWWWWWWWWWWWWW |\n',
    );
    ack(0, 1);

    thin.value = 'iiiiiiiiiiiiiiiiiii';
    thin.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true }));
    await tick();
    fits(thin, 88, 104);
    assert.equal(
      applies().at(-1)?.payload.markdown,
      '| Thin | Wide |\n| --- | --- |\n| iiiiiiiiiiiiiiiiiii | WWWWWWWWWWWWWWWWWWW |\n',
    );

    style.textContent = '.muninn-table-node-cell { font: 28px TestFont; padding: 4px 6px; }';
    await resize();
    fits(thin, 164, 180);
    fits(wide, 620, 636);
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

  it('flushes the document without applying or discarding a valid raw table draft', async () => {
    open('| Name |\n| --- |\n| Alpha |\n');
    dom.window.document
      .querySelector<HTMLButtonElement>('[data-testid="muninn-table-toggle-source"]')!
      .click();
    const textarea = dom.window.document.querySelector<HTMLTextAreaElement>('textarea')!;
    textarea.value = '| Name |\n| --- |\n| Beta |';
    textarea.dispatchEvent(new dom.window.Event('input'));

    send({ type: 'host.requestFlush', payload: { requestId: 7 } });
    await tick();

    assert.equal(applies().length, 0);
    assert.deepEqual(structuredClone(messages.at(-1)), {
      type: 'view.flushComplete',
      payload: { requestId: 7, ok: true },
    });
    assert.match(JSON.stringify(savedState), /Beta/);
    assert.equal(textarea.value, '| Name |\n| --- |\n| Beta |');
  });

  it('keeps the Source guidance and raw draft when a table edit cannot preserve structure', () => {
    open('| Name |\n| --- |\n| Alpha |\n');
    dom.window.document
      .querySelector<HTMLButtonElement>('[data-testid="muninn-table-toggle-source"]')!
      .click();
    const textarea = dom.window.document.querySelector<HTMLTextAreaElement>('textarea')!;
    textarea.value = '| Name |\n| --- |\n| Beta |\n\nParagraph';
    textarea.dispatchEvent(new dom.window.Event('input'));
    dom.window.document
      .querySelector<HTMLButtonElement>('[data-testid="muninn-table-apply-source"]')!
      .click();
    assert.equal(applies().length, 0);
    assert.match(dom.window.document.querySelector('#status-alert')!.textContent!, /Use Source/);
    assert.equal(textarea.hasAttribute('aria-invalid'), false);
    assert.match(
      dom.window.document.querySelector('[data-testid="muninn-table-source-feedback"]')!
        .textContent!,
      /Use Source/,
    );
    assert.match(JSON.stringify(savedState), /Paragraph/);
    assert.equal(
      dom.window.document.querySelector<HTMLInputElement>('tbody input')!.value,
      'Alpha',
    );
  });

  it('explains invalid table syntax, associates the error and retains a correctable draft', async () => {
    open('| Name |\n| --- |\n| Alpha |\n');
    dom.window.document
      .querySelector<HTMLButtonElement>('[data-testid="muninn-table-toggle-source"]')!
      .click();
    const textarea = dom.window.document.querySelector<HTMLTextAreaElement>('textarea')!;
    const hint = textarea.getAttribute('aria-describedby')!;
    textarea.value = 'Ordinary prose';
    textarea.dispatchEvent(new dom.window.Event('input'));
    dom.window.document
      .querySelector<HTMLButtonElement>('[data-testid="muninn-table-apply-source"]')!
      .click();
    await tick();
    assert.equal(textarea.getAttribute('aria-invalid'), 'true');
    const feedback = dom.window.document.querySelector<HTMLElement>(
      '[data-testid="muninn-table-source-feedback"]',
    )!;
    assert.match(feedback.textContent!, /header row.*separator row/i);
    assert.ok(textarea.getAttribute('aria-describedby')!.split(' ').includes(hint));
    assert.ok(textarea.getAttribute('aria-describedby')!.split(' ').includes(feedback.id));
    assert.equal(feedback.hasAttribute('aria-live'), false);
    assert.match(
      dom.window.document.querySelector('#status-alert')!.textContent!,
      /header row.*separator row/i,
    );
    assert.equal(dom.window.document.activeElement, textarea);
    assert.match(JSON.stringify(savedState), /Ordinary prose/);
    assert.equal(applies().length, 0);
    textarea.value = '| Name |\n| --- |\n| Beta |';
    textarea.dispatchEvent(new dom.window.Event('input'));
    assert.equal(textarea.hasAttribute('aria-invalid'), false);
    assert.equal(feedback.hidden, true);
    assert.equal(textarea.getAttribute('aria-describedby'), hint);
    dom.window.document
      .querySelector<HTMLButtonElement>('[data-testid="muninn-table-apply-source"]')!
      .click();
    await tick();
    assert.equal(applies().length, 1);
    assert.equal(applies()[0].payload.markdown, '| Name |\n| --- |\n| Beta |\n');
    assert.equal(dom.window.document.querySelector('#status-alert')!.hasAttribute('hidden'), true);
    assert.equal((dom.window.document.activeElement as HTMLElement).dataset.tableRow, '0');
  });

  for (const draft of ['| Name |\n| --- |\n| Beta |', '| unfinished draft']) {
    it(
      'retains unapplied raw source through Source and reload: ' + JSON.stringify(draft),
      async () => {
        open('| Name |\n| --- |\n| Alpha |\n');
        dom.window.document
          .querySelector<HTMLButtonElement>('[data-testid="muninn-table-toggle-source"]')!
          .click();
        const textarea = dom.window.document.querySelector<HTMLTextAreaElement>('textarea')!;
        textarea.value = draft;
        textarea.dispatchEvent(new dom.window.Event('input'));
        dom.window.document
          .querySelector<HTMLButtonElement>('[data-command="openRawMarkdown"]')!
          .click();
        await tick();
        assert.equal(applies().length, 0);
        assert.ok(messages.some((m) => m.type === 'view.executeCommand'));

        open('| Name |\n| --- |\n| Alpha |\n', savedState);
        assert.equal(dom.window.document.querySelector('textarea')!.value, draft);
        assert.equal(
          dom.window.document.querySelector<HTMLInputElement>('tbody input')!.value,
          'Alpha',
        );
        assert.ok(
          messages.some((m) => m.type === 'view.tableDraft' && m.payload.markdown === draft),
        );
      },
    );
  }

  it('does not redirect a detached table action to an identical replacement table', () => {
    open('| Name |\n| --- |\n| Alpha |\n');
    const button = dom.window.document.querySelector<HTMLButtonElement>(
      '.muninn-table-node-actions button',
    )!;
    send({
      type: 'host.documentChanged',
      payload: { markdown: 'Gone\n', revision: 1, imageSources: {} },
    });
    assert.equal(button.isConnected, false);
    send({
      type: 'host.documentChanged',
      payload: { markdown: '| Name |\n| --- |\n| Alpha |\n', revision: 2, imageSources: {} },
    });
    button.click();
    assert.equal(applies().length, 0);
    assert.equal(dom.window.document.querySelectorAll('tbody tr').length, 1);
  });

  it('accepts host messages only from the webview origin without relying on source identity', () => {
    const editor = open('Alpha\n');
    for (const origin of ['https://untrusted.invalid', 'null', '']) {
      dom.window.dispatchEvent(
        new dom.window.MessageEvent('message', {
          data: {
            type: 'host.documentChanged',
            payload: { markdown: 'Untrusted\n', revision: 1, imageSources: {} },
          },
          origin,
          source: dom.window as unknown as Window,
        }),
      );
      assert.equal(editor.textContent, 'Alpha');
    }
    dom.window.dispatchEvent(
      new dom.window.MessageEvent('message', {
        data: {
          type: 'host.documentChanged',
          payload: { markdown: 'Trusted\n', revision: 1, imageSources: {} },
        },
        origin: dom.window.origin,
      }),
    );
    assert.equal(editor.textContent, 'Trusted');
  });

  it('ignores malformed host messages and removes the listener on unload', async () => {
    const editor = open('Alpha\n');
    for (const data of [undefined, { type: 'host.documentChanged', payload: { markdown: 42 } }])
      dom.window.dispatchEvent(
        new dom.window.MessageEvent('message', {
          data,
          origin: dom.window.origin,
          source: dom.window as unknown as Window,
        }),
      );
    assert.equal(editor.textContent, 'Alpha');
    dom.window.dispatchEvent(new dom.window.Event('beforeunload'));
    send({
      type: 'host.documentChanged',
      payload: { markdown: 'After unload\n', revision: 1, imageSources: {} },
    });
    await tick();
    assert.equal(editor.textContent, 'Alpha');
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

  it('makes a rendered link focusable without changing its Markdown', async () => {
    const editor = open('[Spec](design%20notes.md)\n');
    const link = editor.querySelector('a')!;
    assert.equal(link.tabIndex, 0);
    link.focus();
    await tick();
    assert.equal(dom.window.document.activeElement, link);
    assert.equal(applies().length, 0);
  });

  const selectBlocks = async (editor: HTMLElement, first: Element, last = first): Promise<void> => {
    editor.focus();
    const range = dom.window.document.createRange();
    range.selectNodeContents(first);
    range.setEnd(last, last.childNodes.length);
    dom.window.getSelection()!.removeAllRanges();
    dom.window.getSelection()!.addRange(range);
    dom.window.document.dispatchEvent(new dom.window.Event('selectionchange'));
    await tick();
  };
  const styleButton = () =>
    dom.window.document.querySelector<HTMLButtonElement>(
      '.muninn-toolbar [data-command="chooseBlockStyle"]',
    )!;
  const chooseStyle = (command: string) => {
    styleButton().click();
    dom.window.document
      .querySelector<HTMLButtonElement>('#muninn-toolbar-menu [data-command="' + command + '"]')!
      .click();
  };

  it('opens local block styles and cancels without changing the original selection', async () => {
    const editor = open('Alpha\n\nBeta\n');
    await selectBlocks(editor, editor.querySelectorAll('p')[1]);
    const button = styleButton();
    button.focus();
    button.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    );
    const menu = dom.window.document.querySelector<HTMLElement>('#muninn-toolbar-menu')!;
    assert.equal(menu.hidden, false);
    assert.equal(menu.querySelector('[aria-checked="true"]')!.textContent, 'Paragraph');
    assert.equal(
      messages.some((message) => message.type === 'view.requestPicker'),
      false,
    );
    menu.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(menu.hidden, true);
    assert.equal(dom.window.document.activeElement, button);
    assert.equal(applies().length, 0);
    assert.equal(button.hasAttribute('aria-pressed'), false);
    chooseStyle('setHeading2');
    assert.equal(applies().at(-1)!.payload.markdown, 'Alpha\n\n## Beta\n');
    assert.equal(dom.window.getSelection()!.toString(), 'Beta');
  });

  for (const newline of ['\n', '\r\n'])
    for (const terminal of ['', newline]) {
      it(
        'chooses a heading once and preserves source bytes: ' +
          JSON.stringify({ newline, terminal }),
        async () => {
          const source = 'Alpha' + newline + newline + 'Beta' + terminal;
          const editor = open(source);
          await selectBlocks(editor, editor.querySelectorAll('p')[1]);
          chooseStyle('setHeading2');
          assert.equal(
            applies().at(-1)!.payload.markdown,
            'Alpha' + newline + newline + '## Beta' + terminal,
          );
          ack(0, 1);
          assert.equal(styleButton().textContent, 'Heading 2');
          chooseStyle('setHeading2');
          assert.equal(
            applies().length,
            1,
            'Choosing the same style must not create an edit or undo entry',
          );
          assert.equal(dom.window.getSelection()!.toString(), 'Beta');
          dom.window.document
            .querySelector<HTMLButtonElement>('.muninn-toolbar [data-command="undo"]')!
            .click();
          assert.equal(
            applies().at(-1)!.payload.markdown,
            source,
            'One Undo restores the original source',
          );
          assert.equal(
            dom.window.document.querySelector<HTMLElement>('#status-alert')!.hidden,
            true,
          );
        },
      );
    }

  it('reports mixed styles, unsupported blocks and existing Heading 4 truthfully', async () => {
    const editor = open('Alpha\n\n## Beta\n\n#### Fourth\n\n```\nCode\n```\n');
    await selectBlocks(editor, editor.querySelector('h4')!);
    assert.equal(styleButton().textContent, 'Heading 4');
    await selectBlocks(editor, editor.querySelector('p')!, editor.querySelector('h2')!);
    assert.equal(styleButton().textContent, 'Block style');
    await selectBlocks(editor, editor.querySelector('pre code')!);
    assert.equal(styleButton().textContent, 'Block style');
    assert.equal(applies().length, 0);
  });

  it('adds only to the table that opened the native picker', async () => {
    const source = '| A |\n| --- |\n| First |\n\nBetween\n\n| B |\n| --- |\n| Second |\n';
    const editor = open(source);
    const tables = editor.querySelectorAll('.muninn-table-node');
    const add = tables[1].querySelector<HTMLButtonElement>('button[aria-label="Add to table"]');
    assert.ok(add, 'One Add control replaces the row and column buttons');
    add.click();
    const request = messages.at(-1) as Extract<ViewToHostMessage, { type: 'view.requestPicker' }>;
    assert.equal(request.payload.kind, 'tableAdd');
    send({
      type: 'host.pickerResult',
      payload: { requestId: request.payload.requestId, command: 'addTableRow' },
    });
    assert.equal(tables[0].querySelectorAll('tbody tr').length, 1);
    assert.equal(
      editor.querySelectorAll('.muninn-table-node')[1].querySelectorAll('tbody tr').length,
      2,
    );
    assert.equal(applies().at(-1)!.payload.markdown, source + '|  |\n');
  });

  it('skips hidden groups and disabled history buttons while roving', () => {
    open('Alpha\n');
    styleButton().closest<HTMLElement>('[data-group]')!.hidden = true;
    const source = dom.window.document.querySelector<HTMLButtonElement>(
      '.muninn-toolbar [data-command="openRawMarkdown"]',
    )!;
    source.focus();
    source.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    assert.equal(
      dom.window.document.activeElement,
      dom.window.document.querySelector('.muninn-toolbar [data-command="toggleBold"]'),
    );
  });

  it('dismisses local formatting when external content changes and ignores detached menu actions', async () => {
    const editor = open('Alpha\n\nBeta\n');
    await selectBlocks(editor, editor.querySelectorAll('p')[1]);
    styleButton().click();
    const choice = dom.window.document.querySelector<HTMLButtonElement>(
      '#muninn-toolbar-menu [data-command="setHeading2"]',
    )!;
    send({
      type: 'host.documentChanged',
      payload: { markdown: 'Replacement\n', revision: 1, imageSources: {} },
    });
    assert.equal(
      dom.window.document.querySelector<HTMLElement>('#muninn-toolbar-menu')!.hidden,
      true,
    );
    choice.click();
    assert.equal(editor.textContent, 'Replacement');
    assert.equal(applies().length, 0);
    assert.match(
      dom.window.document.querySelector('#status-alert')!.textContent!,
      /document changed/,
    );
  });

  it('routes Image through the existing host command and leaves cancellation clean', async () => {
    open('Alpha\n');
    dom.window.document
      .querySelector<HTMLButtonElement>('.muninn-toolbar [data-command="insertImage"]')!
      .click();
    await tick();
    assert.deepEqual(
      structuredClone(messages.find((message) => message.type === 'view.executeCommand')),
      { type: 'view.executeCommand', payload: { command: 'insertImage' } },
    );
    assert.equal(applies().length, 0);
  });

  it('flushes pending edits before requesting HTML export from the toolbar', async () => {
    const editor = open('Alpha\n');
    await append(editor, 'X');
    const exportButton = dom.window.document.querySelector<HTMLButtonElement>(
      '.muninn-toolbar [data-command="exportHtml"]',
    );
    assert.ok(exportButton);
    exportButton.click();
    await tick();
    assert.equal(
      messages.some((message) => message.type === 'view.executeCommand'),
      false,
    );
    ack(0, 1);
    await tick();
    assert.deepEqual(
      structuredClone(messages.find((message) => message.type === 'view.executeCommand')),
      { type: 'view.executeCommand', payload: { command: 'exportHtml' } },
    );
    assert.equal(applies().length, 1);
    assert.equal(applies()[0].payload.markdown, 'AlphaX\n');
  });

  it('exposes local table actions and targets the selected table while retaining raw drafts', async () => {
    const source = '| A |\n| --- |\n| First |\n\nBetween\n\n| B |\n| --- |\n| Second |\n';
    const editor = open(source);
    editor.querySelectorAll<HTMLInputElement>('tbody input')[1].focus();
    const table = dom.window.document.querySelector<HTMLButtonElement>(
      '.muninn-toolbar [data-command="chooseTableAction"]',
    )!;
    table.click();
    dom.window.document
      .querySelector<HTMLButtonElement>('#muninn-toolbar-menu [data-command="addTableRow"]')!
      .click();
    assert.equal(applies().at(-1)!.payload.markdown, source + '|  |\n');
    ack(0, 1);
    editor
      .querySelectorAll<HTMLButtonElement>('[data-testid="muninn-table-toggle-source"]')[1]
      .click();
    const draft = editor.querySelector<HTMLTextAreaElement>('textarea')!;
    draft.value = 'unapplied draft';
    draft.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    table.click();
    dom.window.document
      .querySelector<HTMLElement>('#muninn-toolbar-menu')!
      .dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(draft.value, 'unapplied draft');
    assert.equal(applies().length, 1);
  });

  it('does not apply a stale table picker to another table and retains an unapplied draft on cancel', () => {
    const editor = open('| A |\n| --- |\n| Alpha |\n');
    dom.window.document
      .querySelector<HTMLButtonElement>('[data-testid="muninn-table-toggle-source"]')!
      .click();
    const draft = editor.querySelector<HTMLTextAreaElement>('textarea')!;
    draft.value = 'unapplied draft';
    draft.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    const add = editor.querySelector<HTMLButtonElement>('button[aria-label="Add to table"]')!;
    add.focus();
    add.click();
    let request = messages.at(-1) as Extract<ViewToHostMessage, { type: 'view.requestPicker' }>;
    send({ type: 'host.pickerResult', payload: { requestId: request.payload.requestId } });
    assert.equal(draft.value, 'unapplied draft');
    assert.equal(dom.window.document.activeElement === add, true);
    assert.equal(applies().length, 0);
    add.click();
    request = messages.at(-1) as Extract<ViewToHostMessage, { type: 'view.requestPicker' }>;
    send({
      type: 'host.documentChanged',
      payload: { markdown: '| B |\n| --- |\n| Replacement |\n', revision: 1, imageSources: {} },
    });
    send({
      type: 'host.pickerResult',
      payload: { requestId: request.payload.requestId, command: 'addTableColumn' },
    });
    assert.equal(editor.querySelectorAll('th').length, 1);
    assert.equal(applies().length, 0);
  });

  it('keeps table actions as named icons and restores editor focus after deletion', () => {
    const editor = open('| Name |\n| --- |\n| Alpha |\n');
    const toggle = editor.querySelector<HTMLButtonElement>(
      '[data-testid="muninn-table-toggle-source"]',
    )!;
    toggle.click();
    assert.equal(toggle.getAttribute('aria-label'), 'Back to Preview');
    assert.ok(toggle.querySelector('.codicon-preview'));
    const apply = editor.querySelector<HTMLButtonElement>(
      '[data-testid="muninn-table-apply-source"]',
    )!;
    assert.equal(apply.hasAttribute('title'), false);
    assert.match(apply.dataset.help!, /Ctrl|Cmd/);
    for (const button of editor.querySelectorAll('button')) {
      assert.equal(button.textContent, '');
      assert.ok(button.getAttribute('aria-label'));
      assert.equal(button.querySelector('span')!.getAttribute('aria-hidden'), 'true');
    }
    toggle.click();
    assert.ok(toggle.querySelector('.codicon-code'));
    const remove = editor.querySelector<HTMLButtonElement>('[data-testid="muninn-table-delete"]')!;
    remove.focus();
    remove.click();
    assert.equal(dom.window.document.activeElement === editor, true);
    assert.equal(dom.window.document.querySelector<HTMLElement>('[role="tooltip"]')!.hidden, true);
  });

  it('renders a named icon button with keyboard help in the main toolbar', () => {
    open('Alpha\n');
    const button = dom.window.document.querySelector<HTMLButtonElement>(
      '[data-command="toggleBold"]',
    )!;
    assert.equal(button.getAttribute('aria-label'), 'Bold');
    assert.equal(button.textContent, '');
    assert.equal(button.querySelector('.codicon-bold')?.getAttribute('aria-hidden'), 'true');
    button.focus();
    const tooltip = dom.window.document.querySelector<HTMLElement>('[role="tooltip"]')!;
    assert.equal(tooltip.hidden, false);
    assert.match(tooltip.textContent!, /Ctrl\/Cmd\+B/);
    button.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    assert.equal(tooltip.hidden, true);
    assert.equal(dom.window.document.activeElement, button);
  });

  it('opens a directly focused link with Enter exactly once without editing', async () => {
    const editor = open('[Spec](design%20notes.md)\n');
    const link = editor.querySelector('a')!;
    link.focus();
    const event = new dom.window.KeyboardEvent('keydown', {
      key: 'Enter',
      keyCode: 13,
      bubbles: true,
      cancelable: true,
    });
    link.dispatchEvent(event);
    await tick();
    assert.equal(event.defaultPrevented, true);
    assert.deepEqual(
      messages
        .filter((message) => message.type === 'view.openLink')
        .map((message) => message.payload.href),
      ['design%20notes.md'],
    );
    assert.equal(applies().length, 0);
    assert.equal(editor.querySelectorAll('p').length, 1);
  });

  for (const href of ['#%C3%A9tape-1', '#missing', '#%']) {
    it('handles a focused heading link safely: ' + href, async () => {
      const editor = open('# Étape\n\n# Étape\n\n[Next](' + href + ')\n');
      const link = editor.querySelector('a')!;
      link.focus();
      link.dispatchEvent(
        new dom.window.KeyboardEvent('keydown', {
          key: 'Enter',
          keyCode: 13,
          bubbles: true,
          cancelable: true,
        }),
      );
      await tick();
      assert.equal(
        dom.window.document.activeElement,
        href.endsWith('-1') ? editor.querySelectorAll('h1')[1] : link,
      );
      assert.equal(messages.filter((message) => message.type === 'view.openLink').length, 0);
      assert.equal(applies().length, 0);
    });
  }

  it('keeps Space on a focused link and Enter in link text from opening a destination', async () => {
    const editor = open('[Spec](design%20notes.md)\n');
    const link = editor.querySelector('a')!;
    link.focus();
    const space = new dom.window.KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    });
    link.dispatchEvent(space);
    assert.equal(space.defaultPrevented, false);
    await enterAtEnd(editor, editor.querySelector('p')!);
    await append(editor, 'Next', [...editor.querySelectorAll<HTMLParagraphElement>('p')].at(-1)!);
    assert.equal(messages.filter((message) => message.type === 'view.openLink').length, 0);
    assert.equal(applies().at(-1)?.payload.markdown, '[Spec](design%20notes.md)\n\nNext\n');
  });
});
