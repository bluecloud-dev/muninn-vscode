// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { escapeHtml, formatString, getString } from './localization';

const stripMermaidLabelQuotes = (label: string): string =>
  label
    .trim()
    .replaceAll(/^["'`]+|["'`]+$/g, '')
    .trim();

const getMermaidDiagramType = (line: string): string | undefined => {
  const [keyword, direction] = line.split(/\s+/);
  if (keyword === 'graph' || keyword === 'flowchart') {
    return direction ? `${keyword} ${direction}` : keyword;
  }
  if (
    /^(?:[A-Z]?\w+Diagram(?:-v2)?|gantt|gitGraph|journey|mindmap|pie|timeline)$/.test(keyword ?? '')
  ) {
    return keyword;
  }
  return undefined;
};

const findMermaidSubjectLabel = (
  diagramType: string,
  lines: readonly string[],
): string | undefined => {
  for (const line of lines) {
    const graphMatch =
      diagramType.startsWith('graph ') || diagramType.startsWith('flowchart ')
        ? /\b[\w-]+\s*(?:\[\s*([^\]]+?)\s*\]|\(\s*([^)]+?)\s*\)|\{\s*([^}]+?)\s*\})/.exec(line)
        : undefined;
    const sequenceDeclaration =
      diagramType === 'sequenceDiagram'
        ? /^(?:participant|actor)\s+(?:(\S+)\s+as\s+)?(.+)$/i.exec(line)
        : undefined;
    const sequenceMessage =
      diagramType === 'sequenceDiagram'
        ? /^([\w-]+)\s*(?:-{1,2}|={1,2})[)>x-]/.exec(line)
        : undefined;
    const classMatch = diagramType === 'classDiagram' ? /^class\s+([\w$-]+)/.exec(line) : undefined;
    const label = stripMermaidLabelQuotes(
      graphMatch?.[1] ??
        graphMatch?.[2] ??
        graphMatch?.[3] ??
        sequenceDeclaration?.[2] ??
        sequenceDeclaration?.[1] ??
        sequenceMessage?.[1] ??
        classMatch?.[1] ??
        '',
    );
    if (label.length > 0) {
      return label;
    }
  }
  return undefined;
};

export const getMermaidDiagramDescription = (source: string): string | undefined => {
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('%%'));
  const firstLine = lines[0];
  if (!firstLine) {
    return undefined;
  }

  const diagramType = getMermaidDiagramType(firstLine);
  if (!diagramType) {
    return undefined;
  }

  const subjectLabel = findMermaidSubjectLabel(diagramType, lines.slice(1));
  return subjectLabel ? `${diagramType}: ${subjectLabel}` : diagramType;
};

export const getMermaidDiagramAccessibleLabel = (source: string): string => {
  const description = getMermaidDiagramDescription(source);
  return description
    ? formatString(getString('mermaidDiagramAriaLabelTemplate'), description)
    : getString('mermaidDiagramAriaLabel');
};

const parseSvgElement = (rawSvg: string): Element | undefined => {
  const documentParser = new DOMParser().parseFromString(rawSvg, 'image/svg+xml');
  return documentParser.querySelector('svg') ?? undefined;
};

const readNumericAttribute = (element: Element, attributeName: string): number | undefined => {
  const value = element.getAttribute(attributeName);
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return parsed;
};

const convertForeignObjectLabel = (foreignObject: Element): void => {
  const labelText = foreignObject.textContent?.replaceAll(/\s+/g, ' ').trim();
  if (!labelText || !foreignObject.parentElement) {
    foreignObject.remove();
    return;
  }

  const ownerDocument =
    foreignObject.ownerDocument ?? (typeof document === 'undefined' ? undefined : document);
  const textNode = ownerDocument?.createElementNS?.('http://www.w3.org/2000/svg', 'text');
  if (!textNode) {
    foreignObject.remove();
    return;
  }

  const x = readNumericAttribute(foreignObject, 'x');
  const y = readNumericAttribute(foreignObject, 'y');
  const width = readNumericAttribute(foreignObject, 'width');
  const height = readNumericAttribute(foreignObject, 'height');
  const anchorX = (x ?? 0) + (width ?? 0) / 2;
  const anchorY = (y ?? 0) + (height ?? 0) / 2;

  textNode.textContent = labelText;
  textNode.setAttribute('class', 'muninn-mermaid-fallback-label');
  textNode.setAttribute('x', String(anchorX));
  textNode.setAttribute('y', String(anchorY));
  textNode.setAttribute('text-anchor', 'middle');
  textNode.setAttribute('dominant-baseline', 'middle');
  textNode.setAttribute('pointer-events', 'none');

  foreignObject.parentElement.insertBefore(textNode, foreignObject);
  foreignObject.remove();
};

export const applyDiagramA11y = (svgElement: SVGElement, source: string): void => {
  const existingTitle = svgElement.querySelector('title');
  const existingDescription = svgElement.querySelector('desc');
  const label = existingTitle?.textContent?.trim() || getMermaidDiagramAccessibleLabel(source);
  svgElement.setAttribute('role', 'img');
  svgElement.setAttribute('aria-label', label);
  if (existingDescription?.textContent?.trim()) {
    const id =
      existingDescription.getAttribute('id') || `muninn-diagram-description-${crypto.randomUUID()}`;
    existingDescription.setAttribute('id', id);
    svgElement.setAttribute('aria-describedby', id);
  } else {
    svgElement.removeAttribute('aria-describedby');
  }
  if (existingTitle) return;

  const ownerDocument =
    svgElement.ownerDocument ?? (typeof document === 'undefined' ? undefined : document);
  const title = ownerDocument?.createElementNS?.('http://www.w3.org/2000/svg', 'title');
  if (!title) {
    return;
  }

  title.textContent = label;
  svgElement.insertBefore(title, svgElement.firstChild);
};

export const sanitizeMermaidSvg = (
  rawSvg: string,
  source = '',
  parse: (source: string) => Element | undefined = parseSvgElement,
): string => {
  const svgElement = parse(rawSvg);
  if (!svgElement) {
    return `<div class="muninn-mermaid-error">${escapeHtml(getString('mermaidNoSvgOutput'))}</div>`;
  }

  for (const node of svgElement.querySelectorAll('script,foreignObject,iframe,object,embed')) {
    if ((node.tagName ?? '').toLowerCase() === 'foreignobject') {
      convertForeignObjectLabel(node);
      continue;
    }

    node.remove();
  }

  for (const element of [svgElement, ...svgElement.querySelectorAll('*')]) {
    // NamedNodeMap is live; snapshot before removing attributes.
    const attributes = [...element.attributes];
    for (const attribute of attributes) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith('on')) {
        element.removeAttribute(attribute.name);
        continue;
      }
      if ((name === 'href' || name === 'xlink:href') && !value.startsWith('#')) {
        element.removeAttribute(attribute.name);
      }
    }
  }

  applyDiagramA11y(svgElement as SVGElement, source);
  return svgElement.outerHTML;
};
