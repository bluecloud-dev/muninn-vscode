// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { liftListItem, splitListItem } from 'prosemirror-schema-list';
import { Plugin, TextSelection, type Command } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { getString } from './localization';

export const headingSlug = (text: string): string =>
  text
    .toLowerCase()
    .trim()
    .replaceAll(/[^\p{L}\p{N}\p{M}_\-\s]/gu, '')
    .replaceAll(/\s/g, '-');

const decorations = (document_: ProseMirrorNode): DecorationSet => {
  const result: Decoration[] = [];
  const used = new Set<string>();
  document_.descendants((node, pos, parent, index) => {
    if (node.type.name === 'heading') {
      const base = headingSlug(node.textContent);
      let slug = base;
      let suffix = 0;
      while (used.has(slug)) slug = base + '-' + ++suffix;
      used.add(slug);
      result.push(Decoration.node(pos, pos + node.nodeSize, { id: slug, tabindex: '-1' }));
    }
    if (
      node.type.name !== 'paragraph' ||
      parent?.type.name !== 'list_item' ||
      index !== 0 ||
      !/^\[[ xX]\] /.test(node.textContent)
    )
      return;
    const checked = node.textContent[1].toLowerCase() === 'x';
    const marker = Decoration.inline(pos + 1, pos + 4, {
      class: 'muninn-task-marker',
      'aria-hidden': 'true',
    });
    result.push(
      marker,
      Decoration.widget(
        pos + 1,
        (view, getPos) => {
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.checked = checked;
          checkbox.className = 'muninn-task-checkbox';
          checkbox.setAttribute(
            'aria-label',
            getString('taskCheckboxLabel') + ': ' + node.textContent.slice(4),
          );
          checkbox.addEventListener('change', () => {
            const current = getPos();
            if (current === undefined) return;
            view.dispatch(
              view.state.tr.insertText(checkbox.checked ? 'x' : ' ', current + 1, current + 2),
            );
          });
          return checkbox;
        },
        { key: String(pos) + ':' + String(checked), side: -1, stopEvent: () => true },
      ),
    );
  });
  return DecorationSet.create(document_, result);
};

export const createDocumentNavigation = (openLink: (href: string) => void): Plugin<DecorationSet> =>
  new Plugin<DecorationSet>({
    state: {
      init: (_, state) => decorations(state.doc),
      apply: (tr, value) => {
        if (tr.docChanged) return decorations(tr.doc);
        // eslint-disable-next-line unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument -- This is ProseMirror DecorationSet.map, not Array.map.
        return value.map(tr.mapping, tr.doc);
      },
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
      handleDOMEvents: {
        keydown: (view, event) => {
          const target = event.target;
          if (
            event.key !== 'Enter' ||
            !(target instanceof HTMLAnchorElement) ||
            target !== document.activeElement
          )
            return false;
          event.preventDefault();
          target.click();
          return true;
        },
        click: (view, event) => {
          const target = event.target instanceof Element ? event.target.closest('a') : undefined;
          const href = target?.getAttribute('href');
          if (!href) return false;
          event.preventDefault();
          if (href.startsWith('#')) {
            let id: string;
            try {
              id = decodeURIComponent(href.slice(1));
            } catch {
              return true;
            }
            const heading = [...view.dom.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')].find(
              (element) => element.id === id,
            );
            heading?.scrollIntoView({ block: 'center' });
            heading?.focus();
          } else openLink(href);
          return true;
        },
      },
    },
  });

/** Task syntax stays ordinary GFM text, so checkboxes never require a private node format. */
export const continueList: Command = (state, dispatch) => {
  const { $from } = state.selection;
  const task =
    $from.depth > 1 &&
    $from.node($from.depth - 1).type.name === 'list_item' &&
    $from.index($from.depth - 1) === 0 &&
    /^\[[ xX]\](?: |$)/.test($from.parent.textContent);
  if (task && !$from.parent.textContent.slice(3).trim()) {
    return liftListItem(state.schema.nodes.list_item)(
      state,
      dispatch &&
        ((tr) => {
          tr.delete(tr.mapping.map($from.start()), tr.mapping.map($from.end()));
          dispatch(tr);
        }),
    );
  }
  return splitListItem(state.schema.nodes.list_item)(
    state,
    dispatch &&
      ((tr) => {
        if (task) tr.replaceSelectionWith(state.schema.text('[ ] '), false);
        dispatch(tr);
      }),
  );
};

export const toggleTask: Command = (state, dispatch) => {
  const { $from } = state.selection;
  if ($from.parent.type.name !== 'paragraph') return false;
  const start = $from.start();
  const text = $from.parent.textContent;
  if (/^\[[ xX]\] /.test(text)) {
    dispatch?.(state.tr.insertText(text[1] === ' ' ? 'x' : ' ', start + 1, start + 2));
    return true;
  }
  const paragraph = state.schema.nodes.paragraph.create(undefined, [
    state.schema.text('[ ] '),
    ...$from.parent.content.content,
  ]);
  const inList = $from.depth > 1 && $from.node($from.depth - 1).type.name === 'list_item';
  const replacement = inList
    ? paragraph
    : state.schema.nodes.bullet_list.create(
        { tight: true },
        state.schema.nodes.list_item.create(undefined, paragraph),
      );
  const tr = state.tr.replaceWith($from.before(), $from.after(), replacement);
  const contentStart = start + (inList ? 0 : 2);
  tr.setSelection(TextSelection.near(tr.doc.resolve(contentStart + 4 + $from.parentOffset)));
  dispatch?.(tr);
  return true;
};
