// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { NodeView, NodeViewConstructor } from 'prosemirror-view';
import { getString } from '../localization';

export const getFrontMatterDisplayText = (raw: string): string =>
  raw
    .replace(/^---\r?\n/, '')
    .replace(/(^|\r?\n)---\r?\n?$/, '')
    .trimEnd();

export class FrontMatterNodeView implements NodeView {
  readonly dom: HTMLElement;

  constructor(node: ProseMirrorNode) {
    const raw = typeof node.attrs.raw === 'string' ? node.attrs.raw : '';
    const label = getString('frontMatterLabel');

    this.dom = document.createElement('section');
    this.dom.className = 'muninn-front-matter-node';
    this.dom.contentEditable = 'false';
    this.dom.setAttribute('role', 'region');
    this.dom.setAttribute('aria-label', getString('frontMatterAriaLabel'));

    const header = document.createElement('div');
    header.className = 'muninn-front-matter-node-header';

    const title = document.createElement('strong');
    title.textContent = label;
    header.append(title);

    const body = document.createElement('pre');
    body.className = 'muninn-front-matter-node-body';
    body.textContent = getFrontMatterDisplayText(raw);

    this.dom.append(header, body);
  }
}

const createFrontMatterNodeView = (node: ProseMirrorNode): NodeView =>
  new FrontMatterNodeView(node);

export const createFrontMatterNodeViewConstructor = (): NodeViewConstructor => {
  return createFrontMatterNodeView;
};
