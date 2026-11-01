// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  attachAdaptiveToolbar,
  type ToolbarMenuItem,
} from '../../src/webview/editor/adaptive-toolbar';

describe('adaptive toolbar layout and menus', () => {
  let dom: JSDOM;
  let width: number;
  let toolbar: HTMLElement;
  let menu: HTMLElement;
  let more: HTMLButtonElement;
  let controller: ReturnType<typeof attachAdaptiveToolbar>;
  let buttons: Map<string, HTMLButtonElement>;
  let resizeCallbacks: Set<() => void>;
  let calls: [string, string | undefined][];
  let opens: number;
  let styleChoices: ToolbarMenuItem[];
  const previous = new Map<string, PropertyDescriptor | undefined>();
  const settle = () =>
    new Promise<void>((resolve) => dom.window.requestAnimationFrame(() => resolve()));
  const resize = async (value: number) => {
    width = value;
    for (const callback of resizeCallbacks) callback();
    await settle();
  };
  const key = (target: Element, value: string) =>
    target.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }),
    );

  beforeEach(async () => {
    width = 700;
    calls = [];
    styleChoices = [
      { command: 'setParagraph', label: 'Paragraph', role: 'menuitemradio', checked: true },
      { command: 'setHeading1', label: 'Heading 1', role: 'menuitemradio' },
    ];
    opens = 0;
    resizeCallbacks = new Set();
    dom = new JSDOM(
      `<!doctype html><html><head><style>
      .muninn-toolbar { padding: 8px; gap: 8px; border: 1px solid; }
      .muninn-toolbar-group { padding-left: 8px; border-left: 1px solid; gap: 4px; }
      .muninn-toolbar-first-group { padding-left: 0; border-left: 0; }
      [hidden] { display: none; }
    </style></head><body>
      <div class="muninn-toolbar" role="toolbar">
        <div class="muninn-toolbar-group" data-group="history"><button data-command="undo" disabled aria-label="Undo">Undo</button><button data-command="redo" disabled aria-label="Redo">Redo</button></div>
        <div class="muninn-toolbar-group" data-group="style"><button data-command="chooseBlockStyle" class="style" aria-label="Block style: Paragraph" aria-expanded="false">Paragraph</button></div>
        <div class="muninn-toolbar-group" data-group="text"><button data-command="toggleBold" data-icon="bold" data-shortcut="Ctrl/Cmd+B" aria-label="Bold" aria-pressed="true">Bold</button><button data-command="toggleItalic" aria-label="Italic" aria-pressed="false">Italic</button></div>
        <div class="muninn-toolbar-group" data-group="insert"><button data-command="insertImage" aria-label="Image">Image</button><button data-command="chooseTableAction" aria-label="Table">Table</button></div>
        <div class="muninn-toolbar-group" data-group="utilities"><button data-command="openRawMarkdown" aria-label="Source">Source</button><button id="more" hidden aria-label="More">More</button></div>
      </div><textarea>unapplied draft</textarea><div id="menu" role="menu" hidden></div>
    </body></html>`,
      { pretendToBeVisual: true },
    );
    const win = dom.window;
    const globals = {
      window: win,
      document: win.document,
      Node: win.Node,
      HTMLElement: win.HTMLElement,
      HTMLButtonElement: win.HTMLButtonElement,
      MutationObserver: win.MutationObserver,
      getComputedStyle: win.getComputedStyle.bind(win),
      requestAnimationFrame: win.requestAnimationFrame.bind(win),
      cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
      innerWidth: 320,
      innerHeight: 180,
      ResizeObserver: class {
        private readonly callback: () => void;
        constructor(callback: () => void) {
          this.callback = callback;
        }
        observe() {
          resizeCallbacks.add(this.callback);
        }
        disconnect() {
          resizeCallbacks.delete(this.callback);
        }
      },
    };
    for (const [name, value] of Object.entries(globals)) {
      previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
      Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    }
    win.HTMLElement.prototype.getBoundingClientRect = function () {
      // eslint-disable-next-line unicorn/no-this-outside-of-class, unicorn/no-this-assignment, @typescript-eslint/no-this-alias -- DOM prototype receiver.
      const element = this;
      let measured = 32;
      if (element.classList.contains('muninn-toolbar')) measured = width;
      else if (element.classList.contains('style'))
        measured = 124 + Math.max(0, element.textContent!.length - 9) * 8;
      else if (element.id === 'menu') measured = 220;
      return {
        x: 0,
        y: 0,
        left: 0,
        right: measured,
        top: 0,
        bottom: 32,
        width: measured,
        height: 32,
        toJSON: () => ({}),
      };
    };
    toolbar = win.document.querySelector<HTMLElement>('.muninn-toolbar')!;
    menu = win.document.querySelector<HTMLElement>('#menu')!;
    more = win.document.querySelector<HTMLButtonElement>('#more')!;
    buttons = new Map(
      [...toolbar.querySelectorAll<HTMLButtonElement>('[data-command]')].map((button) => [
        button.dataset.command!,
        button,
      ]),
    );
    controller = attachAdaptiveToolbar({
      toolbar,
      more,
      menu,
      buttons,
      onOpen: () => {
        opens++;
      },
      execute: (command, kind) => calls.push([command, kind]),
      getMenu: (command) => {
        if (command === 'chooseBlockStyle') return styleChoices;
        if (command === 'chooseTableAction')
          return [
            { command: 'insertTable', label: 'Insert new table' },
            { command: 'addTableRow', label: 'Add row', disabled: true },
          ];
        return;
      },
    });
    await settle();
  });
  afterEach(() => {
    controller.dispose();
    dom.window.close();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
    previous.clear();
  });

  it('exposes every action once and shows More only while actions overflow', async () => {
    for (const size of [70, 120, 200, 320, 700]) {
      await resize(size);
      const visible = [...buttons]
        .filter(([, button]) => !button.hidden)
        .map(([command]) => command);
      assert.equal(more.hidden, visible.length === buttons.size);
      if (!more.hidden) {
        more.click();
        const combined = [
          ...visible,
          ...[...menu.querySelectorAll<HTMLButtonElement>('button')].map(
            (button) => button.dataset.command!,
          ),
        ];
        assert.deepEqual(combined.toSorted(), [...buttons.keys()].toSorted());
        controller.close();
      }
      assert.equal(
        [...toolbar.querySelectorAll('button')].filter((button) => button.tabIndex === 0).length,
        1,
      );
    }
    assert.equal(more.hidden, true);
    await resize(120);
    assert.equal(
      buttons.get('chooseBlockStyle')!.hidden,
      true,
      'An oversized selector must not block smaller controls',
    );
    assert.equal(buttons.get('openRawMarkdown')!.hidden, false);
  });

  it('keeps the exact fit threshold, including the disappearance of More', async () => {
    let lower = 600,
      upper = 1000;
    while (upper - lower > 1) {
      const middle = Math.floor((lower + upper) / 2);
      await resize(middle / 2);
      if (more.hidden) upper = middle;
      else lower = middle;
    }
    const last = upper / 2;
    assert.ok(last > 300);
    await resize(last - 0.5);
    assert.equal(more.hidden, false);
    await resize(last);
    assert.equal(more.hidden, true);
  });

  it('remeasures labels and preserves document focus and drafts across resizing', async () => {
    const draft = dom.window.document.querySelector('textarea')!;
    draft.focus();
    draft.setSelectionRange(2, 5);
    await resize(320);
    assert.equal(dom.window.document.activeElement, draft);
    assert.deepEqual(
      [draft.value, draft.selectionStart, draft.selectionEnd],
      ['unapplied draft', 2, 5],
    );
    buttons.get('chooseBlockStyle')!.textContent = 'A much longer translated block style';
    await settle();
    await settle();
    assert.equal(buttons.get('chooseBlockStyle')!.hidden, true);
    assert.equal(dom.window.document.activeElement, draft);
    assert.equal(calls.length, 0);
  });

  it('moves toolbar focus to More when its action overflows and closes a resized menu safely', async () => {
    buttons.get('insertImage')!.focus();
    await resize(200);
    assert.equal(dom.window.document.activeElement, more);
    more.click();
    assert.equal(menu.hidden, false);
    await resize(220);
    assert.equal(menu.hidden, true);
    assert.equal(dom.window.document.activeElement, more);
    more.click();
    await resize(700);
    assert.equal(menu.hidden, true);
    assert.equal(more.hidden, true);
    assert.ok(toolbar.contains(dom.window.document.activeElement));
    assert.equal(calls.length, 0);
  });

  it('navigates local menu radios, restores focus on Escape and lets Tab exit', () => {
    const style = buttons.get('chooseBlockStyle')!;
    style.focus();
    key(style, 'ArrowDown');
    const rows = [...menu.querySelectorAll<HTMLButtonElement>('button')];
    assert.equal(rows[0].getAttribute('aria-checked'), 'true');
    key(rows[0], 'ArrowDown');
    assert.equal(dom.window.document.activeElement, rows[1]);
    key(rows[1], 'Home');
    assert.equal(dom.window.document.activeElement, rows[0]);
    key(rows[0], 'End');
    assert.equal(dom.window.document.activeElement, rows[1]);
    key(rows[1], 'ArrowUp');
    assert.equal(dom.window.document.activeElement, rows[0]);
    key(rows[0], 'Escape');
    assert.equal(dom.window.document.activeElement, style);
    assert.equal(style.getAttribute('aria-expanded'), 'false');
    key(style, 'ArrowUp');
    assert.equal(dom.window.document.activeElement!.textContent, 'Heading 1');
    key(dom.window.document.activeElement!, 'Tab');
    assert.equal(menu.hidden, true);
    style.click();
    menu.querySelectorAll<HTMLButtonElement>('button')[1].click();
    assert.deepEqual(calls, [['setHeading1', 'chooseBlockStyle']]);
  });

  it('centers the checked row of a long radio menu without scrolling for focus', () => {
    styleChoices = Array.from({ length: 16 }, (_, index) => ({
      command: 'level' + index,
      label: String(index),
      role: 'menuitemradio',
      checked: index === 10,
    }));
    const rowHeight = 40;
    Object.defineProperties(dom.window.HTMLElement.prototype, {
      offsetTop: {
        configurable: true,
        get(this: HTMLElement) {
          return 8 + [...this.parentElement!.children].indexOf(this) * rowHeight;
        },
      },
      offsetHeight: { configurable: true, get: () => rowHeight },
    });
    Object.defineProperty(menu, 'clientHeight', { configurable: true, value: 120 });
    const focusOptions: (FocusOptions | undefined)[] = [];
    const focus = dom.window.HTMLElement.prototype.focus;
    dom.window.HTMLElement.prototype.focus = function (this: HTMLElement, options) {
      if (menu.contains(this)) focusOptions.push(options);
      focus.call(this, options);
    };
    buttons.get('chooseBlockStyle')!.click();
    const checked = menu.querySelector<HTMLButtonElement>('[aria-checked="true"]')!;
    assert.equal(dom.window.document.activeElement, checked);
    assert.deepEqual(focusOptions, [{ preventScroll: true }]);
    assert.equal(menu.scrollTop, 8 + 10 * rowHeight - (120 - rowHeight) / 2);
  });

  it('opens nested overflow choices once, reflects disabled and checked states, and dismisses outside', async () => {
    await resize(70);
    more.click();
    const undo = menu.querySelector<HTMLButtonElement>('[data-command="undo"]')!;
    assert.equal(undo.getAttribute('aria-disabled'), 'true');
    undo.click();
    assert.equal(calls.length, 0);
    const bold = menu.querySelector<HTMLButtonElement>('[data-command="toggleBold"]')!;
    assert.equal(bold.getAttribute('role'), 'menuitemcheckbox');
    assert.equal(bold.getAttribute('aria-checked'), 'true');
    assert.match(bold.textContent!, /Ctrl\/Cmd\+B/);
    menu.querySelector<HTMLButtonElement>('[data-command="chooseBlockStyle"]')!.click();
    assert.equal(opens, 1);
    menu.querySelector<HTMLButtonElement>('[data-command="setHeading1"]')!.click();
    assert.deepEqual(calls, [['setHeading1', 'chooseBlockStyle']]);
    assert.equal(
      dom.window.document.activeElement,
      more,
      'Activation restores a visible focus target before a host action',
    );
    more.click();
    menu.dispatchEvent(new dom.window.Event('scroll', { bubbles: true }));
    assert.equal(menu.hidden, false, 'Internal scrolling keeps the popup open');
    dom.window.document.body.dispatchEvent(
      new dom.window.MouseEvent('pointerdown', { bubbles: true }),
    );
    assert.equal(menu.hidden, true);
    more.click();
    dom.window.dispatchEvent(new dom.window.Event('resize'));
    assert.equal(menu.hidden, true);
    await resize(700);
    buttons.get('toggleItalic')!.click();
    assert.deepEqual(calls.at(-1), ['toggleItalic', undefined]);
    buttons.get('chooseTableAction')!.click();
    menu.querySelector<HTMLButtonElement>('[data-command="addTableRow"]')!.click();
    assert.equal(calls.length, 2);
    menu.querySelector<HTMLButtonElement>('[data-command="insertTable"]')!.click();
    assert.deepEqual(calls.at(-1), ['insertTable', 'chooseTableAction']);
  });

  it('disconnects observation and global listeners on disposal', () => {
    buttons.get('chooseBlockStyle')!.click();
    controller.dispose();
    assert.equal(menu.hidden, true);
    assert.equal(resizeCallbacks.size, 0);
    assert.equal(
      dom.window.document.querySelector('.muninn-toolbar-measure')?.isConnected,
      undefined,
    );
    dom.window.dispatchEvent(new dom.window.Event('resize'));
    assert.equal(calls.length, 0);
  });
});
