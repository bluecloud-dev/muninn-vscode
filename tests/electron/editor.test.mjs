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
  // A log channel may leave the panel hidden, especially in Restricted Mode.
  if (await page.locator('[id="workbench.parts.panel"]').isVisible()) {
    await page.keyboard.press(`${modifier}+j`);
  }
}
async function eventually(check, message, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
}
async function command(label) {
  await page.bringToFront();
  await page.keyboard.press(`${modifier}+Shift+P`);
  await page.locator('.quick-input-widget input[type="text"]').fill('>' + label);
  await page.getByText(label, { exact: true }).first().click();
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
        return true;
      } catch (error) {
        if (error.name !== 'TimeoutError') throw error;
        return false;
      }
    },
    'Quick Open did not list ' + name,
    30000,
  );
  let editor;
  await eventually(async () => {
    editor = await visibleEditorFrame(name);
    return Boolean(editor);
  }, 'Default Markdown editor did not open ' + name);
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
  } catch (error) {
    error.message += '\\nActual file: ' + JSON.stringify(fs.readFileSync(file, 'utf8'));
    throw error;
  }
  return (await visibleEditorFrame(path.basename(file))) ?? currentEditor;
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
    evidence.vscode = await app.evaluate(({ app }) => app.getVersion());
    writeEvidence();
    page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    await page.locator('.monaco-workbench').waitFor();
    await activateMuninn();
    await app.context().setOffline(true);
    evidence.offline = true;
    await app.context().tracing.start({ screenshots: true, snapshots: true });
  });
  beforeEach(async () => {
    for (const key of ['Meta', 'Control', 'Alt', 'Shift']) await page.keyboard.up(key);
    await page.bringToFront();
    await page.keyboard.press('Escape');
  });
  after(async () => {
    if (app) {
      await page
        .screenshot({ path: path.join(artifactDirectory, 'workbench.png') })
        .catch(() => {});
      await app
        .context()
        .tracing.stop({ path: path.join(artifactDirectory, 'trace.zip') })
        .catch(() => {});
      await app.close();
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
    await page.keyboard.press(lineEnd);
    await page.keyboard.type('XY');
    editor = await save(editor, file, '# Reading\n\nAlphaXY\n');
    await page.keyboard.press(`${modifier}+z`);
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
      await page.keyboard.press(lineEnd);
      await page.keyboard.press('Enter');
      await page.keyboard.type('Next');
      editor = await save(editor, file, continued);
      await command('Muninn for VS Code: Undo');
      editor = await save(editor, file, source);
      await command('Muninn for VS Code: Redo');
      editor = await save(editor, file, continued);
      await page.keyboard.type('!');
      editor = await save(editor, file, continued.replace('Next', 'Next!'));
      await page
        .locator('.tab')
        .filter({ hasText: name })
        .getByRole('button', { name: /^Close \(/ })
        .click();
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

  it('keeps ordinary table values readable in a 320 CSS-pixel pane', async () => {
    const { editor, file } = await open(
      'narrow-table.md',
      '| Area | Scenario | Result |\n| --- | --- | --- |\n| Editor | Keyboard navigation | Narrow split panes |\n',
    );
    const nativeWindow = await app.browserWindow(page);
    const bounds = await nativeWindow.evaluate((window) => window.getBounds());
    try {
      const resize = async (target) => {
        await eventually(
          async () => {
            const width = await editor.evaluate(() => innerWidth);
            if (Math.abs(width - target) <= 1) return true;
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
      };
      const measure = () =>
        editor.evaluate(() => {
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
          const buttons = [...toolbar.querySelectorAll('button')].filter(
            (button) => !button.hidden,
          );
          return {
            width: innerWidth,
            cells,
            overflow: grid.scrollWidth > grid.clientWidth,
            bodyOverflow: document.body.scrollWidth > innerWidth,
            toolbarOverflow: toolbar.scrollWidth > toolbar.clientWidth,
            targets: buttons.map((button) => {
              const r = button.getBoundingClientRect();
              return { name: button.getAttribute('aria-label'), width: r.width, height: r.height };
            }),
          };
        });
      evidence.geometry = [];
      for (const target of [320, 375, 480, 768, 1024, 1440]) {
        await resize(target);
        const geometry = await measure();
        assert.equal(geometry.bodyOverflow, false);
        assert.equal(geometry.toolbarOverflow, false);
        if (target <= 375) assert.equal(geometry.overflow, true);
        for (const cell of geometry.cells)
          assert.ok(cell.available >= cell.text, JSON.stringify(cell));
        for (const button of geometry.targets)
          assert.ok(button.width >= 32 && button.height >= 32, JSON.stringify(button));
        evidence.geometry.push(geometry);
        if (target <= 375)
          await page.screenshot({ path: path.join(artifactDirectory, 'pane-' + target + '.png') });
      }
      await resize(320);
      await editor.evaluate(() =>
        document.documentElement.style.setProperty('--vscode-font-size', '24px'),
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
      assert.equal(evidence.zoom200.factor, 2);
      assert.equal(evidence.zoom200.bodyOverflow, false);
      assert.equal(evidence.zoom200.toolbarOverflow, false);
      await nativeWindow.evaluate((window) => window.webContents.setZoomFactor(1));
      await resize(320);
      await editor.locator('[data-testid="muninn-toolbar-more"]').click();
      await nativeWindow.evaluate((window) => window.setSize(window.getSize()[0], 300));
      await eventually(
        async () => (await editor.evaluate(() => innerHeight)) < 300,
        'Short native editor pane unavailable',
      );
      const controls = await editor.evaluate(() => {
        const toolbar = document.querySelector('.muninn-toolbar').getBoundingClientRect();
        return [
          '[data-command="openRawMarkdown"]',
          '[data-command="goToHeading"]',
          '[data-testid="muninn-toolbar-more"]',
        ].map((selector) => {
          const rect = document.querySelector(selector).getBoundingClientRect();
          return {
            selector,
            visible:
              rect.top >= toolbar.top && rect.bottom <= toolbar.bottom && rect.right <= innerWidth,
            width: rect.width,
            height: rect.height,
          };
        });
      });
      for (const control of controls) assert.equal(control.visible, true, JSON.stringify(control));
      evidence.shortPane = controls;
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
      await editor.locator('[data-command="toggleBold"]').focus();
      assert.equal(
        await editor.locator('[role="tooltip"]').evaluate((help) => {
          const rect = help.getBoundingClientRect();
          return rect.width > 0 && rect.left >= 0 && rect.right <= innerWidth;
        }),
        true,
      );
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
        await editor.locator('[data-testid="muninn-toolbar-more"]').click();
        fs.writeFileSync(
          settingsPath,
          JSON.stringify({ ...JSON.parse(settings), 'muninn.toolbar.mode': 'advanced' }),
        );
        await eventually(
          async () => await editor.locator('[data-command="insertCodeBlock"]').isVisible(),
          'Advanced preference did not load',
        );
        for (const target of [320, 375, 480, 768, 1024, 1440]) {
          await resize(target);
          assert.equal(
            await editor
              .locator('[data-testid="muninn-toolbar-more"]')
              .getAttribute('aria-expanded'),
            'true',
          );
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
      evidence.advancedPreference = true;
      writeEvidence();
      assert.equal(fs.readFileSync(file, 'utf8').includes('Keyboard navigation'), true);
    } finally {
      await nativeWindow.evaluate((window, original) => {
        window.webContents.setZoomFactor(1);
        window.setBounds(original);
      }, bounds);
    }
  });

  it('uses the native block-style picker without losing its original selection', async () => {
    let { editor, file } = await open('block-style.md', 'Alpha\n\nBeta\n');
    await editor.locator('.ProseMirror p').last().click();
    await page.keyboard.press(lineStart);
    await page.keyboard.press(selectLineEnd);
    const style = editor.getByRole('button', { name: 'Block style', exact: true });
    await style.click();
    await page.getByText('Paragraph', { exact: true }).first().waitFor();
    await page.getByText('Current', { exact: true }).first().waitFor();
    await page.keyboard.press('Escape');
    await eventually(
      async () =>
        await editor.evaluate(() => document.activeElement.classList.contains('ProseMirror')),
      'Cancel did not restore editor focus',
    );
    assert.equal(await editor.evaluate(() => getSelection().toString()), 'Beta');
    assert.equal(fs.readFileSync(file, 'utf8'), 'Alpha\n\nBeta\n');
    await style.click();
    await page.locator('.quick-input-widget input[type="text"]').fill('Heading 2');
    await page.keyboard.press('Enter');
    editor = await save(editor, file, 'Alpha\n\n## Beta\n');
    assert.equal(await editor.evaluate(() => getSelection().toString()), 'Beta');
    assert.equal(await style.getAttribute('aria-pressed'), null);
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
    const { editor, file } = await open('theme-table.md', '| Name |\n| --- |\n| Alpha |\n');
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
        const measurements = await editor.evaluate(async () => {
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
              .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
              .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
          const ratio = (first, second) => {
            const a = luminance(first),
              b = luminance(second);
            return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          };
          const selectors = [
            '[role="tooltip"]',
            '.muninn-table-node-source-hint',
            '.muninn-table-node-source-feedback',
            '[data-testid="muninn-table-delete"]',
            '[data-command="toggleBold"]',
          ];
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
        });
        assert.equal(measurements.fontLoaded, true);
        assert.notEqual(measurements.glyph, 'none');
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
        await page.screenshot({
          path: path.join(artifactDirectory, 'theme-' + theme.uiTheme + '.png'),
        });
        evidence.contrast.push({ theme: theme.id, ...measurements });
        writeEvidence();
        await editor.locator('[data-command="toggleBold"]').press('Escape');
        assert.equal(await editor.locator('[role="tooltip"]').isVisible(), false);
        assert.equal(await editor.locator('textarea').inputValue(), 'invalid draft');
      }
    } finally {
      fs.writeFileSync(settingsPath, originalSettings);
    }
    assert.equal(fs.readFileSync(file, 'utf8'), '| Name |\n| --- |\n| Alpha |\n');
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
    await editor.locator('[data-testid="muninn-toolbar-more"]').click();
    assert.equal(await editor.locator('[data-command="insertCodeBlock"]').isVisible(), true);
    await editor.locator('.ProseMirror p').click();
    await page.keyboard.press(lineStart);
    await page.keyboard.press(selectLineEnd);
    await bold.click();
    editor = await save(editor, file, '**Alpha**\n');
    bold = editor.locator('[data-command="toggleBold"]');
    assert.equal(await bold.getAttribute('aria-pressed'), 'true');
    await editor.locator('[data-command="insertCodeBlock"]').click();
    await eventually(() => editor.locator('.muninn-code-node').count(), 'Code block missing');
    assert.ok((await editor.locator('.ProseMirror').innerText()).includes('Alpha'));
    await editor.locator('[data-testid="muninn-code-language"]').selectOption('javascript');
    await editor.locator('.ProseMirror').press(`${modifier}+s`);
    await eventually(
      () => fs.readFileSync(file, 'utf8').includes('```javascript'),
      'Code language was not saved',
    );
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
    await editor.getByRole('button', { name: 'Add to table', exact: true }).click();
    await page.locator('.quick-input-widget input[type="text"]').fill('Add Column');
    await page.keyboard.press('Enter');
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
    await command('Muninn for VS Code: Open Source Editor');
    await page
      .getByRole('tab', { name: /Untitled/ })
      .first()
      .click();
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
    await editor.locator('[data-command="goToHeading"]').click();
    await page.getByText('Résumé', { exact: true }).first().click();
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
    await page.keyboard.press(lineStart);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await editor.locator('[data-testid="muninn-toolbar-more"]').click();
    await editor.locator('[data-command="toggleTask"]').click();
    await page.keyboard.type('X');
    await save(editor, file, '* [ ] AlXpha\n');
  });

  it('inserts an image through the native command and saves exact surrounding Markdown', async () => {
    const { editor, file } = await open('image.md', 'Alpha\n\n+ _untouched_\n');
    await editor.locator('.ProseMirror p').first().click();
    await page.keyboard.press(lineEnd);
    const selectedImage = path.join(root, 'assets', 'icon.png');
    await command('Muninn for VS Code: Insert Image');
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
    await page.keyboard.press(lineEnd);
    await page.keyboard.type(' after');
    await editor.locator('[data-command="openRawMarkdown"]').click();
    await page.locator('.monaco-editor textarea').first().waitFor();
    await page.keyboard.press(`${modifier}+s`);
    await eventually(
      () => fs.readFileSync(file, 'utf8') === 'Before after\n',
      'Source switch lost edits',
    );
    const notePath = path.join(workspace, 'new-note.md');
    await command('Muninn for VS Code: New Markdown Note');
    await page.locator('.quick-input-widget input[type="text"]').fill(notePath);
    await page.keyboard.press('Enter');
    await eventually(() => fs.existsSync(notePath), 'New Note did not create a Markdown file');
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
