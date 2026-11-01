// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import sinon from 'sinon';
import { JSDOM } from 'jsdom';
import * as vscode from 'vscode';
import { MuninnCustomEditorProvider } from '../../src/custom-editor/muninn-custom-editor-provider';
import { ConfigService } from '../../src/services/config-service';
import { type HostToViewMessage, isHostToViewMessage } from '../../src/custom-editor/protocol';

const noop = (): void => {};
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('custom editor host lifecycle', () => {
  let provider: MuninnCustomEditorProvider;
  afterEach(() => {
    provider?.dispose();
    sinon.restore();
  });

  const fixture = async (initial = 'Alpha\n', settings: Record<string, unknown> = {}) => {
    let text = initial;
    let receive: (message: unknown) => unknown = noop;
    let close: () => void = noop;
    let changed: (event: vscode.TextDocumentChangeEvent) => unknown = noop;
    let trusted: () => unknown = noop;
    let willSave: (event: vscode.TextDocumentWillSaveEvent) => unknown = noop;
    let flushResult: boolean | undefined = true;
    const messages: HostToViewMessage[] = [];
    let webviewOptions: vscode.WebviewOptions = {};
    const optionUpdates: vscode.WebviewOptions[] = [];
    const uri = vscode.Uri.parse('vscode-remote://ssh-remote+host/workspace/spec.md');
    const document = {
      uri,
      getText: () => text,
      save: sinon.stub().resolves(true),
      positionAt: (offset: number) => {
        const lines = text.slice(0, offset).split('\n');
        return new vscode.Position(lines.length - 1, lines.at(-1)!.length);
      },
    } as unknown as vscode.TextDocument;
    const offset = (position: vscode.Position) =>
      text
        .split('\n')
        .slice(0, position.line)
        .reduce((n, line) => n + line.length + 1, 0) + position.character;
    const applyEdit = sinon.stub(vscode.workspace, 'applyEdit').callsFake(async (edit) => {
      const replacements = (
        edit as unknown as { replacements: Array<{ range: vscode.Range; text: string }> }
      ).replacements;
      for (const replacement of replacements.toReversed()) {
        text =
          text.slice(0, offset(replacement.range.start)) +
          replacement.text +
          text.slice(offset(replacement.range.end));
      }
      changed({ document } as vscode.TextDocumentChangeEvent);
      return true;
    });
    sinon.stub(vscode.workspace, 'onDidChangeTextDocument').callsFake((listener) => {
      changed = listener;
      return { dispose() {} };
    });
    sinon.stub(vscode.workspace, 'onDidGrantWorkspaceTrust').callsFake((listener) => {
      trusted = () => listener();
      return { dispose() {} };
    });
    sinon.stub(vscode.workspace, 'onWillSaveTextDocument').callsFake((listener) => {
      willSave = listener;
      return { dispose() {} };
    });
    sinon.stub(vscode.workspace, 'getConfiguration').returns({
      get: <T>(key: string, fallback?: T) => (key in settings ? settings[key] : fallback),
      inspect: (): undefined => {},
      has: () => false,
      update: async () => {},
    } as vscode.WorkspaceConfiguration);
    const logger = {
      warn: sinon.stub(),
      error: sinon.stub(),
    } as unknown as vscode.LogOutputChannel;
    provider = new MuninnCustomEditorProvider(
      vscode.Uri.file('/extension'),
      new ConfigService(),
      logger,
    );
    const panel = {
      webview: {
        html: '',
        // VS Code reloads the webview whenever its options are reassigned.
        get options() {
          return webviewOptions;
        },
        set options(value: vscode.WebviewOptions) {
          webviewOptions = value;
          optionUpdates.push(value);
        },
        cspSource: 'https://local.resources',
        asWebviewUri: (value: vscode.Uri) => value,
        onDidReceiveMessage: (listener: (value: unknown) => unknown) => {
          receive = listener;
          return { dispose() {} };
        },
        postMessage: async (message: HostToViewMessage) => {
          messages.push(message);
          if (message.type === 'host.requestFlush' && flushResult !== undefined)
            queueMicrotask(() => {
              void receive({
                type: 'view.flushComplete',
                payload: { requestId: message.payload.requestId, ok: flushResult },
              });
            });
          return true;
        },
      },
      onDidDispose: (listener: () => void) => {
        close = listener;
        return { dispose() {} };
      },
    } as unknown as vscode.WebviewPanel;
    Object.assign(vscode.window.tabGroups.activeTabGroup, {
      activeTab: { input: new vscode.TabInputCustom(uri, 'muninn.markdownEditor') },
    });
    await provider.resolveCustomTextEditor(document, panel);
    const send = async (message: unknown) => {
      await receive(message);
    };
    await send({ type: 'view.ready' });
    return {
      send,
      panel,
      document,
      messages,
      optionUpdates,
      logger,
      applyEdit,
      close: () => close(),
      external: (value: string) => {
        text = value;
        changed({ document } as vscode.TextDocumentChangeEvent);
      },
      trust: () => trusted(),
      save: (event: vscode.TextDocumentWillSaveEvent) => willSave(event),
      replyToFlush: (result: boolean | undefined) => {
        flushResult = result;
      },
    };
  };

  it('exports the current unsaved document through the host command without saving Markdown', async () => {
    const f = await fixture('# Unsaved\n\nAlpha\n');
    await f.send({
      type: 'view.applyDocument',
      payload: { markdown: '# Unsaved\n\nAlphaX\n', revision: 0, operationId: 1 },
    });
    const destination = vscode.Uri.joinPath(f.document.uri, '..', 'spec.html');
    const picker = sinon.stub(vscode.window, 'showSaveDialog').resolves(destination);
    const write = sinon.stub(vscode.workspace.fs, 'writeFile').resolves();
    await f.send({ type: 'view.executeCommand', payload: { command: 'exportHtml' } });
    assert.equal(write.callCount, 1);
    assert.equal(picker.firstCall.args[0]?.defaultUri?.toString(), destination.toString());
    assert.equal(write.firstCall.args[0].toString(), destination.toString());
    const html = Buffer.from(write.firstCall.args[1]).toString('utf8');
    assert.match(html, /<title>Unsaved<\/title>/);
    assert.match(html, /<h1 id="unsaved">Unsaved<\/h1>/);
    assert.match(html, /<p>AlphaX<\/p>/);
    assert.match(html, /<meta name="generator" content="Muninn">/);
    assert.equal(f.document.getText(), '# Unsaved\n\nAlphaX\n');
    assert.equal((f.document.save as sinon.SinonStub).called, false);
    assert.equal(f.applyEdit.callCount, 1);
    assert.equal(f.messages.at(-1)?.type, 'host.requestFlush');
  });

  it('exports semantic content without executable HTML, remote images or Mermaid scripts', async () => {
    const source =
      '# <script>alert(1)</script>\n\n- [x] Done\n- Second\n\n| A | B |\n| - | - |\n| one | two |\n\n```js\nconst tag = "<script>";\n```\n\n```mermaid\ngraph TD\nA --> B\n```\n\n![Remote](https://example.invalid/pixel.png)\n\n[unsafe](javascript:alert(1))\n\n<script>alert(2)</script>\n';
    const f = await fixture(source);
    sinon
      .stub(vscode.window, 'showSaveDialog')
      .resolves(vscode.Uri.joinPath(f.document.uri, '..', 'spec.html'));
    const write = sinon.stub(vscode.workspace.fs, 'writeFile').resolves();
    const read = sinon.spy(vscode.workspace.fs, 'readFile');
    const warning = sinon.stub(vscode.window, 'showWarningMessage').resolves();
    await f.send({ type: 'view.executeCommand', payload: { command: 'exportHtml' } });
    const html = Buffer.from(write.firstCall.args[1]).toString('utf8');
    const output = new JSDOM(html).window.document;
    assert.equal(output.querySelectorAll('script, iframe, object, embed').length, 0);
    assert.equal(output.querySelectorAll('a[href^="javascript:"]').length, 0);
    assert.equal(output.querySelectorAll('img[src^="http"]').length, 0);
    assert.equal(read.called, false);
    assert.equal(output.querySelectorAll('li').length, 2);
    assert.equal(output.querySelector('td')?.textContent, 'one');
    assert.equal(
      output.querySelector('code.language-js')?.textContent,
      'const tag = "<script>";\n',
    );
    assert.equal(output.querySelector('code.language-mermaid')?.textContent, 'graph TD\nA --> B\n');
    assert.match(output.body.textContent!, /Mermaid diagrams are included as source code/);
    assert.match(output.body.textContent!, /Remote/);
    assert.equal(warning.calledOnce, true);
    assert.equal(f.applyEdit.called, false);
  });

  it('embeds local images up to 2 MiB and rebases large or missing image fallbacks', async () => {
    const f = await fixture(
      '![Small](images/space%20name.png)\n\n![Big](images/big.webp)\n\n![Missing](images/missing.jpg)\n\n![Unsupported](images/script.txt)\n',
    );
    const destination = vscode.Uri.joinPath(f.document.uri, '..', 'exports', 'spec.html');
    sinon.stub(vscode.window, 'showSaveDialog').resolves(destination);
    const bytes = Buffer.alloc(2 * 1024 * 1024, 7);
    sinon.stub(vscode.workspace.fs, 'stat').callsFake(async (uri) => {
      if (uri.path.endsWith('missing.jpg')) throw new Error('missing');
      return {
        type: 1,
        size: uri.path.endsWith('big.webp') ? bytes.length + 1 : bytes.length,
        ctime: 0,
        mtime: 0,
      };
    });
    const read = sinon.stub(vscode.workspace.fs, 'readFile').resolves(bytes);
    const write = sinon.stub(vscode.workspace.fs, 'writeFile').resolves();
    const warning = sinon.stub(vscode.window, 'showWarningMessage').resolves();
    await f.send({ type: 'view.executeCommand', payload: { command: 'exportHtml' } });
    const output = new JSDOM(Buffer.from(write.firstCall.args[1]).toString()).window.document;
    const embedded = output.querySelector('img[alt="Small"]')?.getAttribute('src');
    assert.ok(embedded);
    assert.ok(embedded.startsWith('data:image/png;base64,'));
    assert.ok(Buffer.from(embedded.split(',')[1], 'base64').equals(bytes));
    assert.equal(output.querySelector('img[alt="Big"]')?.getAttribute('src'), '../images/big.webp');
    assert.equal(
      output.querySelector('img[alt="Missing"]')?.getAttribute('src'),
      '../images/missing.jpg',
    );
    assert.equal(output.querySelectorAll('img[alt="Unsupported"]').length, 0);
    assert.equal(read.callCount, 1);
    assert.equal(read.firstCall.args[0].path, '/workspace/images/space name.png');
    assert.equal(warning.calledOnce, true);
  });

  it('preserves heading anchors and safe links while rebasing local destinations', async () => {
    const f = await fixture(
      '# Héllo *world*\n\n# Héllo *world*\n\n# Use `foo()` now\n\n# ![logo](x.png) Title\n\n[Anchor](#héllo-world-1) [Local](guide.md#intro) [Web](https://example.org) [Mail](mailto:test@example.org) [Command](command:workbench.action.closeWindow)\n',
    );
    sinon
      .stub(vscode.window, 'showSaveDialog')
      .resolves(vscode.Uri.joinPath(f.document.uri, '..', 'exports', 'spec.html'));
    const write = sinon.stub(vscode.workspace.fs, 'writeFile').resolves();
    await f.send({ type: 'view.executeCommand', payload: { command: 'exportHtml' } });
    const output = new JSDOM(Buffer.from(write.firstCall.args[1]).toString()).window.document;
    assert.equal(output.title, 'Héllo world');
    assert.deepEqual(
      [...output.querySelectorAll('h1')].map((heading) => heading.id),
      ['héllo-world', 'héllo-world-1', 'use-foo-now', 'title'],
    );
    assert.deepEqual(
      [...output.querySelectorAll('a')].map((link) => link.getAttribute('href') ?? undefined),
      [
        '#h%C3%A9llo-world-1',
        '../guide.md#intro',
        'https://example.org',
        'mailto:test@example.org',
        undefined,
      ],
    );
  });

  it('waits for the export flush and reads its accepted unsaved snapshot', async () => {
    const f = await fixture();
    f.replyToFlush(undefined);
    const picker = sinon
      .stub(vscode.window, 'showSaveDialog')
      .resolves(vscode.Uri.joinPath(f.document.uri, '..', 'spec.html'));
    const write = sinon.stub(vscode.workspace.fs, 'writeFile').resolves();
    const completion = provider.exportHtmlInActiveEditor();
    await tick();
    assert.equal(picker.called, false);
    const request = f.messages.at(-1)!;
    if (request.type !== 'host.requestFlush') throw new Error('Missing flush request');
    await f.send({
      type: 'view.applyDocument',
      payload: { markdown: 'Latest\n', revision: 0, operationId: 1 },
    });
    await f.send({
      type: 'view.flushComplete',
      payload: { requestId: request.payload.requestId, ok: true },
    });
    await completion;
    assert.match(Buffer.from(write.firstCall.args[1]).toString(), /<p>Latest<\/p>/);
    assert.equal((f.document.save as sinon.SinonStub).called, false);
  });

  for (const outcome of ['cancel', 'source', 'extension', 'flush', 'write'] as const) {
    it('keeps Markdown intact when export cannot complete: ' + outcome, async () => {
      const f = await fixture();
      const target =
        outcome === 'source'
          ? f.document.uri
          : vscode.Uri.joinPath(
              f.document.uri,
              '..',
              outcome === 'extension' ? 'spec.txt' : 'spec.html',
            );
      const picker = sinon
        .stub(vscode.window, 'showSaveDialog')
        .resolves(outcome === 'cancel' ? undefined : target);
      const write = sinon.stub(vscode.workspace.fs, 'writeFile').resolves();
      const error = sinon.stub(vscode.window, 'showErrorMessage').resolves();
      const success = sinon.stub(vscode.window, 'showInformationMessage').resolves();
      if (outcome === 'write') write.rejects(new Error('Permission denied'));
      if (outcome === 'flush') f.replyToFlush(false);
      await provider.exportHtmlInActiveEditor();
      assert.equal(write.callCount, outcome === 'write' ? 1 : 0);
      assert.equal(error.callCount, ['source', 'extension', 'write'].includes(outcome) ? 1 : 0);
      if (outcome === 'flush') assert.equal(picker.called, false);
      if (outcome === 'write') assert.match(error.firstCall.args[0], /Permission denied/);
      assert.equal(success.called, false);
      assert.equal(f.applyEdit.called, false);
      assert.equal((f.document.save as sinon.SinonStub).called, false);
      assert.equal(f.document.getText(), 'Alpha\n');
    });
  }

  it('falls back to alt text when an unavailable image belongs to another provider', async () => {
    await fixture('![Remote asset](image.svg)\n');
    sinon.stub(vscode.window, 'showSaveDialog').resolves(vscode.Uri.file('/export.html'));
    sinon.stub(vscode.workspace.fs, 'stat').rejects(new Error('Offline'));
    const write = sinon.stub(vscode.workspace.fs, 'writeFile').resolves();
    await provider.exportHtmlInActiveEditor();
    const output = new JSDOM(Buffer.from(write.firstCall.args[1]).toString()).window.document;
    assert.equal(output.querySelectorAll('img').length, 0);
    assert.match(output.body.textContent!, /Image: Remote asset/);
  });

  it('matches the reviewed standalone HTML fixture', async () => {
    const source = readFileSync('tests/fixtures/export/representative.md', 'utf8');
    const image = readFileSync('tests/fixtures/export/image.svg');
    const f = await fixture(source);
    sinon
      .stub(vscode.window, 'showSaveDialog')
      .resolves(vscode.Uri.joinPath(f.document.uri, '..', 'spec.html'));
    sinon
      .stub(vscode.workspace.fs, 'stat')
      .resolves({ type: 1, size: image.length, ctime: 0, mtime: 0 });
    sinon.stub(vscode.workspace.fs, 'readFile').resolves(image);
    const write = sinon.stub(vscode.workspace.fs, 'writeFile').resolves();
    await provider.exportHtmlInActiveEditor();
    assert.equal(
      Buffer.from(write.firstCall.args[1]).toString(),
      readFileSync('tests/fixtures/export/representative.html', 'utf8'),
    );
  });

  it('preserves unapplied table source separately when its panel closes', async () => {
    const f = await fixture();
    const open = sinon.spy(vscode.workspace, 'openTextDocument');
    await f.send({
      type: 'view.tableDraft',
      payload: { key: 'table-1', markdown: '| unfinished' },
    });
    f.close();
    await tick();
    assert.ok(open.calledWith({ language: 'markdown', content: '| unfinished' }));
  });

  it('preserves raw drafts when Source opens without disposing the custom editor', async () => {
    const f = await fixture();
    const open = sinon.spy(vscode.workspace, 'openTextDocument');
    const execute = sinon.stub(vscode.commands, 'executeCommand').resolves();
    await f.send({
      type: 'view.tableDraft',
      payload: { key: 'table-1', markdown: '| unfinished' },
    });
    await provider.openRawMarkdownForActiveEditor();
    assert.ok(open.calledWith({ language: 'markdown', content: '| unfinished' }));
    assert.ok(open.calledBefore(execute));
    assert.equal(f.document.getText(), 'Alpha\n');
    f.close();
    await tick();
    assert.equal(open.callCount, 1);
  });

  it('uses CSP-safe local modules and URI-preserving roots', async () => {
    const f = await fixture();
    assert.match(f.panel.webview.html, /type="module"/);
    assert.match(f.panel.webview.html, /strict-dynamic/);
    assert.doesNotMatch(f.panel.webview.html, /data: https:/);
    assert.ok(
      f.panel.webview.options.localResourceRoots!.some((root) => root.scheme === 'vscode-remote'),
    );
    assert.equal(f.messages[0].type, 'host.init');
    await f.send({ type: 'view.applyDocument', payload: { markdown: 42 } });
    assert.equal(f.applyEdit.called, false);
    await provider.notifyConfigurationChanged();
    f.trust();
    await tick();
    assert.equal(f.messages.at(-1)!.type, 'host.settingsChanged');
  });

  it('grows image resource roots only when a new folder appears, keeping the webview loaded', async () => {
    const f = await fixture('![Seed](figures/seed.png)\n\n![A](a.png)\n');
    const roots = () => f.panel.webview.options.localResourceRoots!.map(String);
    const workspaceRoot = vscode.Uri.parse('vscode-remote://ssh-remote+host/workspace');
    const folder = (name?: string) =>
      (name ? vscode.Uri.joinPath(workspaceRoot, name) : workspaceRoot).toString();
    assert.equal(f.optionUpdates.length, 1);
    assert.ok(roots().includes(folder('figures')));
    assert.equal(new Set(roots()).size, roots().length);

    let revision = 0;
    const apply = async (markdown: string) => {
      await f.send({
        type: 'view.applyDocument',
        payload: { markdown, revision, operationId: revision + 1 },
      });
      revision++;
    };
    await apply('![A](a.png)\n\n![B](b.png)\n');
    await apply('No images\n');
    assert.equal(f.optionUpdates.length, 1);

    await apply('![C](assets/c.png)\n');
    assert.equal(f.optionUpdates.length, 2);
    assert.ok(roots().includes(folder('assets')));
    assert.ok(roots().includes(folder('figures')));
    assert.equal(roots().filter((root) => root === folder()).length, 1);
    const applied = f.messages.findLast((message) => message.type === 'host.applyResult');
    assert.equal(applied?.type, 'host.applyResult');
    if (applied?.type === 'host.applyResult')
      assert.equal(
        applied.payload.imageSources['assets/c.png'],
        vscode.Uri.joinPath(workspaceRoot, 'assets', 'c.png').toString(),
      );

    await apply('Plain again\n');
    f.external('![D](assets/d.png)\n');
    assert.equal(f.optionUpdates.length, 2);
  });

  it('acknowledges each accepted operation, including no-ops, without an extra self echo', async () => {
    const f = await fixture();
    for (const operationId of [1, 2])
      await f.send({
        type: 'view.applyDocument',
        payload: {
          markdown: 'AlphaX\n',
          revision: operationId - 1,
          operationId,
        },
      });
    assert.equal(f.document.getText(), 'AlphaX\n');
    assert.equal(f.applyEdit.callCount, 1);
    const results = f.messages.filter((message) => message.type === 'host.applyResult');
    assert.deepEqual(
      results.map((result) => result.payload.ok),
      [true, true],
    );
    assert.equal(
      f.messages.some((message) => message.type === 'host.documentChanged'),
      false,
    );
  });

  it('rejects stale edits and reports the authoritative document', async () => {
    const f = await fixture();
    f.external('Remote\n');
    await f.send({
      type: 'view.applyDocument',
      payload: { markdown: 'Local\n', revision: 0, operationId: 1 },
    });
    const last = f.messages.at(-1)!;
    assert.equal(last.type, 'host.applyResult');
    if (last.type === 'host.applyResult') {
      assert.equal(last.payload.ok, false);
      assert.equal(last.payload.markdown, 'Remote\n');
    }
    assert.equal(f.applyEdit.called, false);
  });

  it('returns an explicit failure acknowledgment when the workspace refuses an edit', async () => {
    const f = await fixture();
    f.applyEdit.resolves(false);
    await f.send({
      type: 'view.applyDocument',
      payload: { markdown: 'Local', revision: 0, operationId: 7 },
    });
    const last = f.messages.at(-1)!;
    assert.equal(last.type, 'host.applyResult');
    if (last.type === 'host.applyResult') assert.equal(last.payload.ok, false);
  });

  it('flushes before native save, Source switching, and will-save handling', async () => {
    const f = await fixture();
    const execute = sinon.stub(vscode.commands, 'executeCommand').resolves();
    await f.send({ type: 'view.executeCommand', payload: { command: 'save' } });
    assert.equal((f.document.save as sinon.SinonStub).calledOnce, true);
    await provider.openRawMarkdownForActiveEditor();
    assert.equal(execute.firstCall.args[0], 'vscode.openWith');
    const waitUntil = sinon.stub();
    f.save({ document: f.document, waitUntil } as unknown as vscode.TextDocumentWillSaveEvent);
    assert.equal(waitUntil.calledOnce, true);
    await waitUntil.firstCall.args[0];
    assert.equal(f.messages.filter((message) => message.type === 'host.requestFlush').length, 3);
  });

  it('warns when native save cannot flush and retains the draft for close recovery', async () => {
    const f = await fixture();
    const warning = sinon.spy(vscode.window, 'showWarningMessage');
    f.replyToFlush(false);
    await f.send({
      type: 'view.draft',
      payload: { markdown: 'AlphaX\n', baseMarkdown: 'Alpha\n' },
    });
    const waitUntil = sinon.stub();
    f.save({ document: f.document, waitUntil } as unknown as vscode.TextDocumentWillSaveEvent);
    await waitUntil.firstCall.args[0];

    assert.equal(f.document.getText(), 'Alpha\n');
    assert.ok(
      warning.calledWith('Edits are still synchronizing. Retry once synchronization finishes.'),
    );
    f.close();
    await tick();
    assert.equal(f.document.getText(), 'AlphaX\n');
  });

  for (const delivery of ['refused', 'rejected']) {
    it(
      'reports an undeliverable flush immediately and keeps Source closed: ' + delivery,
      async () => {
        const f = await fixture();
        const post = sinon.stub(f.panel.webview, 'postMessage');
        if (delivery === 'refused') post.resolves(false);
        else post.rejects(new Error('Webview unavailable'));
        const execute = sinon.stub(vscode.commands, 'executeCommand').resolves();
        const warning = sinon.spy(vscode.window, 'showWarningMessage');
        let completed = false;
        const completion = provider.openRawMarkdownForActiveEditor().then(() => {
          completed = true;
        });
        await tick();
        assert.equal(completed, true);
        await completion;
        assert.equal(execute.called, false);
        assert.ok(
          warning.calledWith('Edits are still synchronizing. Retry once synchronization finishes.'),
        );
      },
    );
  }

  it('settles a pending Source request on close without reopening the disposed panel', async () => {
    const f = await fixture();
    f.replyToFlush(undefined);
    const execute = sinon.stub(vscode.commands, 'executeCommand').resolves();
    let completed = false;
    const completion = provider.openRawMarkdownForActiveEditor().then(() => {
      completed = true;
    });
    f.close();
    await tick();
    assert.equal(completed, true);
    await completion;
    assert.equal(execute.called, false);
  });

  it('waits for the matching delayed flush before opening the current document in Source', async () => {
    const f = await fixture();
    f.replyToFlush(undefined);
    const execute = sinon.stub(vscode.commands, 'executeCommand').resolves();
    const completion = provider.openRawMarkdownForActiveEditor();
    const request = f.messages.at(-1)!;
    assert.equal(request.type, 'host.requestFlush');
    if (request.type !== 'host.requestFlush') throw new Error('Missing flush request');
    await f.send({
      type: 'view.flushComplete',
      payload: { requestId: request.payload.requestId + 1, ok: true },
    });
    assert.equal(execute.called, false);
    f.external('Remote\n');
    await f.send({
      type: 'view.flushComplete',
      payload: { requestId: request.payload.requestId, ok: true },
    });
    await completion;
    assert.equal(execute.firstCall.args[0], 'vscode.openWith');
    assert.equal(execute.firstCall.args[1].toString(), f.document.uri.toString());
    assert.equal(f.document.getText(), 'Remote\n');
  });

  it('times out a silent editor without saving and ignores its late completion', async () => {
    const f = await fixture();
    f.replyToFlush(undefined);
    const warning = sinon.spy(vscode.window, 'showWarningMessage');
    const clock = sinon.useFakeTimers();
    const completion = f.send({ type: 'view.executeCommand', payload: { command: 'save' } });
    const request = f.messages.at(-1)!;
    assert.equal(request.type, 'host.requestFlush');
    if (request.type !== 'host.requestFlush') throw new Error('Missing flush request');
    await clock.tickAsync(1500);
    await completion;
    await f.send({
      type: 'view.flushComplete',
      payload: { requestId: request.payload.requestId, ok: true },
    });
    assert.equal((f.document.save as sinon.SinonStub).called, false);
    assert.equal(warning.callCount, 1);
  });

  it('drains the latest draft when the panel closes before its next apply message', async () => {
    const f = await fixture();
    await f.send({
      type: 'view.draft',
      payload: { markdown: 'AlphaXY\n', baseMarkdown: 'Alpha\n' },
    });
    f.close();
    await tick();
    assert.equal(f.document.getText(), 'AlphaXY\n');
  });

  it('applies a closing draft over its own applied but unacknowledged edit', async () => {
    const f = await fixture();
    const open = sinon.spy(vscode.workspace, 'openTextDocument');
    await f.send({
      type: 'view.applyDocument',
      payload: { markdown: 'AlphaX\n', revision: 0, operationId: 1 },
    });
    await f.send({
      type: 'view.draft',
      payload: { markdown: 'AlphaXY\n', baseMarkdown: 'Alpha\n' },
    });
    f.close();
    await tick();
    assert.equal(f.document.getText(), 'AlphaXY\n');
    assert.equal(open.called, false);
  });

  it('merges a closing draft with an independent external change', async () => {
    const f = await fixture('Alpha\n\nBeta\n');
    const open = sinon.spy(vscode.workspace, 'openTextDocument');
    await f.send({
      type: 'view.draft',
      payload: { markdown: 'AlphaX\n\nBeta\n', baseMarkdown: 'Alpha\n\nBeta\n' },
    });
    f.external('Alpha\n\nBetaY\n');
    f.close();
    await tick();
    assert.equal(f.document.getText(), 'AlphaX\n\nBetaY\n');
    assert.equal(open.called, false);
  });

  for (const failure of ['conflict', 'refused'] as const) {
    it('recovers a closing draft that cannot be applied: ' + failure, async () => {
      const f = await fixture();
      const open = sinon.spy(vscode.workspace, 'openTextDocument');
      const warning = sinon.spy(vscode.window, 'showWarningMessage');
      await f.send({
        type: 'view.draft',
        payload: { markdown: 'AlphaX\n', baseMarkdown: 'Alpha\n' },
      });
      if (failure === 'conflict') f.external('Remote\n');
      else f.applyEdit.resolves(false);
      f.close();
      await tick();
      assert.ok(open.calledOnceWithExactly({ language: 'markdown', content: 'AlphaX\n' }));
      assert.equal(f.document.getText(), failure === 'conflict' ? 'Remote\n' : 'Alpha\n');
      assert.equal(f.applyEdit.callCount, failure === 'conflict' ? 0 : 1);
      assert.equal(warning.calledOnce, true);
      assert.equal(
        f.messages.some((message) => message.type === 'host.draftRecovered'),
        false,
      );
    });
  }

  it('returns bounded native picker choices and cancellation to the requesting editor', async () => {
    const f = await fixture();
    const pick = sinon.stub(vscode.window, 'showQuickPick');
    pick.resolves({ label: 'Add Row', command: 'addTableRow' } as vscode.QuickPickItem);
    await f.send({ type: 'view.requestPicker', payload: { requestId: 1, kind: 'tableAdd' } });
    assert.match(pick.lastCall.args[1]!.placeHolder!, /Add to table/);
    assert.deepEqual(f.messages.at(-1), {
      type: 'host.pickerResult',
      payload: { requestId: 1, command: 'addTableRow' },
    });
    pick.resolves();
    await f.send({ type: 'view.requestPicker', payload: { requestId: 2, kind: 'tableAdd' } });
    assert.deepEqual(
      (pick.lastCall.args[0] as vscode.QuickPickItem[]).map((item) => item.label),
      ['Add Row', 'Add Column'],
    );
    assert.deepEqual(f.messages.at(-1), {
      type: 'host.pickerResult',
      payload: { requestId: 2, command: undefined },
    });
  });

  it('keeps link cancellation explicit and routes only permitted schemes', async () => {
    const f = await fixture();
    sinon.stub(vscode.window, 'showInputBox').resolves();
    await f.send({ type: 'view.requestLinkInput', payload: { selectedText: 'Label' } });
    assert.equal(f.messages.at(-1)!.type, 'host.linkInputCanceled');
    const execute = sinon.stub(vscode.commands, 'executeCommand').resolves();
    const external = sinon.stub(vscode.env, 'openExternal').resolves(true);
    sinon.stub(vscode.workspace.fs, 'stat').resolves({ size: 5 } as vscode.FileStat);
    for (const href of [
      'command:malicious',
      'javascript:alert(1)',
      'data:text/plain,example',
      '//example.com',
    ]) {
      await f.send({ type: 'view.openLink', payload: { href } });
    }
    assert.equal(execute.called, false);
    assert.equal(external.called, false);
    await f.send({ type: 'view.openLink', payload: { href: 'https://example.com' } });
    assert.equal(external.calledOnce, true);
    await f.send({ type: 'view.openLink', payload: { href: 'mailto:writer@example.com' } });
    assert.equal(external.callCount, 2);
    await f.send({ type: 'view.openLink', payload: { href: 'related%20spec.md' } });
    const target = execute.lastCall.args[1] as vscode.Uri;
    assert.equal(target.scheme, 'vscode-remote');
    assert.equal(target.path, '/workspace/related spec.md');
  });

  it('rejects malformed and oversized image payloads before writing', async () => {
    const f = await fixture();
    for (const bytesBase64 of [
      'bad data!',
      'A'.repeat(14 * 1024 * 1024),
      '',
      Buffer.from('fake').toString('base64'),
    ]) {
      await f.send({
        type: 'view.requestImageInsert',
        payload: { kind: 'paste', name: 'script.exe', bytesBase64 },
      });
      assert.equal(f.messages.at(-1)!.type, 'host.imageRejected');
    }
  });

  it('recovers a conflicting draft into a separate unsaved Markdown document', async () => {
    const f = await fixture();
    const open = sinon.stub(vscode.workspace, 'openTextDocument').resolves(f.document);
    const show = sinon.stub(vscode.window, 'showTextDocument').resolves({} as vscode.TextEditor);
    await f.send({ type: 'view.recoverDraft', payload: { markdown: 'Local recovery text' } });
    assert.deepEqual(open.firstCall.args[0], {
      language: 'markdown',
      content: 'Local recovery text',
    });
    assert.equal(show.calledOnce, true);
    assert.equal(f.document.getText(), 'Alpha\n');
    assert.equal(f.messages.at(-1)!.type, 'host.draftRecovered');
  });

  it('re-enables the editor after recovery while the warning notification stays open', async () => {
    const f = await fixture();
    const open = sinon.stub(vscode.workspace, 'openTextDocument').resolves(f.document);
    sinon.stub(vscode.window, 'showTextDocument').resolves({} as vscode.TextEditor);
    const warning = sinon
      .stub(vscode.window, 'showWarningMessage')
      .returns(new Promise<undefined>(noop));
    void f.send({ type: 'view.recoverDraft', payload: { markdown: 'First recovery' } });
    await tick();
    assert.equal(f.messages.at(-1)!.type, 'host.draftRecovered');
    void f.send({ type: 'view.recoverDraft', payload: { markdown: 'Second recovery' } });
    await tick();
    assert.equal(open.callCount, 2);
    assert.deepEqual(open.secondCall.args[0], {
      language: 'markdown',
      content: 'Second recovery',
    });
    assert.equal(warning.callCount, 2);
    assert.equal(f.messages.filter((message) => message.type === 'host.draftRecovered').length, 2);
  });

  it('creates relative file links and native heading selections', async () => {
    const f = await fixture('---\ntitle: Metadata\n---\n\n# First\n\n## Next\n');
    sinon
      .stub(vscode.window, 'showOpenDialog')
      .resolves([vscode.Uri.joinPath(f.document.uri, '..', 'related note.md')]);
    await provider.insertFileLinkInActiveEditor();
    const last = f.messages.at(-1)!;
    assert.equal(last.type, 'host.insertLink');
    if (last.type === 'host.insertLink') assert.equal(last.payload.href, 'related%20note.md');
    sinon.stub(vscode.window, 'showQuickPick').callsFake(async (items) => {
      const values = await items;
      assert.deepEqual(
        values.map((item) => (item as vscode.QuickPickItem).label),
        ['First', 'Next'],
      );
      return values[1] as never;
    });
    await provider.goToHeadingInActiveEditor();
    assert.deepEqual(f.messages.at(-1), { type: 'host.revealHeading', payload: { index: 1 } });
  });

  it('writes accepted image data through the document filesystem provider', async () => {
    const f = await fixture();
    sinon
      .stub(vscode.workspace.fs, 'stat')
      .rejects(Object.assign(new Error('Missing'), { code: 'FileNotFound' }));
    const mkdir = sinon.stub(vscode.workspace.fs, 'createDirectory').resolves();
    const write = sinon.stub(vscode.workspace.fs, 'writeFile').resolves();
    await f.send({
      type: 'view.requestImageInsert',
      payload: {
        kind: 'paste',
        name: 'diagram.png',
        mime: 'image/png',
        bytesBase64: Buffer.from([137, 80, 78, 71]).toString('base64'),
      },
    });
    assert.equal(mkdir.calledOnce, true);
    assert.equal(write.firstCall.args[0].scheme, 'vscode-remote');
    const imageMessage = f.messages.at(-1)!;
    assert.equal(imageMessage.type, 'host.imageInserted');
    if (imageMessage.type !== 'host.imageInserted') return;
    const remove = sinon.stub(vscode.workspace.fs, 'delete').resolves();
    await f.send({
      type: 'view.imageInsertResult',
      payload: { requestId: imageMessage.payload.requestId, ok: true },
    });
    assert.equal(remove.called, false);
  });

  it('removes a copied image when the editor rejects insertion', async () => {
    const f = await fixture();
    const bytes = Buffer.from([137, 80, 78, 71]);
    sinon
      .stub(vscode.workspace.fs, 'stat')
      .rejects(Object.assign(new Error('Missing'), { code: 'FileNotFound' }));
    sinon.stub(vscode.workspace.fs, 'createDirectory').resolves();
    const write = sinon.stub(vscode.workspace.fs, 'writeFile').resolves();
    const read = sinon.stub(vscode.workspace.fs, 'readFile').resolves(bytes);
    const remove = sinon.stub(vscode.workspace.fs, 'delete').resolves();
    await f.send({
      type: 'view.requestImageInsert',
      payload: {
        kind: 'drop',
        name: 'diagram.png',
        mime: 'image/png',
        bytesBase64: bytes.toString('base64'),
      },
    });
    const imageMessage = f.messages.at(-1)!;
    assert.equal(imageMessage.type, 'host.imageInserted');
    if (imageMessage.type !== 'host.imageInserted') return;
    await f.send({
      type: 'view.imageInsertResult',
      payload: { requestId: imageMessage.payload.requestId, ok: false },
    });
    assert.equal(remove.calledOnceWithExactly(write.firstCall.args[0]), true);
    await f.send({
      type: 'view.imageInsertResult',
      payload: { requestId: imageMessage.payload.requestId, ok: false },
    });
    assert.equal(remove.calledOnce, true);

    read.resolves(Buffer.from('changed after copy'));
    await f.send({
      type: 'view.requestImageInsert',
      payload: {
        kind: 'drop',
        name: 'diagram.png',
        mime: 'image/png',
        bytesBase64: bytes.toString('base64'),
      },
    });
    const nextMessage = f.messages.at(-1)!;
    assert.equal(nextMessage.type, 'host.imageInserted');
    if (nextMessage.type !== 'host.imageInserted') return;
    await f.send({
      type: 'view.imageInsertResult',
      payload: { requestId: nextMessage.payload.requestId, ok: false },
    });
    assert.equal(remove.calledOnce, true);
  });

  it('removes a copied image when its message cannot reach the editor', async () => {
    const f = await fixture();
    const bytes = Buffer.from([137, 80, 78, 71]);
    sinon
      .stub(vscode.workspace.fs, 'stat')
      .rejects(Object.assign(new Error('Missing'), { code: 'FileNotFound' }));
    sinon.stub(vscode.workspace.fs, 'createDirectory').resolves();
    sinon.stub(vscode.workspace.fs, 'writeFile').resolves();
    sinon.stub(vscode.workspace.fs, 'readFile').resolves(bytes);
    const remove = sinon.stub(vscode.workspace.fs, 'delete').resolves();
    sinon.stub(f.panel.webview, 'postMessage').resolves(false);
    await f.send({
      type: 'view.requestImageInsert',
      payload: {
        kind: 'drop',
        name: 'diagram.png',
        mime: 'image/png',
        bytesBase64: bytes.toString('base64'),
      },
    });
    assert.equal(remove.calledOnce, true);
  });

  it('gives concurrent image inserts distinct files without overwriting either', async () => {
    const f = await fixture();
    const files = new Map<string, Uint8Array>();
    sinon.stub(vscode.workspace.fs, 'stat').callsFake(async (uri) => {
      await tick();
      const stored = files.get(uri.toString());
      if (!stored) throw Object.assign(new Error('Missing'), { code: 'FileNotFound' });
      return { type: 1, size: stored.byteLength, ctime: 0, mtime: 0 };
    });
    sinon.stub(vscode.workspace.fs, 'createDirectory').resolves();
    sinon.stub(vscode.workspace.fs, 'writeFile').callsFake(async (uri, bytes) => {
      await tick();
      files.set(uri.toString(), bytes);
    });
    const insert = (bytes: number[]) =>
      f.send({
        type: 'view.requestImageInsert',
        payload: {
          kind: 'drop',
          name: 'diagram.png',
          mime: 'image/png',
          bytesBase64: Buffer.from(bytes).toString('base64'),
        },
      });
    await Promise.all([insert([137, 80, 78, 71, 1]), insert([137, 80, 78, 71, 2])]);

    const inserted = f.messages.filter((message) => message.type === 'host.imageInserted');
    assert.deepEqual(inserted.map((message) => message.payload.path).toSorted(), [
      'images/diagram-1.png',
      'images/diagram.png',
    ]);
    assert.equal(files.size, 2);
    assert.deepEqual([...files.values()].map((bytes) => bytes.at(-1)).toSorted(), [1, 2]);
  });

  it('loads and inserts images with invalid settings by falling back to defaults', async () => {
    const f = await fixture('Alpha\n', {
      'toolbar.mode': 'compact',
      'integrations.mermaid.enabled': 'false',
      'images.destination': 42,
    });
    const init = f.messages[0];
    assert.equal(isHostToViewMessage(init), true);
    if (init.type === 'host.init') assert.equal(init.payload.mermaidEnabled, false);
    await provider.notifyConfigurationChanged();
    assert.equal(isHostToViewMessage(f.messages.at(-1)), true);

    sinon
      .stub(vscode.workspace.fs, 'stat')
      .rejects(Object.assign(new Error('Missing'), { code: 'FileNotFound' }));
    sinon.stub(vscode.workspace.fs, 'createDirectory').resolves();
    const write = sinon.stub(vscode.workspace.fs, 'writeFile').resolves();
    await f.send({
      type: 'view.requestImageInsert',
      payload: {
        kind: 'drop',
        name: 'diagram.png',
        mime: 'image/png',
        bytesBase64: Buffer.from([137, 80, 78, 71]).toString('base64'),
      },
    });
    assert.equal(write.firstCall?.args[0].path, '/workspace/images/diagram.png');
    assert.equal(f.messages.at(-1)!.type, 'host.imageInserted');
  });

  it('does not treat a permission error as a safe unused image filename', async () => {
    const f = await fixture();
    sinon
      .stub(vscode.workspace.fs, 'stat')
      .rejects(Object.assign(new Error('Denied'), { code: 'NoPermissions' }));
    const write = sinon.stub(vscode.workspace.fs, 'writeFile').resolves();
    await f.send({
      type: 'view.requestImageInsert',
      payload: {
        kind: 'paste',
        name: 'image.png',
        mime: 'image/png',
        bytesBase64: Buffer.from([137, 80, 78, 71]).toString('base64'),
      },
    });
    assert.equal(write.called, false);
    assert.equal(f.messages.at(-1)!.type, 'host.imageRejected');
  });

  it('forwards formatting commands only to a ready active session', async () => {
    const f = await fixture();
    await provider.executeCommandInActiveEditor('toggleBold');
    assert.equal(f.messages.at(-1)!.type, 'host.executeCommand');
    f.close();
    await provider.executeCommandInActiveEditor('toggleBold');
  });
});
