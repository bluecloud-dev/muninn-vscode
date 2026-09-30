// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { escapeHtml } from '../../src/webview/editor/localization';
import { getMermaidDiagramDescription, sanitizeMermaidSvg } from '../../src/webview/editor/preview';
import {
  renderMermaidDiagram,
  setMermaidRenderingEnabled,
  onMermaidPolicyChanged,
} from '../../src/webview/editor/renderers/mermaid-renderer';

describe('diagram security and accessibility', () => {
  const dom = new JSDOM('');
  const parse = (source: string) =>
    new dom.window.DOMParser().parseFromString(source, 'image/svg+xml').querySelector('svg') ??
    undefined;
  after(() => dom.window.close());

  it('describes common diagrams and handles empty or unsupported source', () => {
    assert.equal(getMermaidDiagramDescription('graph TD\nA[Start] --> B[End]'), 'graph TD: Start');
    assert.equal(
      getMermaidDiagramDescription('sequenceDiagram\nparticipant Alice'),
      'sequenceDiagram: Alice',
    );
    assert.equal(
      getMermaidDiagramDescription('classDiagram\nclass Animal'),
      'classDiagram: Animal',
    );
    assert.equal(getMermaidDiagramDescription('not a diagram'), undefined);
    assert.equal(getMermaidDiagramDescription('   \n'), undefined);
    assert.equal(escapeHtml('<script>&"'), '&lt;script&gt;&amp;&quot;');
  });

  it('rejects missing SVG and removes executable attributes including those on the SVG root', () => {
    assert.match(sanitizeMermaidSvg('<missing/>', '', parse), /no SVG output/);
    const output = sanitizeMermaidSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><a onclick="bad()" href="javascript:bad()">Bad</a><image href="https://remote/image.svg"/><use href="#local"/></svg>',
      'graph TD\nA[Start]',
      parse,
    );
    assert.doesNotMatch(output, /onload|onclick|javascript:|<script|https:\/\/remote/);
    assert.match(output, /href="#local"/);
    assert.match(output, /role="img"/);
    assert.match(output, /Mermaid diagram: graph TD: Start/);
  });

  it('preserves author-provided title and description with a valid accessible relationship', () => {
    const output = sanitizeMermaidSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><title>Deployment decisions</title><desc id="authored">Failure returns to review.</desc></svg>',
      'graph TD\nA[Start]',
      parse,
    );
    assert.match(output, /<title>Deployment decisions<\/title>/);
    assert.match(output, /<desc id="authored">Failure returns to review\.<\/desc>/);
    assert.match(output, /aria-describedby="authored"/);
    assert.match(output, /aria-label="Deployment decisions"/);
  });

  it('removes dangling root descriptions and converts HTML labels to inert text', () => {
    const output = sanitizeMermaidSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" aria-describedby="missing"><foreignObject x="10" y="20" width="40" height="16"><div xmlns="http://www.w3.org/1999/xhtml">Start</div></foreignObject></svg>',
      '',
      parse,
    );
    assert.doesNotMatch(output, /foreignObject|aria-describedby/);
    assert.match(output, /<text[^>]+x="30"[^>]+y="28"[^>]*>Start<\/text>/);
  });

  it('does not load or execute Mermaid when the host policy is disabled', async () => {
    setMermaidRenderingEnabled(false);
    const result = await renderMermaidDiagram('graph TD\nA --> B', 'disabled');
    assert.equal(result.ok, false);
    let changes = 0;
    const unsubscribe = onMermaidPolicyChanged(() => changes++);
    setMermaidRenderingEnabled(true);
    setMermaidRenderingEnabled(true);
    setMermaidRenderingEnabled(false);
    unsubscribe();
    assert.equal(changes, 2);
  });
});
