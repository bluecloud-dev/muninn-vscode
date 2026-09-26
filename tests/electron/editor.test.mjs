// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { download, runVSCodeCommand } from '@vscode/test-electron';
import { _electron as electron } from 'playwright-core';

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
    'update.mode': 'none',
    'telemetry.telemetryLevel': 'off',
  }),
);
let app, page;
async function vscodeExecutable() {
  const downloaded = await download({ version });
  if (process.platform !== 'darwin') return downloaded;
  // test-electron assumes "Electron"; use the executable declared by the actual bundle.
  const contents = path.dirname(path.dirname(downloaded));
  const executable = execFileSync(
    '/usr/bin/plutil',
    ['-extract', 'CFBundleExecutable', 'raw', '-o', '-', path.join(contents, 'Info.plist')],
    { encoding: 'utf8' },
  ).trim();
  assert.ok(executable && path.basename(executable) === executable, 'Invalid bundle executable');
  return path.join(contents, 'MacOS', executable);
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
  await page.locator('[id="workbench.parts.panel"]').waitFor();
  await page.keyboard.press(`${modifier}+j`);
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
  await page.keyboard.press(`${modifier}+Shift+P`);
  await page.locator('.quick-input-widget input[type="text"]').fill('>' + label);
  await page.getByText(label, { exact: true }).first().waitFor();
  await page.keyboard.press('Enter');
}
async function open(name, source) {
  const file = path.join(workspace, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source);
  await page.keyboard.press(`${modifier}+P`);
  await page.locator('.quick-input-widget input[type="text"]').fill(file);
  await page.locator('.quick-input-list .monaco-list-row').first().waitFor();
  await page.keyboard.press('Enter');
  let editor;
  await eventually(async () => {
    for (const frame of page.frames()) {
      try {
        const prose = frame.locator('.ProseMirror');
        if ((await prose.isVisible()) && (await prose.getAttribute('aria-label'))?.includes(name)) {
          editor = frame;
          return true;
        }
      } catch {
        /* A replaced webview frame is expected while opening a file. */
      }
    }
    return false;
  }, 'Default Markdown editor did not open ' + name);
  return { editor, file };
}
async function save(editor, file, expected) {
  await editor.locator('.ProseMirror').press(`${modifier}+s`);
  try {
    await eventually(
      () => fs.readFileSync(file, 'utf8') === expected,
      'Saved source differs: ' + fs.readFileSync(file, 'utf8'),
    );
  } catch (error) {
    error.message += '\\nActual file: ' + JSON.stringify(fs.readFileSync(file, 'utf8'));
    throw error;
  }
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
    await page.locator('.monaco-workbench').waitFor();
    await activateMuninn();
    await app.context().tracing.start({ screenshots: true, snapshots: true });
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
    const { editor, file } = await open('reading.md', source);
    assert.equal(await editor.locator('.muninn-toolbar').getAttribute('role'), 'toolbar');
    assert.equal(await editor.locator('.muninn-preview').count(), 0);
    await save(editor, file, source);
    await editor.locator('.ProseMirror p').click();
    await page.keyboard.press(lineEnd);
    await page.keyboard.type('XY');
    await save(editor, file, '# Reading\n\nAlphaXY\n');
    await editor.locator('.ProseMirror').press(`${modifier}+z`);
    await eventually(
      async () => (await editor.locator('.ProseMirror p').innerText()) === 'Alpha',
      'Undo did not restore text; status=' + (await editor.locator('#status-alert').innerText()),
    );
    await save(editor, file, source);
  });

  it('keeps basic actions quiet and keyboard accessible, formats without replacing selected text', async () => {
    const { editor, file } = await open('toolbar.md', 'Alpha\n');
    const bold = editor.locator('[data-command="toggleBold"]');
    await bold.focus();
    await bold.press('ArrowRight');
    assert.equal(
      await editor.evaluate(() => document.activeElement.dataset.command),
      'toggleItalic',
    );
    await editor.locator('[data-testid="muninn-toolbar-more"]').click();
    assert.equal(await editor.locator('[data-command="setHeading1"]').isVisible(), true);
    await editor.locator('.ProseMirror p').click();
    await page.keyboard.press(lineStart);
    await page.keyboard.press(selectLineEnd);
    await bold.click();
    await save(editor, file, '**Alpha**\n');
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
    const { editor, file } = await open('table.md', source);
    const cell = editor.locator('[data-table-row="1"][data-table-column="0"]');
    await cell.fill('Bob');
    await cell.press(`${modifier}+s`);
    await eventually(
      () => fs.readFileSync(file, 'utf8').includes('| Bob | 7 |'),
      'Focused cell was not saved',
    );
    assert.equal(await cell.evaluate((el) => el === document.activeElement), true);
    assert.equal(await editor.locator('th').first().getAttribute('scope'), 'col');
    await editor.getByRole('button', { name: 'Add Row', exact: true }).click();
    await editor.getByRole('button', { name: 'Add Column', exact: true }).click();
    assert.equal(await editor.locator('th').count(), 3);
    await editor.locator('[data-testid="muninn-table-toggle-source"]').click();
    const textarea = editor.locator('[data-testid="muninn-table-source-text"]');
    await textarea.fill('| Item |\n| --- |\n| Done |');
    await textarea.press(`${modifier}+Enter`);
    await save(editor, file, '| Item |\n| --- |\n| Done |\n');
    await editor.locator('[data-testid="muninn-table-delete"]').click();
    assert.equal(await editor.locator('[data-testid="muninn-table-node"]').count(), 0);
    await editor.locator('.ProseMirror').press(`${modifier}+z`);
    await eventually(
      () => editor.locator('[data-testid="muninn-table-node"]').count(),
      'Deleted table could not be undone',
    );
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
    const { editor, file } = await open(
      'tasks.md',
      '---\ntitle: Metadata\n---\n\n# Résumé\n\n- [ ] Read spec\n\n[Target](target.md#destination)\n',
    );
    await editor.locator('input[type="checkbox"]').check();
    await save(
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
    await app.evaluate(({ dialog }, selected) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] });
    }, selectedImage);
    await command('Muninn for VS Code: Insert Image');

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
    await app.evaluate(({ dialog }, selected) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: selected });
    }, notePath);
    await command('Muninn for VS Code: New Markdown Note');
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
