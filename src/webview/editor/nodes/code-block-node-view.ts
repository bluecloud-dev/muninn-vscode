// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorView, NodeView, NodeViewConstructor } from 'prosemirror-view';
import { CODE_LANGUAGE_OPTIONS, type CodeLanguageOption } from '../../../shared/code-languages';
import type { Announce } from '../announcements';
import { escapeHtml, formatString, getString } from '../localization';
import { sanitizeMermaidSvg } from '../preview';
import {
  isMermaidRenderingEnabled,
  onMermaidPolicyChanged,
  renderMermaidDiagram,
} from '../renderers/mermaid-renderer';

type CodeNodeViewOptions = { announce: Announce };

const createDefaultCodeBlockNodeView = (node: ProseMirrorNode): NodeView => {
  const dom = document.createElement('pre');
  const code = document.createElement('code');
  dom.append(code);

  const parameters = (node.attrs.params as string | undefined)?.trim();
  if (parameters && parameters.length > 0) {
    dom.dataset.params = parameters;
  }

  return {
    dom,
    contentDOM: code,
  };
};

const getCodeBlockLanguage = (node: ProseMirrorNode): string =>
  ((node.attrs.params as string | undefined) ?? '').trim().toLowerCase();

const buildCodeLanguageOptions = (currentLanguage: string): ReadonlyArray<CodeLanguageOption> => {
  const options = [...CODE_LANGUAGE_OPTIONS];
  if (currentLanguage.length > 0 && !options.some((option) => option.value === currentLanguage)) {
    options.push({
      value: currentLanguage,
      label: formatString(getString('codeBlockLanguageUnsupportedTemplate'), currentLanguage),
    });
  }
  return options;
};

class GenericCodeBlockNodeView implements NodeView {
  readonly dom: HTMLDivElement;
  readonly contentDOM: HTMLElement;

  private readonly header = document.createElement('div');
  private readonly title = document.createElement('strong');
  private readonly languageSelect = document.createElement('select');
  private readonly body = document.createElement('pre');
  private readonly code = document.createElement('code');
  private readonly mermaidPreview = document.createElement('div');
  private renderSerial = 0;
  private renderedSource: string | undefined;
  private readonly unsubscribePolicy: () => void;
  private readonly renderId = `muninn-code-${crypto.randomUUID()}`;
  private renderTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private node: ProseMirrorNode,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined,
    private readonly options: CodeNodeViewOptions,
  ) {
    this.unsubscribePolicy = onMermaidPolicyChanged(() => {
      this.renderedSource = undefined;
      this.renderSerial++;
      this.mermaidPreview.hidden = true;
      this.mermaidPreview.replaceChildren();
      this.scheduleMermaidPreviewRender();
    });
    this.dom = document.createElement('div');
    this.dom.className = 'muninn-code-node';
    this.dom.dataset.testid = 'muninn-code-node';

    this.header.className = 'muninn-code-node-header';
    this.title.textContent = getString('codeBlockTitle');
    this.languageSelect.className = 'muninn-code-node-language';
    this.languageSelect.setAttribute('aria-label', getString('codeBlockLanguageAriaLabel'));
    this.languageSelect.dataset.testid = 'muninn-code-language';
    this.header.append(this.title, this.languageSelect);

    this.body.className = 'muninn-code-node-body';
    this.body.append(this.code);
    this.contentDOM = this.code;
    this.mermaidPreview.className = 'muninn-code-node-mermaid-preview muninn-mermaid-preview-body';
    this.mermaidPreview.hidden = true;

    this.dom.append(this.header, this.body, this.mermaidPreview);
    this.languageSelect.addEventListener('input', () => {
      this.applySelectedLanguage();
    });
    this.languageSelect.addEventListener('change', () => {
      this.applySelectedLanguage();
    });
    this.syncLanguageSelect();
    this.scheduleMermaidPreviewRender();
  }

  update(node: ProseMirrorNode): boolean {
    if (node.type.name !== 'code_block') {
      return false;
    }
    if (this.node.eq(node)) return true;
    this.node = node;
    this.renderSerial++;
    this.syncLanguageSelect();
    this.scheduleMermaidPreviewRender();
    return true;
  }

  stopEvent(event: Event): boolean {
    const target = event.target;
    return target instanceof Node && this.header.contains(target);
  }

  ignoreMutation(mutation: MutationRecord | { type: 'selection'; target: Node }): boolean {
    return mutation.type !== 'selection' && !this.contentDOM.contains(mutation.target);
  }

  destroy(): void {
    this.unsubscribePolicy();
    this.renderSerial++;
    if (!this.renderTimer) {
      return;
    }
    clearTimeout(this.renderTimer);
    this.renderTimer = undefined;
  }

  private syncLanguageSelect(): void {
    const currentLanguage = getCodeBlockLanguage(this.node);
    if (this.languageSelect.options.length > 0 && this.languageSelect.value === currentLanguage)
      return;
    const options = buildCodeLanguageOptions(currentLanguage);

    const fragment = document.createDocumentFragment();
    for (const option of options) {
      const element = document.createElement('option');
      element.value = option.value;
      element.textContent = option.label;
      fragment.append(element);
    }

    this.languageSelect.replaceChildren(fragment);
    this.languageSelect.value = currentLanguage;
  }

  private applySelectedLanguage(): void {
    const selectedLanguage = this.languageSelect.value.trim().toLowerCase();
    const currentLanguage = getCodeBlockLanguage(this.node);
    if (selectedLanguage === currentLanguage) {
      return;
    }

    const position = this.resolveNodePosition();
    if (position === undefined) {
      this.options.announce(getString('statusCodeLanguageUpdateFailed'), { kind: 'error' });
      this.syncLanguageSelect();
      return;
    }

    const nextAttributes = {
      ...(this.node.attrs as Record<string, unknown>),
    };
    if (selectedLanguage.length === 0) {
      delete nextAttributes.params;
    } else {
      nextAttributes.params = selectedLanguage;
    }

    const transaction = this.view.state.tr
      .setNodeMarkup(position, undefined, nextAttributes)
      .scrollIntoView();
    this.view.dispatch(transaction);

    if (selectedLanguage.length === 0) {
      this.options.announce(getString('statusCodeLanguagePlainText'), { kind: 'status' });
      return;
    }

    const option = buildCodeLanguageOptions(selectedLanguage).find(
      (candidate) => candidate.value === selectedLanguage,
    );
    this.options.announce(
      formatString(getString('statusCodeLanguageSetTemplate'), option?.label ?? selectedLanguage),
      { kind: 'status' },
    );
  }

  private scheduleMermaidPreviewRender(): void {
    if (this.renderTimer) {
      return;
    }

    this.renderTimer = setTimeout(() => {
      this.renderTimer = undefined;
      this.renderSerial += 1;
      void this.renderMermaidPreview(this.renderSerial);
    }, 120);
  }

  private async renderMermaidPreview(serialAtStart: number): Promise<void> {
    if (getCodeBlockLanguage(this.node) !== 'mermaid') {
      this.mermaidPreview.hidden = true;
      this.mermaidPreview.innerHTML = '';
      return;
    }

    if (!isMermaidRenderingEnabled()) {
      this.mermaidPreview.hidden = false;
      this.mermaidPreview.textContent = getString('mermaidDisabledMessage');
      return;
    }
    const source = this.node.textContent.trim();
    if (source === this.renderedSource) return;
    if (source.length === 0) {
      this.mermaidPreview.hidden = true;
      this.mermaidPreview.innerHTML = '';
      return;
    }

    const result = await renderMermaidDiagram(source, this.renderId);
    if (serialAtStart !== this.renderSerial || !isMermaidRenderingEnabled()) {
      return;
    }

    this.renderedSource = source;
    this.mermaidPreview.hidden = false;
    if (!result.ok) {
      this.mermaidPreview.innerHTML = `<div class="muninn-mermaid-error">${escapeHtml(result.error)}</div>`;
      return;
    }

    this.mermaidPreview.innerHTML = sanitizeMermaidSvg(result.svg, source);
  }

  private resolveNodePosition(): number | undefined {
    try {
      const position = this.getPos();
      if (typeof position === 'number') {
        return position;
      }
    } catch {
      // Fallback below handles transient node-view position races.
    }

    return undefined;
  }
}

export const createCodeBlockNodeViewConstructor =
  (options: CodeNodeViewOptions): NodeViewConstructor =>
  (node, view, getPos) =>
    typeof getPos === 'function'
      ? new GenericCodeBlockNodeView(node, view, getPos, options)
      : createDefaultCodeBlockNodeView(node);
