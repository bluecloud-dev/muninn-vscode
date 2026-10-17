// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { attachToolbarRovingFocus } from './toolbar-roving-focus';

export type ToolbarMenuItem = {
  command: string;
  label: string;
  icon?: string;
  shortcut?: string;
  role?: 'menuitemradio' | 'menuitemcheckbox';
  checked?: boolean;
  disabled?: boolean;
  group?: string;
};

const pixels = (value: string): number => Number.parseFloat(value) || 0;

export const attachAdaptiveToolbar = (options: {
  toolbar: HTMLElement;
  more: HTMLButtonElement;
  menu: HTMLElement;
  buttons: Map<string, HTMLButtonElement>;
  getMenu: (command: string) => ToolbarMenuItem[] | undefined;
  onOpen: () => void;
  execute: (command: string, menu?: string) => void;
}) => {
  const { toolbar, more, menu, buttons } = options;
  const roving = attachToolbarRovingFocus(toolbar);
  const groups = [...toolbar.querySelectorAll<HTMLElement>('.muninn-toolbar-group')];
  const actions = [...buttons.keys()];
  const priority = new Set([
    'resetZoom',
    'chooseBlockStyle',
    'openRawMarkdown',
    'toggleBold',
    'toggleItalic',
  ]);
  const preferredOrder = [...priority, ...actions.filter((command) => !priority.has(command))];
  const measurement = document.createElement('div');
  measurement.className = 'muninn-toolbar-measure';
  measurement.setAttribute('aria-hidden', 'true');
  measurement.inert = true;
  toolbar.after(measurement);
  let overflow: string[] = [];
  let trigger: HTMLButtonElement | undefined;
  let frame = 0;
  let previousWidth = -1;
  let previousVisible = '';
  let disposed = false;

  const fallback = (): HTMLButtonElement | undefined => {
    if (trigger && !trigger.closest('[hidden]') && !trigger.disabled) return trigger;
    if (!more.hidden) return more;
    for (const button of buttons.values()) {
      if (!button.closest('[hidden]') && !button.disabled) return button;
    }
    return undefined;
  };

  const close = (restoreFocus = false): void => {
    const hadFocus = menu.contains(document.activeElement);
    menu.hidden = true;
    trigger?.setAttribute('aria-expanded', 'false');
    if (restoreFocus && hadFocus) fallback()?.focus();
    trigger = undefined;
  };

  const menuItems = (): HTMLButtonElement[] => [...menu.querySelectorAll('button')];
  const position = (): void => {
    if (!trigger) return;
    menu.style.maxHeight = Math.max(0, innerHeight - 16) + 'px';
    const anchor = trigger.getBoundingClientRect();
    const popup = menu.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(anchor.left, innerWidth - popup.width - 8)) + 'px';
    const top =
      anchor.bottom + popup.height + 4 <= innerHeight - 8
        ? anchor.bottom + 4
        : anchor.top - popup.height - 4;
    menu.style.top = Math.max(8, Math.min(top, innerHeight - popup.height - 8)) + 'px';
  };

  const overflowItems = (): ToolbarMenuItem[] =>
    overflow.map((command) => {
      const button = buttons.get(command)!;
      return {
        command,
        label: button.getAttribute('aria-label') ?? button.textContent ?? command,
        icon: button.dataset.icon,
        shortcut: button.dataset.shortcut,
        role: button.hasAttribute('aria-pressed') ? 'menuitemcheckbox' : undefined,
        checked: button.getAttribute('aria-pressed') === 'true',
        disabled: button.disabled,
        group: button.closest<HTMLElement>('[data-group]')?.dataset.group,
      };
    });

  const open = (command: string, anchor: HTMLButtonElement, last = false, nested = false): void => {
    const items = command === 'more' ? overflowItems() : options.getMenu(command);
    if (!items?.length) return;
    if (!nested) options.onOpen();
    close();
    trigger = anchor;
    trigger.setAttribute('aria-expanded', 'true');
    const labelSource = buttons.get(command) ?? anchor;
    menu.setAttribute(
      'aria-label',
      labelSource.getAttribute('aria-label') ?? labelSource.textContent ?? '',
    );
    menu.replaceChildren();
    let previousGroup: string | undefined;
    for (const item of items) {
      if (previousGroup && item.group !== previousGroup) {
        const separator = document.createElement('div');
        separator.className = 'muninn-menu-separator';
        separator.setAttribute('role', 'separator');
        menu.append(separator);
      }
      previousGroup = item.group;
      const row = document.createElement('button');
      row.type = 'button';
      row.tabIndex = -1;
      row.dataset.command = item.command;
      row.setAttribute('role', item.role ?? 'menuitem');
      if (item.role) row.setAttribute('aria-checked', String(!!item.checked));
      if (item.disabled) row.setAttribute('aria-disabled', 'true');
      const mark = document.createElement('span');
      mark.className = 'muninn-menu-mark codicon' + (item.checked ? ' codicon-check' : '');
      mark.setAttribute('aria-hidden', 'true');
      row.append(mark);
      if (item.icon) {
        const icon = document.createElement('span');
        icon.className = 'codicon codicon-' + item.icon;
        icon.setAttribute('aria-hidden', 'true');
        row.append(icon);
      }
      const label = document.createElement('span');
      label.className = 'muninn-menu-label';
      label.textContent = item.label;
      row.append(label);
      if (item.shortcut) {
        const shortcut = document.createElement('span');
        shortcut.className = 'muninn-menu-shortcut';
        shortcut.textContent = item.shortcut;
        shortcut.setAttribute('aria-hidden', 'true');
        row.append(shortcut);
      }
      if (options.getMenu(item.command)) {
        row.setAttribute('aria-haspopup', 'menu');
        row.setAttribute('aria-expanded', 'false');
      }
      row.addEventListener('click', () => {
        if (item.disabled || menu.hidden || !row.isConnected) return;
        if (options.getMenu(item.command)) {
          open(item.command, anchor, false, true);
          return;
        }
        close(true);
        options.execute(item.command, command);
      });
      menu.append(row);
    }
    menu.hidden = false;
    menu.scrollTop = 0;
    position();
    const rows = menuItems();
    (last
      ? rows.at(-1)
      : (rows.find((row) => row.getAttribute('aria-checked') === 'true') ?? rows[0])
    )?.focus();
  };

  const layout = (): void => {
    frame = 0;
    measurement.replaceChildren(...groups.map((group) => group.cloneNode(true)));
    const copiedGroups = [...measurement.children] as HTMLElement[];
    for (const group of copiedGroups) group.classList.remove('muninn-toolbar-first-group');
    const copies = [...measurement.querySelectorAll<HTMLButtonElement>('button')];
    for (const element of measurement.querySelectorAll<HTMLElement>('*')) {
      element.hidden = false;
      element.removeAttribute('id');
      delete element.dataset.testid;
      delete element.dataset.command;
      delete element.dataset.help;
      if (element instanceof HTMLButtonElement) element.tabIndex = -1;
    }
    const originals = [...toolbar.querySelectorAll<HTMLButtonElement>('button')];
    const widths = new Map(
      originals.map((button, index) => [button, copies[index].getBoundingClientRect().width]),
    );
    const style = getComputedStyle(toolbar);
    const available =
      toolbar.getBoundingClientRect().width -
      pixels(style.paddingLeft) -
      pixels(style.paddingRight) -
      pixels(style.borderLeftWidth) -
      pixels(style.borderRightWidth);
    if (available <= 0) return;
    const gap = pixels(style.columnGap);
    const fits = (visible: Set<string>, withMore: boolean): boolean => {
      let width = 0;
      let count = 0;
      for (const [index, group] of groups.entries()) {
        const members = [...group.querySelectorAll<HTMLButtonElement>('button')].filter((button) =>
          button === more ? withMore : visible.has(button.dataset.command!),
        );
        if (members.length === 0) continue;
        const groupStyle = getComputedStyle(copiedGroups[index]);
        if (count++)
          width += gap + pixels(groupStyle.paddingLeft) + pixels(groupStyle.borderLeftWidth);
        width +=
          members.reduce((sum, button) => sum + widths.get(button)!, 0) +
          (members.length - 1) * pixels(groupStyle.columnGap);
      }
      return width <= available;
    };
    const visible = new Set(actions);
    const needsMore = !fits(visible, false);
    if (needsMore) {
      visible.clear();
      for (const command of preferredOrder) {
        visible.add(command);
        if (!fits(visible, true)) visible.delete(command);
      }
    }
    const signature = [...visible].join(',');
    const focused = document.activeElement;
    for (const [command, button] of buttons) button.hidden = !visible.has(command);
    more.hidden = !needsMore;
    let first = true;
    for (const group of groups) {
      group.hidden = ![...group.querySelectorAll('button')].some((button) => !button.hidden);
      group.classList.toggle('muninn-toolbar-first-group', first && !group.hidden);
      if (!group.hidden) first = false;
    }
    overflow = actions.filter((command) => !visible.has(command));
    if (!menu.hidden && (available !== previousWidth || signature !== previousVisible)) close(true);
    previousWidth = available;
    previousVisible = signature;
    roving.revalidateCurrentStop(more.hidden ? undefined : more);
    if (
      focused instanceof HTMLButtonElement &&
      toolbar.contains(focused) &&
      focused.closest('[hidden]')
    )
      fallback()?.focus();
  };
  const refresh = (): void => {
    if (!disposed && !frame) frame = requestAnimationFrame(layout);
  };
  for (const [command, button] of buttons) {
    button.addEventListener('click', () => {
      if (options.getMenu(command)) {
        if (trigger === button && !menu.hidden) close(true);
        else open(command, button);
      } else options.execute(command);
    });
  }
  more.addEventListener('click', () => {
    if (!menu.hidden && trigger === more) close(true);
    else open('more', more);
  });
  toolbar.addEventListener('keydown', (event) => {
    const button = event.target;
    if (!(button instanceof HTMLButtonElement) || !['ArrowDown', 'ArrowUp'].includes(event.key))
      return;
    const command = button === more ? 'more' : button.dataset.command!;
    if (command !== 'more' && !options.getMenu(command)) return;
    event.preventDefault();
    open(command, button, event.key === 'ArrowUp');
  });
  menu.addEventListener('keydown', (event) => {
    const rows = menuItems();
    const index = rows.indexOf(document.activeElement as HTMLButtonElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      let next = (index + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
      if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = rows.length - 1;
      rows[next]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    } else if (event.key === 'Tab') {
      const anchor = fallback();
      close();
      anchor?.focus();
    }
  });
  const onOutside = (event: PointerEvent): void => {
    if (
      event.target instanceof Node &&
      !menu.contains(event.target) &&
      !toolbar.contains(event.target)
    )
      close();
  };
  const onFocus = (event: FocusEvent): void => {
    if (event.target instanceof Node && !menu.contains(event.target) && event.target !== trigger)
      close();
  };
  const onResize = (): void => {
    close(true);
    refresh();
  };
  const onScroll = (event: Event): void => {
    if (event.target instanceof Node && !menu.contains(event.target)) close(true);
  };
  const resizeObserver =
    typeof ResizeObserver === 'function' ? new ResizeObserver(refresh) : undefined;
  resizeObserver?.observe(toolbar);
  resizeObserver?.observe(measurement);
  const labels = new MutationObserver(refresh);
  labels.observe(toolbar, { childList: true, subtree: true, characterData: true });
  document.addEventListener('pointerdown', onOutside);
  document.addEventListener('focusin', onFocus);
  window.addEventListener('resize', onResize);
  document.addEventListener('scroll', onScroll, { capture: true });
  void globalThis.document.fonts?.ready.then(refresh);
  refresh();
  return {
    refresh,
    close,
    isOpen: () => !menu.hidden,
    dispose: (): void => {
      disposed = true;
      close();
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      labels.disconnect();
      document.removeEventListener('pointerdown', onOutside);
      document.removeEventListener('focusin', onFocus);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('scroll', onScroll, true);
      measurement.remove();
    },
  };
};
