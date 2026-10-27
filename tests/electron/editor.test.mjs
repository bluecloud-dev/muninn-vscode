// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { download, runVSCodeCommand } from '@vscode/test-electron';
import { _electron as electron } from 'playwright-core';
import { resolveVSCodeExecutable } from '../../scripts/vscode-executable.mjs';

const root = process.cwd();
const version = process.env.VSCODE_VERSION || 'stable';
const manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const vsix = path.resolve(process.env.MUNINN_VSIX || `muninn-vscode-${manifest.version}.vsix`);
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
const lineStart = process.platform === 'darwin' ? 'Meta+ArrowLeft' : 'Home';
const lineEnd = process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End';
const selectLineEnd = process.platform === 'darwin' ? 'Meta+Shift+ArrowRight' : 'Shift+End';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'muninn-ui-'));
const workspace = path.join(temp, 'workspace');
const user = path.join(temp, 'user');
const extensions = path.join(temp, 'extensions');
// Recent VS Code shares application state outside user-data-dir; isolate it too.
const sharedArgs = (directory) =>
  version === '1.85.2' ? [] : ['--shared-data-dir=' + directory + '-shared'];
const artifactDirectory = path.resolve('artifacts/e2e', version);
fs.mkdirSync(workspace, { recursive: true });
fs.mkdirSync(path.join(user, 'User'), { recursive: true });
fs.mkdirSync(artifactDirectory, { recursive: true });
fs.writeFileSync(
  path.join(user, 'User', 'settings.json'),
  JSON.stringify({
    'workbench.startupEditor': 'none',
    'window.restoreWindows': 'none',
    'workbench.editor.enablePreview': false,
    'security.workspace.trust.enabled': false,
    'extensions.ignoreRecommendations': true,
    'chat.disableAIFeatures': true,
    'files.simpleDialog.enable': true,
    'update.mode': 'none',
    'telemetry.telemetryLevel': 'off',
  }),
);
let app, page;
const defaultThemes = [
  { id: version === '1.85.2' ? 'Default Light Modern' : 'Light Modern', uiTheme: 'vs' },
  { id: version === '1.85.2' ? 'Default Dark Modern' : 'Dark Modern', uiTheme: 'vs-dark' },
  { id: 'Default High Contrast', uiTheme: 'hc-black' },
  { id: 'Default High Contrast Light', uiTheme: 'hc-light' },
];
const evidence = {
  sha256: fs.existsSync(vsix)
    ? crypto.createHash('sha256').update(fs.readFileSync(vsix)).digest('hex')
    : undefined,
  requestedVersion: version,
  platform: process.platform,
  arch: process.arch,
  node: process.version,
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
};
const writeEvidence = () =>
  fs.writeFileSync(
    path.join(artifactDirectory, 'candidate.json'),
    JSON.stringify(evidence, null, 2) + '\n',
  );
async function vscodeExecutable() {
  return resolveVSCodeExecutable(await download({ version }));
}
async function activateMuninn() {
  // The palette snapshots available commands. Reopen it while extensions are registering.
  await eventually(
    async () => {
      await page.keyboard.press(`${modifier}+Shift+P`);
      await page
        .locator('.quick-input-widget input[type="text"]')
        .fill('>Muninn for VS Code: New Markdown Note');
      try {
        await page
          .getByText('Muninn for VS Code: New Markdown Note', { exact: true })
          .first()
          .waitFor({ timeout: 1000 });
        return true;
      } catch {
        await page.keyboard.press('Escape');
        return false;
      }
    },
    'Muninn command contribution unavailable after installation',
    30000,
  );
  await page.keyboard.press('Escape');
  await command('Muninn for VS Code: Inspect Configuration');
}
async function eventually(check, message, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
}
async function resizeEditorPane(editor, nativeWindow, target) {
  let matchingSamples = 0;
  await eventually(
    async () => {
      const width = await editor.evaluate(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return innerWidth;
      });
      if (Math.abs(width - target) <= 1) return ++matchingSamples >= 3;
      matchingSamples = 0;
      const current = await nativeWindow.evaluate((window) => ({
        width: window.getSize()[0],
        height: window.getSize()[1],
        zoom: window.webContents.getZoomFactor(),
      }));
      await nativeWindow.evaluate(
        (window, size) => {
          window.setMinimumSize(200, 200);
          window.setSize(size.width, size.height);
        },
        {
          width: Math.round(current.width + (target - width) * current.zoom),
          height: current.height,
        },
      );
      return false;
    },
    'Native editor did not resize to ' + target + ' CSS pixels',
  );
}
async function command(label) {
  const item = page.getByText(label, { exact: true }).first();
  await eventually(async () => {
    try {
      await page.bringToFront();
      const activeTab = page.locator('.tabs-container .tab.active').first();
      if (await activeTab.count()) await activeTab.focus();
      await page.keyboard.press(`${modifier}+Shift+P`);
      await page
        .locator('.quick-input-widget input[type="text"]')
        .fill('>' + label, { timeout: 2500 });
      // Retry palette setup before dispatch, so a late focus change cannot repeat a command.
      await item.click({ trial: true, timeout: 1000 });
      return true;
    } catch (error) {
      if (error.name !== 'TimeoutError') throw error;
      await page.keyboard.press('Escape');
      return false;
    }
  }, 'Command unavailable: ' + label);
  await item.click();
}
async function visibleEditorFrame(name) {
  for (const frame of page.frames()) {
    try {
      const prose = frame.locator('.ProseMirror');
      if (
        (await prose.isVisible()) &&
        (await prose.getAttribute('aria-label')) === 'Markdown editor — ' + name
      ) {
        return frame;
      }
    } catch {
      /* VS Code can replace a webview frame while opening or updating a file. */
    }
  }
  return undefined;
}
async function open(name, source) {
  const file = path.join(workspace, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (source !== undefined) fs.writeFileSync(file, source);
  const notOpened = 'Default Markdown editor did not open ' + name;
  let editor;
  await eventually(
    async () => {
      // A newly written file may be absent from Quick Open's first search, or
      // VS Code may close Quick Open while its workbench is still settling.
      try {
        await page.keyboard.press('Escape');
        await page.bringToFront();
        // A file-link navigation can leave CDP keyboard input on the previous guest frame.
        const activeTab = page.locator('.tabs-container .tab.active').first();
        if (await activeTab.count()) await activeTab.focus();
        await page.keyboard.press(`${modifier}+P`);
        await page.locator('.quick-input-widget input[type="text"]').fill(file, { timeout: 2500 });
        await page
          .locator('.quick-input-list .monaco-list-row')
          .filter({ hasText: name })
          .first()
          .click({ timeout: 2500 });
        await eventually(
          async () => {
            editor = await visibleEditorFrame(name);
            return Boolean(editor);
          },
          notOpened,
          5000,
        );
        return true;
      } catch (error) {
        if (error.name !== 'TimeoutError' && error.message !== notOpened) throw error;
        return false;
      }
    },
    notOpened,
    30000,
  );
  return { editor, file };
}
async function save(editor, file, expected) {
  let currentEditor = editor;
  await eventually(async () => {
    try {
      await currentEditor.locator('.ProseMirror').press(`${modifier}+s`, { timeout: 3000 });
      return true;
    } catch (error) {
      if (!currentEditor.isDetached() && !/frame was detached/i.test(String(error))) throw error;
      currentEditor = (await visibleEditorFrame(path.basename(file))) ?? currentEditor;
      return false;
    }
  }, 'Markdown editor frame was replaced before save');
  try {
    await eventually(
      () => fs.readFileSync(file, 'utf8') === expected,
      'Saved source differs: ' + fs.readFileSync(file, 'utf8'),
    );
    // The disk write can finish before VS Code clears its dirty tab and close confirmation.
    await page
      .locator('.tab.dirty')
      .filter({ hasText: path.basename(file) })
      .waitFor({ state: 'hidden' });
  } catch (error) {
    error.message += '\\nActual file: ' + JSON.stringify(fs.readFileSync(file, 'utf8'));
    throw error;
  }
  return (await visibleEditorFrame(path.basename(file))) ?? currentEditor;
}

async function clickTool(editor, command, keyboard = false) {
  const activate = async (button) => {
    if (keyboard) {
      await button.waitFor({ state: 'visible' });
      await button.press('Enter');
    } else await button.click();
  };
  if (command === 'insertTable') {
    await clickTool(editor, 'chooseTableAction', keyboard);
    await activate(editor.locator('#muninn-toolbar-menu [data-command="insertTable"]'));
    return;
  }
  const inline = editor.locator('.muninn-toolbar [data-command="' + command + '"]');
  if (await inline.isVisible()) await activate(inline);
  else {
    await activate(editor.locator('[data-testid="muninn-toolbar-more"]'));
    await activate(editor.locator('#muninn-toolbar-menu [data-command="' + command + '"]'));
  }
}

async function clickZoomedContent(editor, locator, offset, clickCount = 1) {
  const point = await locator.evaluate(async (element, offset) => {
    element.scrollIntoView({ block: 'center' });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const shell = document.querySelector('#editor-shell');
    const surface = document.querySelector('#editor');
    const scale = shell.clientWidth / surface.getBoundingClientRect().width;
    const rect = element.getBoundingClientRect();
    const x = rect.left * scale + (offset?.x ?? (rect.width * scale) / 2);
    const y = rect.top * scale + (offset?.y ?? (rect.height * scale) / 2);
    return { x, y, hit: element.contains(document.elementFromPoint(x, y)) };
  }, offset);
  assert.equal(point.hit, true, JSON.stringify(point));
  const frameBounds = await (await editor.frameElement()).boundingBox();
  const frameScale = frameBounds.width / (await editor.evaluate(() => innerWidth));
  await locator.evaluate((element) => {
    window.__muninnTestClick = undefined;
    document.addEventListener(
      'click',
      (event) => {
        window.__muninnTestClick = {
          hit: element.contains(event.target),
          tag: event.target.tagName,
        };
      },
      { once: true, capture: true },
    );
  });
  await page.mouse.click(
    frameBounds.x + point.x * frameScale,
    frameBounds.y + point.y * frameScale,
    { clickCount },
  );
  const clicked = await editor.evaluate(() => {
    const result = window.__muninnTestClick;
    delete window.__muninnTestClick;
    return result;
  });
  assert.equal(clicked?.hit, true, JSON.stringify({ point, frameBounds, frameScale, clicked }));
}

describe('packaged Muninn in real VS Code', { concurrency: false, timeout: 240000 }, () => {
  before(async () => {
    assert.ok(fs.existsSync(vsix), 'Run npm run package before this suite');
    const executablePath = await vscodeExecutable();
    const installation = await runVSCodeCommand(
      [
        '--install-extension',
        vsix,
        '--extensions-dir',
        extensions,
        '--user-data-dir',
        user,
        ...sharedArgs(user),
      ],
      { version },
    );
    fs.writeFileSync(
      path.join(artifactDirectory, 'installation.log'),
      installation.stdout + installation.stderr,
    );
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.NODE_OPTIONS;
    app = await electron.launch({
      executablePath,
      env,
      timeout: 45000,
      args: [
        workspace,
        ...sharedArgs(user),
        '--no-sandbox',
        '--disable-gpu',
        '--disable-workspace-trust',
        '--skip-welcome',
        '--skip-release-notes',
        '--user-data-dir=' + user,
        '--extensions-dir=' + extensions,
      ],
    });
    page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    page.on('pageerror', (error) => {
      evidence.pageErrors ??= [];
      evidence.pageErrors.push(error.stack ?? error.message);
      writeEvidence();
    });
    await page.locator('.monaco-workbench').waitFor();
    evidence.vscode = await app.evaluate(({ app }) => app.getVersion());
    writeEvidence();
    await activateMuninn();
    await app.context().setOffline(true);
    evidence.offline = true;
    await app.context().tracing.start({ screenshots: true, snapshots: true });
  });
  beforeEach(async () => {
    for (const key of ['Meta', 'Control', 'Alt', 'Shift']) await page.keyboard.up(key);
    await (await app.browserWindow(page)).evaluate((window) => window.focus());
    await page.bringToFront();
    await page.keyboard.press('Escape');
    // The configuration log can open its panel after the activation command returns.
    const panel = page.locator('[id="workbench.parts.panel"]');
    if (await panel.isVisible()) {
      await page.keyboard.press(`${modifier}+j`);
      await panel.waitFor({ state: 'hidden' });
    }
    // Retained webviews multiply trace work; each scenario owns its saved editors.
    const savedTabs = page.locator('.tabs-container .tab:not(.dirty)');
    if (await savedTabs.count()) {
      await command('View: Close Saved Editors in Group');
      await eventually(
        async () => (await savedTabs.count()) === 0,
        'Saved editors did not close before the next scenario',
      );
    }
  });
  after(async () => {
    if (app) {
      try {
        if (page) {
          await page
            .screenshot({ path: path.join(artifactDirectory, 'workbench.png') })
            .catch(() => {});
        }
        await app
          .context()
          .tracing.stop({ path: path.join(artifactDirectory, 'trace.zip') })
          .catch(() => {});
      } finally {
        await app.close();
        fs.cpSync(path.join(user, 'logs'), path.join(artifactDirectory, 'vscode-logs'), {
          recursive: true,
        });
      }
    }
    // Isolated profile retained in the OS temp directory for failure investigation.
  });

  it('opens by default, preserves source on save, and supports immediate typing/save/undo', async () => {
    const source = '# Reading\n\nAlpha\n';
    let { editor, file } = await open('reading.md', source);
    await page.getByText('Muninn: Report issue', { exact: true }).waitFor();
    assert.equal(await editor.locator('.muninn-toolbar').getAttribute('role'), 'toolbar');
    assert.equal(await editor.locator('.muninn-preview').count(), 0);
    editor = await save(editor, file, source);
    await editor.locator('.ProseMirror p').click();
    await editor.locator('.ProseMirror').press(lineEnd);
    await editor.locator('.ProseMirror').pressSequentially('XY');
    editor = await save(editor, file, '# Reading\n\nAlphaXY\n');
    await editor.locator('.ProseMirror').press(`${modifier}+z`);
    await eventually(async () => {
      editor = (await visibleEditorFrame('reading.md')) ?? editor;
      try {
        return (await editor.locator('.ProseMirror p').innerText()) === 'Alpha';
      } catch (error) {
        if (
          !editor.isDetached() &&
          !String(error).includes('Target page, context or browser has been closed')
        )
          throw error;
        return false;
      }
    }, 'Undo did not restore text');
    await save(editor, file, source);
  });

  for (const [name, source, continued] of [
    ['bullet-list.md', '- First\n', '- First\n- Next\n'],
    ['ordered-list.md', '7) First\r\n', '7) First\r\n8) Next\r\n'],
    ['task-list.md', '+ [X] First\n', '+ [X] First\n+ [ ] Next\n'],
  ]) {
    it('continues a list with keyboard, save, undo, redo and reopen: ' + name, async () => {
      let { editor, file } = await open(name, source);
      await editor.locator('.ProseMirror li p').last().click();
      await editor.locator('.ProseMirror').press(lineEnd);
      await editor.locator('.ProseMirror').press('Enter');
      await eventually(
        async () => (await editor.locator('.ProseMirror li').count()) === 2,
        'Enter did not create a sibling list item',
      );
      await editor.locator('.ProseMirror').pressSequentially('Next');
      editor = await save(editor, file, continued);
      await command('Muninn for VS Code: Undo');
      editor = await save(editor, file, source);
      await command('Muninn for VS Code: Redo');
      editor = await save(editor, file, continued);
      await editor.locator('.ProseMirror').pressSequentially('!');
      editor = await save(editor, file, continued.replace('Next', 'Next!'));
      await command('View: Close Editor');
      await eventually(
        async () => (await page.locator('.tab').filter({ hasText: name }).count()) === 0,
        'Editor tab did not close: ' + name,
      );
      ({ editor } = await open(name));
      await eventually(
        async () =>
          (await editor.locator('.ProseMirror li p').last().innerText()).includes('Next!'),
        'Reopened list differs from saved source: ' + fs.readFileSync(file, 'utf8'),
      );
      await save(editor, file, continued.replace('Next', 'Next!'));
    });
  }

  it('fits and zooms the document independently while retaining selection, edits and source bytes', async () => {
    await command('View: Close All Editors');
    fs.writeFileSync(
      path.join(workspace, 'wide.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="160"><rect width="1600" height="160" fill="steelblue"/></svg>',
    );
    const source =
      '# Viewport\n\nAlpha beta gamma.\n\n![Wide](wide.svg)\n\n```javascript\nconst text = "' +
      'long_code_'.repeat(100) +
      '";\n```\n\n' +
      '| One | Two | Three | Four | Five | Six |\n| --- | --- | --- | --- | --- | --- |\n| First cell | Second | Third | Fourth | Fifth | Sixth |\n\n' +
      'Long document paragraph with ordinary readable prose.\n\n'.repeat(100);
    const { editor, file } = await open('viewport.md', source);
    assert.equal(await editor.locator('.muninn-toolbar [data-command="resetZoom"]').count(), 1);
    const nativeWindow = await app.browserWindow(page);
    const bounds = await nativeWindow.evaluate((window) => window.getBounds());
    const resize = (target) => resizeEditorPane(editor, nativeWindow, target);
    const measure = () =>
      editor.evaluate(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const shell = document.querySelector('#editor-shell');
        const prose = document.querySelector('.ProseMirror');
        const toolbar = document.querySelector('.muninn-toolbar');
        const pre = document.querySelector('.muninn-code-node-body');
        const table = document.querySelector('.muninn-table-node-grid');
        const image = document.querySelector('.ProseMirror img[alt="Wide"]');
        const surface = document.querySelector('#editor');
        // VS Code can retain Chromium's pre-128 CSS-zoom coordinate behavior.
        const coordinateScale = shell.clientWidth / surface.getBoundingClientRect().width;
        return {
          viewport: innerWidth,
          viewportHeight: innerHeight,
          zoom: document.querySelector('#editor').style.zoom,
          percentage: document.querySelector('[data-command="resetZoom"]').textContent,
          proseWidth: prose.getBoundingClientRect().width * coordinateScale,
          coordinateScale,
          userAgent: navigator.userAgent,
          proseLeft: prose.getBoundingClientRect().left * coordinateScale,
          proseRight: prose.getBoundingClientRect().right * coordinateScale,
          imageWidth: image.getBoundingClientRect().width * coordinateScale,
          bodyOverflow: document.body.scrollWidth > innerWidth,
          shellOverflow: shell.scrollWidth > shell.clientWidth + 1,
          verticalScroll: shell.scrollHeight > shell.clientHeight,
          toolbarOverflow: toolbar.scrollWidth > toolbar.clientWidth + 1,
          codeOverflow: pre.scrollWidth > pre.clientWidth,
          tableContained:
            table.getBoundingClientRect().right <= prose.getBoundingClientRect().right + 1,
        };
      });
    const check = async () => {
      const geometry = await measure();
      assert.ok(geometry.viewportHeight >= 120, JSON.stringify(geometry));
      assert.equal(geometry.bodyOverflow, false, JSON.stringify(geometry));
      assert.equal(geometry.shellOverflow, false, JSON.stringify(geometry));
      assert.equal(geometry.toolbarOverflow, false, JSON.stringify(geometry));
      assert.equal(geometry.verticalScroll, true, JSON.stringify(geometry));
      assert.equal(geometry.codeOverflow, true, JSON.stringify(geometry));
      assert.equal(geometry.tableContained, true, JSON.stringify(geometry));
      assert.ok(
        geometry.proseLeft >= 0 && geometry.proseRight <= geometry.viewport + 1,
        JSON.stringify(geometry),
      );
      assert.ok(geometry.imageWidth <= geometry.proseWidth + 1, JSON.stringify(geometry));
      assert.equal(
        await editor.locator('.muninn-toolbar [data-command="resetZoom"]').isVisible(),
        true,
      );
      return geometry;
    };
    evidence.editorZoom = [];
    try {
      await resize(1440);
      await editor.locator('.ProseMirror img[alt="Wide"]').evaluate((image) => image.decode());
      const comfortable = await check();
      await clickTool(editor, 'fitToWidth', true);
      const fitted = await check();
      assert.ok(fitted.proseWidth > comfortable.proseWidth);
      for (const width of [1024, 480, 320]) {
        await resize(width);
        evidence.editorZoom.push(await check());
      }
      for (let count = 0; count < 10; count++) await clickTool(editor, 'zoomIn', true);
      assert.equal((await check()).percentage, '200%');
      await page.screenshot({ path: path.join(artifactDirectory, 'editor-zoom-200.png') });
      evidence.editorZoom.push(await check());
      await clickTool(editor, 'resetZoom', true);
      for (let count = 0; count < 5; count++) await clickTool(editor, 'zoomOut', true);
      assert.equal((await check()).percentage, '50%');
      await page.screenshot({ path: path.join(artifactDirectory, 'editor-zoom-50.png') });
      evidence.editorZoom.push(await check());
      await clickTool(editor, 'resetZoom', true);
      // Enter operates the visible percentage control through the existing keyboard focus model.
      await editor.locator('.muninn-toolbar [data-command="resetZoom"]').focus();
      await page.keyboard.press('Enter');
      assert.equal((await check()).percentage, '100%');
      await nativeWindow.evaluate((window) => window.webContents.setZoomFactor(2));
      await resize(320);
      await clickTool(editor, 'zoomIn', true);
      assert.equal((await check()).percentage, '110%');
      evidence.editorZoom.push({ ...(await check()), applicationZoom: 2 });
      await nativeWindow.evaluate((window) => window.webContents.setZoomFactor(1));
      await resize(640);
      for (let count = 0; count < 9; count++) await clickTool(editor, 'zoomIn', true);
      const paragraph = editor.locator('.ProseMirror > p').first();
      await clickZoomedContent(editor, paragraph, { x: 8, y: 8 }, 2);
      // Windows word selection includes the following space; keep the same exact edit target.
      if (await editor.evaluate(() => getSelection().toString() === 'Alpha ')) {
        await page.keyboard.press('Shift+ArrowLeft');
      }
      await eventually(
        () => editor.evaluate(() => getSelection().toString() === 'Alpha'),
        'Mouse selection did not select Alpha at 200%',
      );
      await clickTool(editor, 'zoomOut', true);
      await clickTool(editor, 'toggleBold', true);
      const bold = source.replace('Alpha beta', '**Alpha** beta');
      await save(editor, file, bold);
      await clickTool(editor, 'fitToWidth', true);
      await command('Muninn for VS Code: Undo');
      await save(editor, file, source);
      await clickTool(editor, 'zoomIn', true);
      await command('Muninn for VS Code: Redo');
      await save(editor, file, bold);
      await command('Muninn for VS Code: Undo');
      await save(editor, file, source);
      await clickZoomedContent(
        editor,
        editor.locator('[data-testid="muninn-table-toggle-source"]'),
      );
      assert.equal(await paragraph.textContent(), 'Alpha beta gamma.');
      const helpGeometry = await editor
        .locator('[data-testid="muninn-table-toggle-source"]')
        .evaluate(async (button) => {
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
          const shell = document.querySelector('#editor-shell');
          const surface = document.querySelector('#editor');
          const scale = shell.clientWidth / surface.getBoundingClientRect().width;
          const anchor = button.getBoundingClientRect();
          const tooltip = document.querySelector('[role="tooltip"]');
          const hint = tooltip.getBoundingClientRect();
          return {
            scale,
            hidden: tooltip.hidden,
            anchorTop: anchor.top * scale,
            anchorBottom: anchor.bottom * scale,
            hintTop: hint.top,
            hintBottom: hint.bottom,
            hintLeft: hint.left,
            hintRight: hint.right,
            paneWidth: innerWidth,
          };
        });
      assert.equal(helpGeometry.hidden, false, JSON.stringify(helpGeometry));
      // Integer layout metrics can differ from rendered bounds by one CSS pixel.
      assert.ok(
        helpGeometry.hintLeft >= 7 && helpGeometry.hintRight <= helpGeometry.paneWidth - 7,
        JSON.stringify(helpGeometry),
      );
      assert.ok(
        Math.min(
          Math.abs(helpGeometry.hintTop - helpGeometry.anchorBottom),
          Math.abs(helpGeometry.anchorTop - helpGeometry.hintBottom),
        ) <= 8,
        JSON.stringify(helpGeometry),
      );
      await page.screenshot({ path: path.join(artifactDirectory, 'zoomed-table-help.png') });
      const draft = editor.locator('textarea');
      await draft.fill('unapplied zoom draft');
      await draft.evaluate((input) => input.setSelectionRange(2, 7));
      await clickTool(editor, 'fitToWidth', true);
      await clickTool(editor, 'zoomIn', true);
      assert.deepEqual(
        await draft.evaluate((input) => [input.value, input.selectionStart, input.selectionEnd]),
        ['unapplied zoom draft', 2, 7],
      );
      await clickTool(editor, 'resetZoom', true);
      await save(editor, file, source);
      await editor.locator('[data-testid="muninn-table-toggle-source"]').focus();
      await page.keyboard.press('Enter');
      await clickTool(editor, 'fitToWidth', true);
      // Multiple views of one document are disabled on the supported minimum version.
      await command('View: New Editor Group to the Right');
      const { editor: rightEditor } = await open(
        'viewport-right.md',
        '# Independent view\n\nRight pane.\n',
      );
      const splitFrames = [editor, rightEditor];
      for (const frame of splitFrames) {
        assert.equal(await (await frame.frameElement()).isVisible(), true);
        assert.equal(
          await frame.evaluate(() => {
            const shell = document.querySelector('#editor-shell');
            return (
              shell.scrollWidth <= shell.clientWidth + 1 && document.body.scrollWidth <= innerWidth
            );
          }),
          true,
        );
      }
      await clickTool(rightEditor, 'zoomIn', true);
      assert.equal(
        await rightEditor.locator('.muninn-toolbar [data-command="resetZoom"]').textContent(),
        '110%',
      );
      assert.equal(
        await editor.locator('.muninn-toolbar [data-command="resetZoom"]').textContent(),
        '100%',
      );
      await command('View: Close Editor');
      await page
        .locator('.tab')
        .filter({ hasText: 'viewport-right.md' })
        .waitFor({ state: 'hidden' });
      await command('View: Join All Editor Groups');
      await editor.locator('.ProseMirror').waitFor();
      await resize(1440);
      await clickTool(editor, 'resetZoom', true);
      assert.ok(Math.abs((await check()).proseWidth - comfortable.proseWidth) <= 1);
      for (const [command, steps] of [
        ['zoomIn', 10],
        ['zoomOut', 5],
      ]) {
        assert.equal(
          await editor.locator('.muninn-toolbar [data-command="' + command + '"]').isVisible(),
          true,
        );
        for (let count = 0; count < steps; count++) await clickTool(editor, command, true);
        assert.equal(
          await editor
            .locator('.muninn-toolbar [data-command="resetZoom"]')
            .evaluate((button) => document.activeElement === button),
          true,
        );
        await page.keyboard.press('Enter');
        assert.equal((await check()).percentage, '100%');
      }
      assert.equal(fs.readFileSync(file, 'utf8'), source);
      await page.screenshot({ path: path.join(artifactDirectory, 'editor-zoom.png') });
      evidence.editorZoomSourcePreserved = true;
      evidence.editorZoomSplitPanes = true;
      writeEvidence();
    } finally {
      await command('View: Join All Editor Groups');
      await nativeWindow.evaluate((window, original) => {
        window.webContents.setZoomFactor(1);
        window.setBounds(original);
      }, bounds);
    }
  });

  it('keeps ordinary table values readable in a 320 CSS-pixel pane', async () => {
    const { editor, file } = await open(
      'narrow-table.md',
      '| Area | Scenario | Result |\n| --- | --- | --- |\n| Editor | Keyboard navigation | Narrow split panes |\n\n```Unknown-Language-With-A-Long-Name\n' +
        'long_code_'.repeat(100) +
        '\n```\n',
    );
    const nativeWindow = await app.browserWindow(page);
    const bounds = await nativeWindow.evaluate((window) => window.getBounds());
    const expectedCommands = await editor
      .locator('.muninn-toolbar [data-command]')
      .evaluateAll((buttons) => buttons.map((button) => button.dataset.command));
    try {
      const resize = (target) => resizeEditorPane(editor, nativeWindow, target);
      const measure = () =>
        editor.evaluate(async () => {
          // Native zoom/resizing also schedules webview layout and ResizeObserver callbacks.
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
          const grid = document.querySelector('.muninn-table-node-grid');
          const cells = [...document.querySelectorAll('tbody input')].map((input) => {
            const style = getComputedStyle(input);
            const canvas = document.createElement('canvas').getContext('2d');
            canvas.font = style.font;
            return {
              value: input.value,
              available:
                input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
              text: canvas.measureText(input.value).width,
            };
          });
          const toolbar = document.querySelector('.muninn-toolbar');
          const codeBody = document.querySelector('.muninn-code-node-body');
          const buttons = [...toolbar.querySelectorAll('button')].filter(
            (button) => !button.hidden,
          );
          return {
            width: innerWidth,
            cells,
            overflow: grid.scrollWidth > grid.clientWidth,
            bodyOverflow: document.body.scrollWidth > innerWidth,
            codeOverflow: codeBody.scrollWidth > codeBody.clientWidth,
            shellOverflow: document.querySelector('.muninn-editor-shell').scrollWidth > innerWidth,
            languageRight: document
              .querySelector('.muninn-code-node-language')
              .getBoundingClientRect().right,
            toolbarOverflow: toolbar.scrollWidth > toolbar.clientWidth,
            targets: buttons.map((button) => {
              const r = button.getBoundingClientRect();
              return {
                name: button.getAttribute('aria-label'),
                command: button.dataset.command,
                width: r.width,
                height: r.height,
                top: r.top,
                right: r.right,
              };
            }),
          };
        });
      evidence.geometry = [];
      for (const target of [320, 375, 480, 768, 1024, 1440]) {
        await resize(target);
        const geometry = await measure();
        assert.ok(Math.abs(geometry.width - target) <= 1, JSON.stringify(geometry));
        assert.equal(geometry.bodyOverflow, false);
        assert.equal(geometry.shellOverflow, false);
        assert.equal(geometry.codeOverflow, true);
        assert.ok(geometry.languageRight <= geometry.width);
        assert.equal(geometry.toolbarOverflow, false);
        // Native fonts can fit this table at 375px; 320px still requires local scrolling.
        if (target === 320) assert.equal(geometry.overflow, true);
        for (const cell of geometry.cells)
          assert.ok(cell.available >= cell.text, JSON.stringify(cell));
        for (const button of geometry.targets) {
          assert.ok(button.width >= 32 && button.height >= 32, JSON.stringify(button));
          assert.equal(button.top, geometry.targets[0].top, 'Toolbar must remain one row');
          assert.ok(button.right <= geometry.width, JSON.stringify(button));
        }
        const visible = geometry.targets.map((button) => button.command).filter(Boolean);
        const more = editor.locator('[data-testid="muninn-toolbar-more"]');
        if (await more.isVisible()) {
          await more.click();
          const overflow = await editor
            .locator('#muninn-toolbar-menu button')
            .evaluateAll((rows) => rows.map((row) => row.dataset.command));
          assert.deepEqual(new Set([...visible, ...overflow]), new Set(expectedCommands));
          assert.equal(visible.length + overflow.length, expectedCommands.length);
          await editor.locator('#muninn-toolbar-menu button').first().press('Escape');
        } else assert.deepEqual(new Set(visible), new Set(expectedCommands));
        if (target === 1440) assert.equal(await more.isVisible(), false);
        evidence.geometry.push(geometry);
        if (target <= 375)
          await page.screenshot({ path: path.join(artifactDirectory, 'pane-' + target + '.png') });
      }
      await resize(320);
      await editor.evaluate(() =>
        document.documentElement.style.setProperty('--vscode-font-size', '24px'),
      );
      await eventually(
        async () => !(await measure()).toolbarOverflow,
        'Toolbar did not settle after font size changed',
      );
      const large = await measure();
      assert.equal(large.bodyOverflow, false);
      assert.equal(large.toolbarOverflow, false);
      for (const button of large.targets) assert.ok(button.width >= 32 && button.height >= 32);
      evidence.largeFont = large;
      await editor.evaluate(() =>
        document.documentElement.style.removeProperty('--vscode-font-size'),
      );
      await nativeWindow.evaluate((window) => window.webContents.setZoomFactor(2));
      await resize(320);
      evidence.zoom200 = await measure();
      evidence.zoom200.factor = await nativeWindow.evaluate((window) =>
        window.webContents.getZoomFactor(),
      );
      writeEvidence();
      assert.equal(evidence.zoom200.factor, 2);
      assert.ok(Math.abs(evidence.zoom200.width - 320) <= 1, JSON.stringify(evidence.zoom200));
      assert.equal(evidence.zoom200.bodyOverflow, false, JSON.stringify(evidence.zoom200));
      assert.equal(evidence.zoom200.toolbarOverflow, false);
      await nativeWindow.evaluate((window) => window.webContents.setZoomFactor(1));
      await resize(320);
      await eventually(async () => {
        const height = await editor.evaluate(() => innerHeight);
        if (height >= 120 && height <= 240) return true;
        const current = await nativeWindow.evaluate((window) => window.getBounds());
        await nativeWindow.evaluate((window, size) => window.setSize(size.width, size.height), {
          width: current.width,
          height: Math.max(300, Math.round(current.height + 200 - height)),
        });
        return false;
      }, 'Short native editor pane unavailable');
      await editor.locator('[data-testid="muninn-toolbar-more"]').click();
      const popup = await editor.locator('#muninn-toolbar-menu').evaluate((menu) => {
        const rect = menu.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          height: innerHeight,
          width: innerWidth,
          scrolls: menu.scrollHeight > menu.clientHeight,
        };
      });
      assert.ok(
        popup.left >= 0 &&
          popup.right <= popup.width &&
          popup.top >= 0 &&
          popup.bottom <= popup.height,
        JSON.stringify(popup),
      );
      assert.equal(popup.scrolls, true);
      evidence.shortPane = popup;
      await editor.locator('#muninn-toolbar-menu button').first().press('Escape');
      await nativeWindow.evaluate(
        (window, original) => window.setSize(window.getSize()[0], original.height),
        bounds,
      );
      const cell = editor.locator('tbody input').last();
      await cell.focus();
      await cell.evaluate((input) => input.setSelectionRange(2, 5));
      for (let target = 320; target <= 480; target += 16) await resize(target);
      assert.deepEqual(
        await cell.evaluate((input) => [input.value, input.selectionStart, input.selectionEnd]),
        ['Narrow split panes', 2, 5],
      );
      await editor.evaluate(() => {
        for (const button of document.querySelectorAll('button[data-help]')) {
          button.dataset.help = button.dataset.help.repeat(2);
          button.setAttribute('aria-label', button.getAttribute('aria-label').repeat(2));
        }
      });
      await editor.locator('[data-testid="muninn-toolbar-more"]').focus();
      let tooltipGeometry;
      await eventually(async () => {
        tooltipGeometry = await editor.locator('[role="tooltip"]').evaluate((help) => {
          const rect = help.getBoundingClientRect();
          return {
            width: rect.width,
            left: rect.left,
            right: rect.right,
            pane: innerWidth,
            hidden: help.hidden,
            text: help.textContent,
            active: document.activeElement?.outerHTML,
          };
        });
        return (
          tooltipGeometry.width > 0 &&
          tooltipGeometry.left >= 0 &&
          tooltipGeometry.right <= tooltipGeometry.pane
        );
      }, 'Expanded tooltip did not settle inside the pane').catch((error) => {
        error.message += ': ' + JSON.stringify(tooltipGeometry);
        throw error;
      });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      assert.equal(
        await editor.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
        true,
      );
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await editor.locator('[data-testid="muninn-table-toggle-source"]').click();
      const draft = editor.locator('textarea');
      await draft.fill('unapplied draft');
      await draft.evaluate((input) => input.setSelectionRange(2, 5));
      await resize(375);
      await resize(320);
      assert.deepEqual(
        await draft.evaluate((input) => [input.value, input.selectionStart, input.selectionEnd]),
        ['unapplied draft', 2, 5],
      );
      await editor.getByRole('button', { name: /Add to table/ }).click();
      await page.locator('.quick-input-widget input[type="text"]').waitFor();
      await page.keyboard.press('Escape');
      assert.equal(await draft.inputValue(), 'unapplied draft');
      const settingsPath = path.join(user, 'User/settings.json');
      const settings = fs.readFileSync(settingsPath, 'utf8');
      try {
        fs.writeFileSync(
          settingsPath,
          JSON.stringify({ ...JSON.parse(settings), 'muninn.toolbar.mode': 'advanced' }),
        );
        for (const target of [320, 375, 480, 768, 1024, 1440]) {
          await resize(target);
          const geometry = await measure();
          assert.equal(geometry.toolbarOverflow, false);
          if (target === 1440) {
            assert.equal(geometry.targets.length, expectedCommands.length);
            assert.equal(
              await editor.locator('[data-testid="muninn-toolbar-more"]').isVisible(),
              false,
            );
          } else if (target === 320) assert.ok(geometry.targets.length < expectedCommands.length);
        }
        assert.equal(
          JSON.parse(fs.readFileSync(settingsPath, 'utf8'))['muninn.toolbar.mode'],
          'advanced',
        );
      } finally {
        fs.writeFileSync(settingsPath, settings);
      }
      evidence.resizeRetention = true;
      evidence.longLabels = 'Doubled DOM names and help';
      evidence.reducedMotion = true;
      evidence.legacyPreferenceIgnored = true;
      writeEvidence();
      assert.equal(fs.readFileSync(file, 'utf8').includes('Keyboard navigation'), true);
    } finally {
      await nativeWindow.evaluate((window, original) => {
        window.webContents.setZoomFactor(1);
        window.setBounds(original);
      }, bounds);
    }
  });

  it('chooses local headings without losing selection or adding a duplicate undo entry', async () => {
    let { editor, file } = await open('block-style.md', 'Alpha\n\nBeta\n');
    await eventually(async () => {
      await editor.locator('.ProseMirror p').last().click();
      await editor.locator('.ProseMirror').press(lineStart);
      await editor.locator('.ProseMirror').press(selectLineEnd);
      return (await editor.evaluate(() => getSelection().toString())) === 'Beta';
    }, 'Native text selection did not reach Beta');
    const style = editor.locator('.muninn-toolbar [data-command="chooseBlockStyle"]');
    await style.click();
    const paragraph = editor.getByRole('menuitemradio', { name: 'Paragraph', exact: true });
    assert.equal(await paragraph.getAttribute('aria-checked'), 'true');
    assert.equal(await page.locator('.quick-input-widget').isVisible(), false);
    await paragraph.press('Escape');
    assert.equal(await style.evaluate((button) => document.activeElement === button), true);
    await editor.locator('.ProseMirror').focus();
    await eventually(
      async () => (await editor.evaluate(() => getSelection().toString())) === 'Beta',
      'Cancel did not restore the original text selection',
    );
    assert.equal(fs.readFileSync(file, 'utf8'), 'Alpha\n\nBeta\n');
    await style.click();
    await editor.getByRole('menuitemradio', { name: 'Heading 2', exact: true }).click();
    editor = await save(editor, file, 'Alpha\n\n## Beta\n');
    await eventually(
      async () => (await editor.evaluate(() => getSelection().toString())) === 'Beta',
      'Local heading choice did not preserve the text selection',
    );
    assert.equal(await style.innerText(), 'Heading 2');
    assert.equal(await style.getAttribute('aria-pressed'), null);
    await style.click();
    await editor.getByRole('menuitemradio', { name: 'Heading 2', exact: true }).click();
    await clickTool(editor, 'undo');
    editor = await save(editor, file, 'Alpha\n\nBeta\n');
    await clickTool(editor, 'redo');
    await save(editor, file, 'Alpha\n\n## Beta\n');
  });

  it('explains invalid table source, retains the draft and applies one correction', async () => {
    let { editor, file } = await open('invalid-table.md', '| Name |\n| --- |\n| Alpha |\n');
    await editor.locator('[data-testid="muninn-table-toggle-source"]').click();
    const draft = editor.locator('textarea');
    await draft.fill('ordinary prose');
    await editor.getByRole('button', { name: 'Apply Source', exact: true }).click();
    assert.equal(await draft.getAttribute('aria-invalid'), 'true');
    assert.equal(await draft.inputValue(), 'ordinary prose');
    assert.match(
      await editor.locator('[data-testid="muninn-table-source-feedback"]').innerText(),
      /header row.*separator row/,
    );
    assert.equal(await draft.evaluate((element) => element === document.activeElement), true);
    assert.equal(fs.readFileSync(file, 'utf8'), '| Name |\n| --- |\n| Alpha |\n');
    await draft.fill('| Name |\n| --- |\n| Beta |');
    await editor.getByRole('button', { name: 'Apply Source', exact: true }).click();
    await eventually(
      async () => await editor.evaluate(() => document.activeElement.matches('th input')),
      'Apply did not restore grid focus',
    );
    editor = await save(editor, file, '| Name |\n| --- |\n| Beta |\n');
    assert.equal(await draft.getAttribute('aria-invalid'), null);
  });

  it('keeps Codicons, help, table feedback and focus legible in default themes', async () => {
    const source =
      '| Name |\n| --- |\n| Alpha |\n\n```javascript\nconst count = 42; // a comment\nconst label = "hello";\n```\n';
    const { editor, file } = await open('theme-table.md', source);
    await editor.locator('[data-testid="muninn-table-toggle-source"]').click();
    await editor.locator('textarea').fill('invalid draft');
    await editor.getByRole('button', { name: 'Apply Source', exact: true }).click();
    const settingsPath = path.join(user, 'User/settings.json');
    const originalSettings = fs.readFileSync(settingsPath, 'utf8');
    evidence.contrast = [];
    try {
      for (const theme of defaultThemes) {
        fs.writeFileSync(
          settingsPath,
          JSON.stringify({ ...JSON.parse(originalSettings), 'workbench.colorTheme': theme.id }),
        );
        await eventually(
          async () =>
            await editor.evaluate((id) => document.body.dataset.vscodeThemeId === id, theme.id),
          'Theme did not load: ' + theme.id,
        );
        const bold = editor.locator('[data-command="toggleBold"]');
        await editor.locator('textarea').focus();
        await bold.focus();
        await bold.press('ArrowRight');
        await page.keyboard.press('ArrowLeft');
        await editor.locator('[role="tooltip"]').waitFor();
        const measure = (selectors) =>
          editor.evaluate(async (selectors) => {
            await document.fonts.load('16px codicon');
            const canvas = document.createElement('canvas').getContext('2d');
            const rgba = (value) => {
              canvas.clearRect(0, 0, 1, 1);
              canvas.fillStyle = value;
              canvas.fillRect(0, 0, 1, 1);
              return [...canvas.getImageData(0, 0, 1, 1).data].map((value, index) =>
                index === 3 ? value / 255 : value,
              );
            };
            const blend = (front, back) =>
              front
                .slice(0, 3)
                .map((value, index) => value * front[3] + back[index] * (1 - front[3]));
            const background = (element) => {
              const parents = [];
              for (let node = element; node; node = node.parentElement) parents.unshift(node);
              return parents.reduce(
                (back, node) => blend(rgba(getComputedStyle(node).backgroundColor), back),
                [255, 255, 255],
              );
            };
            const luminance = (rgb) =>
              rgb
                .map((value) => value / 255)
                .map((value) =>
                  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
                )
                .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
            const ratio = (first, second) => {
              const a = luminance(first),
                b = luminance(second);
              return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
            };
            return {
              fontLoaded: document.fonts.check('16px codicon'),
              glyph: getComputedStyle(document.querySelector('.codicon-bold'), '::before').content,
              values: selectors.map((selector) => {
                const element = document.querySelector(selector);
                const style = getComputedStyle(element);
                const back = background(element);
                return {
                  selector,
                  text: ratio(blend(rgba(style.color), back), back),
                  focusStyle: style.outlineStyle,
                  focusWidth: parseFloat(style.outlineWidth),
                  focus: ratio(
                    blend(rgba(style.outlineColor), background(element.parentElement)),
                    background(element.parentElement),
                  ),
                };
              }),
            };
          }, selectors);
        const measurements = await measure([
          '.muninn-code-node .hljs-keyword',
          '.muninn-code-node .hljs-string',
          '.muninn-code-node .hljs-number',
          '.muninn-code-node .hljs-comment',
          '[role="tooltip"]',
          '.muninn-table-node-source-hint',
          '.muninn-table-node-source-feedback',
          '[data-testid="muninn-table-delete"]',
          '.muninn-toolbar [data-command="toggleBold"]',
        ]);
        assert.equal(measurements.fontLoaded, true);
        assert.notEqual(measurements.glyph, 'none');
        assert.equal(
          await editor.evaluate(() => {
            const keyword = document.querySelector('.muninn-code-node .hljs-keyword');
            return (
              getComputedStyle(keyword).color !== getComputedStyle(keyword.closest('code')).color
            );
          }),
          true,
          theme.id + ' keyword must be visually distinct',
        );
        for (const value of measurements.values)
          assert.ok(
            value.text >=
              (value.selector.includes('button') ||
              value.selector.includes('delete') ||
              value.selector.includes('toggleBold')
                ? 3
                : 4.5),
            theme.id + ' ' + JSON.stringify(value),
          );
        assert.notEqual(measurements.values.at(-1).focusStyle, 'none');
        assert.ok(measurements.values.at(-1).focusWidth >= 1);
        assert.ok(measurements.values.at(-1).focus >= 3, theme.id + ' focus');
        await clickTool(editor, 'chooseTableAction');
        const insert = editor.getByRole('menuitem', { name: 'Insert new table', exact: true });
        await insert.press('Home');
        const popup = await measure([
          '#muninn-toolbar-menu',
          '#muninn-toolbar-menu [data-command="insertTable"]',
        ]);
        for (const value of popup.values)
          assert.ok(value.text >= 4.5, theme.id + ' menu ' + JSON.stringify(value));
        assert.ok(popup.values.at(-1).focus >= 3, theme.id + ' menu focus');
        assert.ok(popup.values.at(-1).focusWidth >= 1);
        measurements.menu = popup.values;
        await page.screenshot({
          path: path.join(artifactDirectory, 'theme-' + theme.uiTheme + '.png'),
        });
        await insert.press('Escape');
        evidence.contrast.push({ theme: theme.id, ...measurements });
        writeEvidence();
        await editor.locator('[data-command="toggleBold"]').press('Escape');
        assert.equal(await editor.locator('[role="tooltip"]').isVisible(), false);
        assert.equal(await editor.locator('textarea').inputValue(), 'invalid draft');
      }
    } finally {
      fs.writeFileSync(settingsPath, originalSettings);
    }
    assert.equal(fs.readFileSync(file, 'utf8'), source);
  });

  it('keeps basic actions quiet and keyboard accessible, formats without replacing selected text', async () => {
    let { editor, file } = await open('toolbar.md', 'Alpha\n');
    let bold = editor.locator('[data-command="toggleBold"]');
    await bold.focus();
    await bold.press('ArrowRight');
    assert.equal(
      await editor.evaluate(() => document.activeElement.dataset.command),
      'toggleItalic',
    );
    await editor.locator('.ProseMirror p').click();
    await page.keyboard.press(lineStart);
    await page.keyboard.press(selectLineEnd);
    await bold.click();
    editor = await save(editor, file, '**Alpha**\n');
    bold = editor.locator('[data-command="toggleBold"]');
    assert.equal(await bold.getAttribute('aria-pressed'), 'true');
    await clickTool(editor, 'insertCodeBlock');
    await eventually(() => editor.locator('.muninn-code-node').count(), 'Code block missing');
    assert.ok((await editor.locator('.ProseMirror').innerText()).includes('Alpha'));
    await editor.locator('[data-testid="muninn-code-language"]').selectOption('javascript');
    await editor.locator('.ProseMirror').press(`${modifier}+s`);
    await eventually(
      () => fs.readFileSync(file, 'utf8').includes('```javascript'),
      'Code language was not saved',
    );
  });

  it('edits highlighted code with native selection, paste, save, undo and redo', async () => {
    const source = 'Before\n\n~~~javascript\nconst value = 1;\n~~~\n\nAfter\n';
    let { editor, file } = await open('highlighting.md', source);
    await editor.locator('pre code').click();
    await editor.locator('.ProseMirror').press(lineEnd);
    await editor.locator('.ProseMirror').pressSequentially(' // edited');
    const edited = 'Before\n\n~~~javascript\nconst value = 1; // edited\n~~~\n\nAfter\n';
    editor = await save(editor, file, edited);
    assert.equal(await editor.locator('.hljs-comment').innerText(), '// edited');
    await command('Muninn for VS Code: Undo');
    editor = await save(editor, file, source);
    await command('Muninn for VS Code: Redo');
    editor = await save(editor, file, edited);
    await editor.locator('pre code').click();
    await editor.locator('.ProseMirror').press(lineStart);
    await editor.locator('.ProseMirror').press(selectLineEnd);
    assert.equal(
      await editor.evaluate(() => getSelection().toString()),
      'const value = 1; // edited',
    );
    await editor.evaluate(() => {
      const transfer = new DataTransfer();
      transfer.setData('text/plain', 'const label = "<safe>";');
      document
        .querySelector('.ProseMirror')
        .dispatchEvent(
          new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }),
        );
    });
    editor = await save(
      editor,
      file,
      'Before\n\n~~~javascript\nconst label = "<safe>";\n~~~\n\nAfter\n',
    );
    assert.equal(await editor.locator('.hljs-string').innerText(), '"<safe>"');
    await editor.locator('.muninn-code-node-language').selectOption('');
    editor = await save(editor, file, 'Before\n\n~~~\nconst label = "<safe>";\n~~~\n\nAfter\n');
    assert.equal(await editor.locator('pre code span').count(), 0);
  });

  it('preserves the README demo through focused save, undo, redo, reopen and Git diff', async () => {
    const source = fs.readFileSync('docs/demos/source-preservation.md', 'utf8');
    const expected = source.replace('Draft', 'Done');
    const name = 'source-preservation.md';
    const git = (...args) => execFileSync('git', args, { cwd: workspace, encoding: 'utf8' });
    git('-c', 'init.defaultBranch=main', 'init');
    let { editor, file } = await open(name, source);
    git('add', '--', name);
    git(
      '-c',
      'user.name=Muninn demo',
      '-c',
      'user.email=demo@example.invalid',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-m',
      'Demo before cell edit',
    );
    editor = await save(editor, file, source);
    assert.equal(git('diff', '--', name), '');
    const editorPane = page.locator('[id="workbench.parts.editor"]');
    await editorPane.screenshot({
      path: path.join(artifactDirectory, 'source-preservation-before.png'),
    });
    const cell = editor.locator('[data-table-row="1"][data-table-column="1"]');
    await cell.fill('Done');
    await cell.press(`${modifier}+s`);
    await eventually(
      () => fs.readFileSync(file, 'utf8') === expected,
      'Focused demo cell was not saved exactly',
    );
    await editorPane.screenshot({
      path: path.join(artifactDirectory, 'source-preservation-after.png'),
    });
    await clickTool(editor, 'undo');
    editor = await save(editor, file, source);
    await clickTool(editor, 'redo');
    editor = await save(editor, file, expected);
    await command('View: Close Saved Editors in Group');
    ({ editor } = await open(name));
    assert.equal(
      await editor.locator('[data-table-row="1"][data-table-column="1"]').inputValue(),
      'Done',
    );
    await command('Muninn for VS Code: Open Source Editor');
    await page.locator('.monaco-editor .view-lines').first().waitFor();
    assert.equal(fs.readFileSync(file, 'utf8'), expected);
    const diff = git('diff', '--no-ext-diff', '--unified=20', '--', name);
    assert.deepEqual(
      diff.split('\n').filter((line) => /^[+-](?![+-])/.test(line)),
      ['-| Docs    | Draft | Ada |', '+| Docs    | Done | Ada |'],
    );
    fs.writeFileSync(path.join(artifactDirectory, 'source-preservation.diff'), diff);
    // Open Git's exact output; older VS Code uses rendered panes for custom-editor comparisons.
    const diffFile = path.join(workspace, 'source-preservation.diff');
    fs.writeFileSync(diffFile, diff);
    await page.keyboard.press(`${modifier}+P`);
    await page.locator('.quick-input-widget input[type="text"]').fill(diffFile);
    await page
      .locator('.quick-input-list .monaco-list-row')
      .filter({ hasText: 'source-preservation.diff' })
      .first()
      .click();
    const diffEditor = page.locator('.monaco-editor[data-uri$="/source-preservation.diff"]');
    await diffEditor.waitFor();
    await eventually(
      async () =>
        /Draft/.test(await diffEditor.innerText()) && /Done/.test(await diffEditor.innerText()),
      'Git diff was not rendered',
    );
    await editorPane.screenshot({
      path: path.join(artifactDirectory, 'source-preservation-diff.png'),
    });
  });

  it('saves focused table input immediately and supports grid actions, source apply, delete and undo', async () => {
    const source = '| Name | Score |\n| :--- | ---: |\n| Alice | 7 |\n';
    let { editor, file } = await open('table.md', source);
    const cell = editor.locator('[data-table-row="1"][data-table-column="0"]');
    await cell.fill('Bob');
    await cell.press(`${modifier}+s`);
    await eventually(
      () => fs.readFileSync(file, 'utf8').includes('| Bob | 7 |'),
      'Focused cell was not saved',
    );
    assert.equal(await cell.evaluate((el) => el === document.activeElement), true);
    assert.equal(await editor.locator('th').first().getAttribute('scope'), 'col');
    await editor.getByRole('button', { name: 'Add to table', exact: true }).click();
    await page.locator('.quick-input-widget input[type="text"]').fill('Add Row');
    await page.keyboard.press('Enter');
    await eventually(
      () =>
        editor
          .locator('tbody tr')
          .count()
          .then((count) => count === 2),
      'Add Row did not reach the original table',
    );
    await clickTool(editor, 'chooseTableAction');
    await editor.getByRole('menuitem', { name: 'Add table column', exact: true }).click();
    await eventually(
      () =>
        editor
          .locator('th')
          .count()
          .then((count) => count === 3),
      'Add Column did not reach the original table',
    );
    await editor.locator('[data-testid="muninn-table-toggle-source"]').click();
    const textarea = editor.locator('[data-testid="muninn-table-source-text"]');
    await textarea.fill('| Item |\n| --- |\n| Done |');
    await textarea.press(`${modifier}+Enter`);
    editor = await save(editor, file, '| Item |\n| --- |\n| Done |\n');
    await editor.locator('[data-testid="muninn-table-delete"]').click();
    assert.equal(await editor.locator('[data-testid="muninn-table-node"]').count(), 0);
    assert.equal(await editor.locator('[role="tooltip"]').isVisible(), false);
    await page.keyboard.press(`${modifier}+z`);
    await eventually(
      () => editor.locator('[data-testid="muninn-table-node"]').count(),
      'Deleted table could not be undone',
    );
  });

  it('saves accepted table edits, retains raw drafts, and recovers them on Source', async () => {
    const { editor, file } = await open('table-draft.md', '| Name |\n| --- |\n| Alpha |\n');
    await editor.locator('tbody input').fill('Beta');
    await editor.locator('[data-testid="muninn-table-toggle-source"]').click();
    const textarea = editor.locator('[data-testid="muninn-table-source-text"]');
    await textarea.fill('| Name |\n| --- |\n| Gamma |');
    await textarea.press(`${modifier}+s`);
    await eventually(
      () => fs.readFileSync(file, 'utf8') === '| Name |\n| --- |\n| Beta |\n',
      'Native Save applied or lost the raw table draft',
    );
    assert.equal(await textarea.inputValue(), '| Name |\n| --- |\n| Gamma |');
    const untitledTabs = page.getByRole('tab', { name: /Untitled/ });
    const existing = await untitledTabs.evaluateAll((tabs) =>
      tabs.map((tab) => tab.getAttribute('data-resource-name')),
    );
    await command('Muninn for VS Code: Open Source Editor');
    let recoveryName;
    await eventually(async () => {
      const names = await untitledTabs.evaluateAll((tabs) =>
        tabs.map((tab) => tab.getAttribute('data-resource-name')),
      );
      recoveryName = names.find((name) => name && !existing.includes(name));
      return Boolean(recoveryName);
    }, 'No new table draft recovery tab appeared');
    await page.locator(`[role="tab"][data-resource-name="${recoveryName}"]`).click();
    await eventually(
      async () =>
        (await page.locator('.monaco-editor .view-lines').allTextContents())
          .join('\n')
          .includes('Gamma'),
      'Source did not preserve the unapplied table draft in a recovery document',
    );
    assert.equal(fs.readFileSync(file, 'utf8'), '| Name |\n| --- |\n| Beta |\n');
  });

  it('adds a row to the focused one-column table through the native command', async () => {
    const { editor, file } = await open(
      'native-table.md',
      '| First |\n| --- |\n| A |\n\n| Second |\n| --- |\n| B |\n',
    );
    await editor.locator('tbody input').nth(1).focus();
    await command('Muninn for VS Code: Add Table Row');
    await save(editor, file, '| First |\n| --- |\n| A |\n\n| Second |\n| --- |\n| B |\n|  |\n');
  });

  it('renders lazy Mermaid chunks under the production CSP with accessible SVG', async () => {
    const source =
      '# Diagram\n\n```mermaid\nflowchart TD\n  accTitle: Review flow\n  accDescr: Read before editing\n  A[Read] --> B[Edit]\n```\n';
    const { editor, file } = await open('diagram.md', source);
    await editor.locator('.muninn-code-node-mermaid-preview svg').waitFor({ timeout: 30000 });
    assert.ok(await editor.locator('svg title').getByText('Review flow', { exact: true }).count());
    assert.equal(await editor.locator('svg script, svg foreignObject').count(), 0);
    await save(editor, file, source);
  });

  it('toggles standard GFM tasks and navigates Unicode headings and file anchors', async () => {
    fs.writeFileSync(path.join(workspace, 'target.md'), '# Target\n\n## Destination\n');
    let { editor, file } = await open(
      'tasks.md',
      '---\ntitle: Metadata\n---\n\n# Résumé\n\n- [ ] Read spec\n\n[Target](target.md#destination)\n',
    );
    await editor.locator('input[type="checkbox"]').check();
    editor = await save(
      editor,
      file,
      '---\ntitle: Metadata\n---\n\n# Résumé\n\n- [x] Read spec\n\n[Target](target.md#destination)\n',
    );
    assert.equal(await editor.locator('h1').getAttribute('id'), 'résumé');
    await clickTool(editor, 'goToHeading');
    await page.getByText('Résumé', { exact: true }).first().click();
    await eventually(
      async () =>
        await editor.locator('h1').evaluate((heading) => heading === document.activeElement),
      'Heading picker did not restore focus to its destination',
    );
    await editor.locator('a').click();
    await eventually(async () => {
      for (const frame of page.frames()) {
        if (await frame.locator('h2#destination').count()) return true;
      }
      return false;
    }, 'Relative Markdown link did not open target');
  });

  it('tabs to rendered links, opens local destinations and activates an external link once', async () => {
    fs.writeFileSync(path.join(workspace, 'keyboard-target.md'), '# Target\n');
    const source =
      '# Étape\n\n# Étape\n\n[Heading](#%C3%A9tape-1) [File](keyboard-target.md) [External](https://example.invalid/muninn-test)\n';
    const { editor, file } = await open('keyboard-links.md', source);
    // Observe external keyboard activation without requiring a system browser on CI.
    await editor
      .locator('a')
      .last()
      .evaluate((link) => {
        globalThis.muninnExternalActivations = [];
        link.addEventListener('click', (event) => {
          globalThis.muninnExternalActivations.push(link.getAttribute('href'));
          event.preventDefault();
          event.stopPropagation();
        });
      });
    await editor.locator('.ProseMirror').focus();
    await page.keyboard.press('Tab');
    const links = editor.locator('a');
    assert.equal(
      await links.first().evaluate((element) => element === document.activeElement),
      true,
    );
    assert.notEqual(
      await links.first().evaluate((element) => getComputedStyle(element).outlineStyle),
      'none',
    );
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    assert.equal(
      await links.last().evaluate((element) => element === document.activeElement),
      true,
    );
    await page.keyboard.press('Enter');
    assert.deepEqual(await editor.evaluate(() => globalThis.muninnExternalActivations), [
      'https://example.invalid/muninn-test',
    ]);
    await editor.locator('.ProseMirror h1').first().click();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    assert.equal(
      await editor
        .locator('h1')
        .last()
        .evaluate((element) => element === document.activeElement),
      true,
    );
    await links.nth(1).focus();
    await links.nth(1).press('Enter');
    await eventually(
      async () => Boolean(await visibleEditorFrame('keyboard-target.md')),
      'Keyboard file link did not open',
    );
    assert.equal(fs.readFileSync(file, 'utf8'), source);
  });

  it('creates a standard GFM task and keeps typing outside the hidden marker', async () => {
    const { editor, file } = await open('new-task.md', 'Alpha\n');
    await editor.locator('.ProseMirror p').click();
    await editor.locator('.ProseMirror').press(lineStart);
    await editor.locator('.ProseMirror').press('ArrowRight');
    await editor.locator('.ProseMirror').press('ArrowRight');
    await clickTool(editor, 'toggleTask');
    await editor.locator('.ProseMirror').pressSequentially('X');
    await save(editor, file, '* [ ] AlXpha\n');
  });

  it('inserts an image through the toolbar and saves exact surrounding Markdown', async () => {
    const { editor, file } = await open('image.md', 'Alpha\n\n+ _untouched_\n');
    await editor.locator('.ProseMirror p').first().click();
    await page.keyboard.press(lineEnd);
    await clickTool(editor, 'insertImage');
    await page.locator('.quick-input-widget input[type="text"]').waitFor();
    await page.keyboard.press('Escape');
    assert.equal(fs.readFileSync(file, 'utf8'), 'Alpha\n\n+ _untouched_\n');
    const selectedImage = path.join(root, 'assets', 'icon.png');
    await clickTool(editor, 'insertImage');
    await page.locator('.quick-input-widget input[type="text"]').fill(selectedImage);
    await page.keyboard.press('Enter');

    let currentEditor;
    await eventually(async () => {
      for (const frame of page.frames()) {
        try {
          const prose = frame.locator('.ProseMirror[aria-label*="image.md"]');
          if (
            (await prose.isVisible()) &&
            (await prose.locator('img:not(.ProseMirror-separator)').count()) === 1
          ) {
            currentEditor = frame;
            return true;
          }
        } catch {
          /* The webview may be replaced while VS Code updates the document. */
        }
      }
      return false;
    }, 'Inserted image did not appear in the editor');
    await save(currentEditor, file, 'Alpha![](images/icon.png)\n\n+ _untouched_\n');
    assert.deepEqual(
      fs.readFileSync(path.join(workspace, 'images', 'icon.png')),
      fs.readFileSync(selectedImage),
    );
  });

  it('opens Source after saving edits and creates a native note', async () => {
    const { editor, file } = await open('source.md', 'Before\n');
    await editor.locator('.ProseMirror p').click();
    await editor.locator('.ProseMirror').press(lineEnd);
    await editor.locator('.ProseMirror').pressSequentially(' after');
    await clickTool(editor, 'openRawMarkdown');
    await page.locator('.monaco-editor textarea').first().waitFor();
    await page.keyboard.press(`${modifier}+s`);
    await eventually(
      () => fs.readFileSync(file, 'utf8') === 'Before after\n',
      'Source switch lost edits',
    );
    const notePath = path.join(workspace, 'new-note.md');
    await command('Muninn for VS Code: New Markdown Note');
    await page.getByText('Create Markdown Note', { exact: true }).waitFor();
    await page.locator('.quick-input-widget input[type="text"]').fill(notePath);
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await eventually(() => fs.existsSync(notePath), 'New Note did not create a Markdown file');
    await eventually(
      async () => Boolean(await visibleEditorFrame('new-note.md')),
      'New Note did not open its Markdown editor',
    );
  });

  it('exports unsaved HTML through the native picker and renders printable offline output', async () => {
    // Git may check fixtures out as CRLF; do not build a mixed-newline test document.
    const source =
      fs.readFileSync('tests/fixtures/export/representative.md', 'utf8').replaceAll('\r\n', '\n') +
      '\n## Page flow\n\n' +
      Array.from(
        { length: 12 },
        (_, index) =>
          `Paragraph ${index + 1}. ` +
          'This paragraph checks readable page flow, preserved text and useful margins when a shared document spans several printed pages. '.repeat(
            4,
          ),
      ).join('\n\n') +
      '\n\n```text\n' +
      'long_code_'.repeat(60) +
      '\n```\n\nFinal export paragraph.\n';
    fs.copyFileSync('tests/fixtures/export/image.svg', path.join(workspace, 'image.svg'));
    const { editor, file } = await open('export.md', source);
    await editor.locator('.ProseMirror p').last().click();
    await editor.locator('.ProseMirror').press(lineEnd);
    await editor.locator('.ProseMirror').pressSequentially(' Unsaved change.');
    const exported = path.join(workspace, 'shared-notes.html');
    await clickTool(editor, 'exportHtml');
    await page.locator('.quick-input-widget input[type="text"]').waitFor();
    await page.keyboard.press('Escape');
    assert.equal(fs.existsSync(exported), false);
    assert.equal(fs.readFileSync(file, 'utf8'), source);
    await command('Muninn for VS Code: Export HTML');
    await page.getByText('Export HTML', { exact: true }).waitFor();
    await page.locator('.quick-input-widget input[type="text"]').fill(exported);
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await eventually(() => fs.existsSync(exported), 'Export did not write an HTML file');
    const html = fs.readFileSync(exported, 'utf8');
    assert.match(html, /Final export paragraph\. Unsaved change\./);
    assert.doesNotMatch(html, /<script[\s>]/i);
    assert.equal(fs.readFileSync(file, 'utf8'), source);
    fs.copyFileSync(exported, path.join(artifactDirectory, 'export.html'));

    const windowOpened = app.waitForEvent('window');
    const outputWindowId = await app.evaluate(async ({ BrowserWindow }, exported) => {
      const window = new BrowserWindow({
        show: false,
        width: 900,
        height: 1000,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          partition: 'muninn-export-verification',
        },
      });
      window.webContents.session.webRequest.onBeforeRequest(
        { urls: ['http://*/*', 'https://*/*'] },
        (_request, reply) => reply({ cancel: true }),
      );
      try {
        await window.loadFile(exported);
      } catch (error) {
        window.destroy();
        throw error;
      }
      return window.id;
    }, exported);
    const output = await windowOpened;
    try {
      await output.locator('h1').waitFor();
      assert.equal(await output.locator('h1').innerText(), 'Shared notes');
      assert.equal(await output.locator('table td').count(), 4);
      assert.equal(await output.locator('script').count(), 0);
      assert.equal(
        await output
          .locator('img')
          .evaluate((image) => image.complete && image.naturalWidth === 240),
        true,
      );
      assert.match(
        await output.locator('body').innerText(),
        /Mermaid diagrams are included as source code/,
      );
      await output.screenshot({ path: path.join(artifactDirectory, 'export.png'), fullPage: true });
      await output.emulateMedia({ media: 'print' });
      assert.equal(
        await output
          .locator('pre')
          .first()
          .evaluate((pre) => getComputedStyle(pre).whiteSpace),
        'pre-wrap',
      );
      assert.equal(
        await output
          .locator('h2')
          .first()
          .evaluate((heading) => getComputedStyle(heading).breakAfter),
        'avoid',
      );
      if (version === '1.85.2') {
        // This VS Code build disables Electron printing; browser PDF is verified on stable.
        evidence.export = { offline: true, printStyles: true, pdfRendererAvailable: false };
      } else {
        const pdf = await app.evaluate(async ({ BrowserWindow }, id) => {
          const window = BrowserWindow.fromId(id);
          const bytes = await window.webContents.printToPDF({
            pageSize: 'A4',
            printBackground: true,
            preferCSSPageSize: true,
          });
          return bytes.toString('base64');
        }, outputWindowId);
        const bytes = Buffer.from(pdf, 'base64');
        assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
        assert.ok(bytes.length > 10000);
        fs.writeFileSync(path.join(artifactDirectory, 'export.pdf'), bytes);
        evidence.export = {
          offline: true,
          pdfBytes: bytes.length,
          renderer: 'Chromium print pipeline',
        };
      }
      writeEvidence();
    } finally {
      await app.evaluate(
        ({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.destroy(),
        outputWindowId,
      );
    }
    await command('Muninn for VS Code: Undo');
    await save(editor, file, source);
  });
});

it(
  'blocks Mermaid in Restricted Mode even when workspace settings request permission',
  { timeout: 60000 },
  async () => {
    const restrictedUser = path.join(temp, 'restricted-user');
    const restrictedExtensions = path.join(temp, 'restricted-extensions');
    fs.mkdirSync(path.join(restrictedUser, 'User'), { recursive: true });
    fs.mkdirSync(path.join(workspace, '.vscode'), { recursive: true });
    fs.writeFileSync(
      path.join(restrictedUser, 'User', 'settings.json'),
      JSON.stringify({
        'workbench.startupEditor': 'none',
        'security.workspace.trust.enabled': true,
        'security.workspace.trust.startupPrompt': 'never',
        'update.mode': 'none',
        'telemetry.telemetryLevel': 'off',
      }),
    );
    fs.writeFileSync(
      path.join(workspace, '.vscode', 'settings.json'),
      JSON.stringify({
        'muninn.integrations.mermaid.allowInUntrustedWorkspaces': true,
      }),
    );
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.NODE_OPTIONS;
    const installation = await runVSCodeCommand(
      [
        '--install-extension',
        vsix,
        '--extensions-dir',
        restrictedExtensions,
        '--user-data-dir',
        restrictedUser,
        ...sharedArgs(restrictedUser),
      ],
      { version },
    );
    fs.writeFileSync(
      path.join(artifactDirectory, 'restricted-installation.log'),
      installation.stdout + installation.stderr,
    );
    app = await electron.launch({
      executablePath: await vscodeExecutable(),
      env,
      timeout: 30000,
      args: [
        workspace,
        ...sharedArgs(restrictedUser),
        '--no-sandbox',
        '--disable-gpu',
        '--skip-welcome',
        '--skip-release-notes',
        '--user-data-dir=' + restrictedUser,
        '--extensions-dir=' + restrictedExtensions,
      ],
    });
    try {
      page = await app.firstWindow();
      page.setDefaultTimeout(15000);
      await page.locator('.monaco-workbench').waitFor();
      await activateMuninn();
      const { editor } = await open(
        'restricted.md',
        '```mermaid\ngraph TD\nA --> B\n```\n\n![Remote](https://example.invalid/image.png)\n',
      );
      await eventually(
        async () =>
          (await editor.locator('.muninn-code-node-mermaid-preview').innerText()).includes(
            'disabled',
          ),
        'Restricted workspace unexpectedly enabled Mermaid',
      );
      assert.equal(await editor.locator('svg').count(), 0);
      assert.equal(
        await editor.locator('.ProseMirror img[alt="Remote"]').getAttribute('src'),
        null,
      );
      await page.screenshot({ path: path.join(artifactDirectory, 'restricted.png') });
    } catch (error) {
      console.log('Restricted workbench:', (await page.locator('body').innerText()).slice(-3000));
      throw error;
    } finally {
      await app.close();
    }
  },
);
