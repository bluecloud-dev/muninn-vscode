// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createEditorViewport } from '../../src/webview/editor/editor-viewport';

describe('editor viewport', () => {
  it('owns width precedence, bounded zoom and reset through one presentation interface', () => {
    const dom = new JSDOM('<main><div></div></main>');
    try {
      const shell = dom.window.document.querySelector('main')!;
      const surface = shell.querySelector('div')!;
      const viewport = createEditorViewport(shell, surface);
      assert.equal(shell.style.getPropertyValue('--muninn-content-width'), '70ch');
      viewport.setContentWidth(88);
      assert.equal(shell.style.getPropertyValue('--muninn-content-width'), '88ch');
      for (let count = 0; count < 30; count++) viewport.execute('zoomIn');
      assert.equal(surface.style.zoom, '2');
      viewport.execute('fitToWidth');
      viewport.setContentWidth(64);
      assert.equal(shell.style.getPropertyValue('--muninn-content-width'), 'none');
      assert.equal(viewport.fitToWidth, true);
      for (let count = 0; count < 30; count++) viewport.execute('zoomOut');
      assert.equal(surface.style.zoom, '0.5');
      viewport.execute('resetZoom');
      assert.equal(viewport.zoomPercent, 100);
      assert.equal(viewport.fitToWidth, false);
      assert.equal(shell.style.getPropertyValue('--muninn-content-width'), '64ch');
      viewport.setContentWidth('full');
      assert.equal(shell.style.getPropertyValue('--muninn-content-width'), 'none');
      assert.equal(viewport.execute('toggleBold'), false);
      assert.equal(surface.style.zoom, '1');
    } finally {
      dom.window.close();
    }
  });
});
