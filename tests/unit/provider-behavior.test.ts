// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import assert from 'node:assert/strict';
import sinon from 'sinon';
import * as vscode from 'vscode';
import { MuninnCustomEditorProvider } from '../../src/custom-editor/muninn-custom-editor-provider';
import { ConfigService } from '../../src/services/config-service';
import type { Logger } from '../../src/services/logger';
import type { HostToViewMessage } from '../../src/custom-editor/protocol';

const noop = (): void => {};
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('custom editor host lifecycle', () => {
  let provider: MuninnCustomEditorProvider;
  afterEach(() => {
    provider?.dispose();
    sinon.restore();
  });

  const fixture = async (initial = 'Alpha\n') => {
    let text = initial;
    let receive: (message: unknown) => unknown = noop;
    let close: () => void = noop;
    let changed: (event: vscode.TextDocumentChangeEvent) => unknown = noop;
    let trusted: () => unknown = noop;
    let willSave: (event: vscode.TextDocumentWillSaveEvent) => unknown = noop;
    const messages: HostToViewMessage[] = [];
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
      get: <T>(_key: string, fallback?: T) => fallback,
      inspect: (): undefined => {},
      has: () => false,
      update: async () => {},
    } as vscode.WorkspaceConfiguration);
    const logger = { warn: sinon.stub(), error: sinon.stub() } as unknown as Logger;
    provider = new MuninnCustomEditorProvider(
      vscode.Uri.file('/extension'),
      new ConfigService(),
      logger,
    );
    const panel = {
      webview: {
        html: '',
        options: {},
        cspSource: 'https://local.resources',
        asWebviewUri: (value: vscode.Uri) => value,
        onDidReceiveMessage: (listener: (value: unknown) => unknown) => {
          receive = listener;
          return { dispose() {} };
        },
        postMessage: async (message: HostToViewMessage) => {
          messages.push(message);
          if (message.type === 'host.requestFlush')
            queueMicrotask(() => {
              void receive({
                type: 'view.flushComplete',
                payload: { requestId: message.payload.requestId, ok: true },
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
      logger,
      applyEdit,
      close: () => close(),
      external: (value: string) => {
        text = value;
        changed({ document } as vscode.TextDocumentChangeEvent);
      },
      trust: () => trusted(),
      save: (event: vscode.TextDocumentWillSaveEvent) => willSave(event),
    };
  };

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

  it('keeps link cancellation explicit and routes only permitted schemes', async () => {
    const f = await fixture();
    sinon.stub(vscode.window, 'showInputBox').resolves();
    await f.send({ type: 'view.requestLinkInput', payload: { selectedText: 'Label' } });
    assert.equal(f.messages.at(-1)!.type, 'host.linkInputCanceled');
    const execute = sinon.stub(vscode.commands, 'executeCommand').resolves();
    const external = sinon.stub(vscode.env, 'openExternal').resolves(true);
    sinon.stub(vscode.workspace.fs, 'stat').resolves({ size: 5 } as vscode.FileStat);
    await f.send({ type: 'view.openLink', payload: { href: 'command:malicious' } });
    assert.equal(execute.called, false);
    await f.send({ type: 'view.openLink', payload: { href: 'https://example.com' } });
    assert.equal(external.calledOnce, true);
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
