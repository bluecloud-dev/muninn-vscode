import sinon from 'sinon';
import * as vscode from 'vscode';
import { MuninnCustomEditorProvider } from '../../src/custom-editor/muninn-custom-editor-provider';
import {
  type HostToViewMessage,
  isHostToViewMessage,
  isViewToHostMessage,
} from '../../src/custom-editor/protocol';
import type { ConfigService } from '../../src/services/config-service';

let expect: Chai.ExpectStatic;

before(async () => {
  ({ expect } = await import('chai'));
});

const ensureUriJoinPath = (): void => {
  if (typeof vscode.Uri.joinPath === 'function') {
    return;
  }

  Object.defineProperty(vscode.Uri, 'joinPath', {
    value: (base: vscode.Uri, ...segments: string[]) => {
      const joinedFsPath = [base.fsPath, ...segments].join('/').replaceAll(/\/+/g, '/');
      return vscode.Uri.file(joinedFsPath);
    },
  });
};

const createDocument = (filePath: string, text: string): vscode.TextDocument => {
  const lines = text.split('\n');
  return {
    uri: vscode.Uri.file(filePath),
    fileName: filePath,
    getText: () => text,
    lineCount: lines.length,
    lineAt: (line: number) => ({
      range: {
        end: new vscode.Position(line, lines[line]?.length ?? 0),
      },
    }),
  } as unknown as vscode.TextDocument;
};

const createPanel = (): {
  dispatchMessage: (message: unknown) => Promise<void>;
  panel: vscode.WebviewPanel;
  postedMessages: HostToViewMessage[];
} => {
  let messageListener: ((message: unknown) => unknown) | undefined;
  const postedMessages: HostToViewMessage[] = [];
  const webview = {
    options: {},
    html: '',
    asWebviewUri: (uri: vscode.Uri) => uri,
    onDidReceiveMessage: (listener: (message: unknown) => unknown) => {
      messageListener = listener;
      return { dispose: () => {} };
    },
    postMessage: async (message: HostToViewMessage) => {
      postedMessages.push(message);
      return true;
    },
  } as unknown as vscode.Webview;

  return {
    panel: {
      webview,
      onDidDispose: () => ({ dispose: () => {} }),
    } as unknown as vscode.WebviewPanel,
    postedMessages,
    dispatchMessage: async (message: unknown) => {
      await Promise.resolve(messageListener?.(message));
    },
  };
};

const createConfigService = (): ConfigService =>
  ({
    getMermaidEnabled: () => true,
    getMermaidAllowInUntrustedWorkspaces: () => true,
    getToolbarMode: () => 'basic',
    getContentWidth: () => 'comfortable',
    getImageDestination: () => 'images/',
  }) as unknown as ConfigService;

const createLogger = (): vscode.LogOutputChannel =>
  ({
    warn: sinon.stub(),
    error: sinon.stub(),
  }) as unknown as vscode.LogOutputChannel;

describe('custom editor init protocol', () => {
  it('includes the document file name in the host init payload', async () => {
    ensureUriJoinPath();
    const provider = new MuninnCustomEditorProvider(
      vscode.Uri.file('/extension'),
      createConfigService(),
      createLogger(),
    );
    const document = createDocument('/workspace/notes/Welcome.md', '# Welcome\n');
    const { dispatchMessage, panel, postedMessages } = createPanel();

    await provider.resolveCustomTextEditor(document, panel);
    await dispatchMessage({ type: 'view.ready' });

    const initMessage = postedMessages.find((message) => message.type === 'host.init');

    expect(initMessage?.payload.fileName).to.equal('Welcome.md');
    expect(initMessage?.payload.contentWidth).to.equal('comfortable');
  });
});

describe('custom editor protocol guards', () => {
  it('bounds native picker requests and results at both message boundaries', () => {
    expect(
      isViewToHostMessage({
        type: 'view.requestPicker',
        payload: { requestId: 1, kind: 'blockStyle', current: 6 },
      }),
    ).to.equal(true);
    expect(
      isHostToViewMessage({
        type: 'host.pickerResult',
        payload: { requestId: 1, command: 'setHeading2' },
      }),
    ).to.equal(true);
    expect(isHostToViewMessage({ type: 'host.pickerResult', payload: { requestId: 1 } })).to.equal(
      true,
    );
    for (const payload of [
      { requestId: -1, kind: 'blockStyle' },
      { requestId: 1, kind: 'arbitrary' },
      { requestId: 1, kind: 'blockStyle', current: 7 },
      { requestId: 1, kind: 'blockStyle', current: '1' },
    ])
      expect(isViewToHostMessage({ type: 'view.requestPicker', payload })).to.equal(false);
    for (const command of ['openRawMarkdown', 'undo', 'arbitrary', 1])
      expect(
        isHostToViewMessage({ type: 'host.pickerResult', payload: { requestId: 1, command } }),
      ).to.equal(false);
  });

  it('accepts valid view-to-host payloads', () => {
    expect(isViewToHostMessage({ type: 'view.ready' })).to.equal(true);
    expect(
      isViewToHostMessage({
        type: 'view.applyDocument',
        payload: { markdown: '# title', revision: 3, operationId: 1 },
      }),
    ).to.equal(true);
    expect(
      isViewToHostMessage({
        type: 'view.executeCommand',
        payload: { command: 'openRawMarkdown' },
      }),
    ).to.equal(true);
    expect(
      isViewToHostMessage({
        type: 'view.requestLinkInput',
        payload: { selectedText: 'Muninn' },
      }),
    ).to.equal(true);
    expect(
      isViewToHostMessage({
        type: 'view.requestImageInsert',
        payload: { kind: 'paste', name: 'clip.png', mime: 'image/png', bytesBase64: 'aGVsbG8=' },
      }),
    ).to.equal(true);
    expect(
      isViewToHostMessage({
        type: 'view.imageInsertResult',
        payload: { requestId: 1, ok: false },
      }),
    ).to.equal(true);
    expect(
      isViewToHostMessage({
        type: 'view.applyDocument',
        payload: { markdown: 123, revision: 0 },
      }),
    ).to.equal(false);
  });

  it('rejects malformed view-to-host payloads', () => {
    expect(isViewToHostMessage(void 0)).to.equal(false);
    expect(isViewToHostMessage({ type: 'view.applyDocument' })).to.equal(false);
    expect(
      isViewToHostMessage({
        type: 'view.executeCommand',
        payload: { command: 'not-supported' },
      }),
    ).to.equal(false);
    expect(
      isViewToHostMessage({
        type: 'view.requestImageInsert',
        payload: { kind: 'command', bytesBase64: 'aGVsbG8=' },
      }),
    ).to.equal(false);
    expect(
      isViewToHostMessage({
        type: 'view.imageInsertResult',
        payload: { requestId: -1, ok: 'false' },
      }),
    ).to.equal(false);
  });

  it('accepts valid host-to-view payloads', () => {
    expect(
      isHostToViewMessage({
        type: 'host.init',
        payload: {
          fileName: 'README.md',
          markdown: '# title',
          revision: 1,
          mermaidEnabled: true,
          toolbarMode: 'basic',
          contentWidth: 'comfortable',
          imageSources: {},
        },
      }),
    ).to.equal(true);
    expect(
      isHostToViewMessage({
        type: 'host.executeCommand',
        payload: { command: 'insertMermaidBlock' },
      }),
    ).to.equal(true);
    expect(
      isHostToViewMessage({
        type: 'host.settingsChanged',
        payload: { mermaidEnabled: true, toolbarMode: 'advanced', contentWidth: 92 },
      }),
    ).to.equal(true);
    expect(
      isHostToViewMessage({
        type: 'host.insertLink',
        payload: { href: 'https://example.com', text: 'Example' },
      }),
    ).to.equal(true);
    expect(
      isHostToViewMessage({
        type: 'host.imageInserted',
        payload: {
          requestId: 1,
          path: 'images/screenshot.png',
          webviewUri: 'vscode-webview://view/images/screenshot.png',
          filename: 'screenshot.png',
        },
      }),
    ).to.equal(true);
    expect(
      isHostToViewMessage({
        type: 'host.imageRejected',
        payload: { reason: 'Unsupported image type.' },
      }),
    ).to.equal(true);
    expect(
      isHostToViewMessage({
        type: 'host.error',
        payload: { code: 'revision_mismatch', message: 'nope' },
      }),
    ).to.equal(true);
  });

  it('rejects malformed host-to-view payloads', () => {
    expect(isHostToViewMessage({ type: 'host.init', payload: void 0 })).to.equal(false);
    expect(
      isHostToViewMessage({
        type: 'host.init',
        payload: { markdown: '', revision: 0, mermaidEnabled: true },
      }),
    ).to.equal(false);
    expect(
      isHostToViewMessage({
        type: 'host.init',
        payload: {
          markdown: '',
          revision: 0,
          mermaidEnabled: true,
          toolbarMode: 'basic',
          contentWidth: 'comfortable',
          imageSources: {},
        },
      }),
    ).to.equal(false);
    expect(
      isHostToViewMessage({
        type: 'host.init',
        payload: {
          fileName: 'README.md',
          markdown: '',
          revision: 0,
          mermaidEnabled: true,
          toolbarMode: 'basic',
          imageSources: {},
        },
      }),
    ).to.equal(false);
    expect(
      isHostToViewMessage({
        type: 'host.settingsChanged',
        payload: { mermaidEnabled: true, toolbarMode: 'basic', contentWidth: 200 },
      }),
    ).to.equal(false);
    expect(
      isHostToViewMessage({
        type: 'host.executeCommand',
        payload: { command: 'openRawMarkdown' },
      }),
    ).to.equal(false);
    expect(
      isHostToViewMessage({
        type: 'host.error',
        payload: { code: 'unknown', message: 'x' },
      }),
    ).to.equal(false);
    expect(
      isHostToViewMessage({
        type: 'host.settingsChanged',
        payload: { mermaidEnabled: true, toolbarMode: 'unknown' },
      }),
    ).to.equal(false);
  });
});
