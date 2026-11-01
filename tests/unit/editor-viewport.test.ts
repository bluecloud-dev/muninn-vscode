// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createEditorViewport, zoomLevels } from '../../src/webview/editor/editor-viewport';

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
      viewport.execute('setZoom100');
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

  it('sets only listed levels exactly and returns from fit to the configured width', () => {
    const dom = new JSDOM('<main><div></div></main>');
    try {
      const shell = dom.window.document.querySelector('main')!;
      const surface = shell.querySelector('div')!;
      const viewport = createEditorViewport(shell, surface);
      assert.deepEqual(
        zoomLevels,
        [50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200],
      );
      viewport.setContentWidth(80);
      viewport.execute('fitToWidth');
      assert.equal(viewport.execute('setZoom150'), true);
      assert.equal(viewport.zoomPercent, 150);
      assert.equal(viewport.fitToWidth, false);
      assert.equal(surface.style.zoom, '1.5');
      assert.equal(shell.style.getPropertyValue('--muninn-content-width'), '80ch');
      for (const command of ['setZoom155', 'setZoom40', 'setZoom210', 'setZoom', 'setZoom0150'])
        assert.equal(viewport.execute(command), false, command);
      assert.equal(viewport.zoomPercent, 150);
    } finally {
      dom.window.close();
    }
  });
});
