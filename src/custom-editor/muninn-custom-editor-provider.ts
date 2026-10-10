// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import path from 'node:path';
import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import MarkdownIt from 'markdown-it';
import frontMatterPlugin from 'markdown-it-front-matter';
import { ConfigService } from '../services/config-service';
import type { ContentWidthSetting } from '../types/config';
import { isMermaidIntegrationActive } from '../integrations/mermaid-adapter';
import { t } from '../utils/l10n';
import { DEFAULT_WEBVIEW_STRINGS, type WebviewStrings } from '../shared/webview-strings';
import {
  MAX_IMAGE_BYTES,
  appendDeduplicationSuffix,
  formatPasteImageFileName,
  getImageDestinationDirectory,
  getMarkdownImagePath,
  resolveMarkdownImageUri,
  sanitizeImageFileName,
  validateImageAsset,
  type HostImageInsertKind,
  type ImageValidationFailure,
} from './image-assets';
import { DocumentSync } from './document-sync';
import { mergeIndependentChanges } from '../shared/text-edits';
import {
  HostToViewMessage,
  ImageUriMap,
  isViewToHostMessage,
  SerializedMarkdownPayload,
  ToolbarMode,
  ViewEditorCommand,
  PickerCommand,
  ViewToHostMessage,
} from './protocol';

export const MUNINN_MARKDOWN_EDITOR_VIEW_TYPE = 'muninn.markdownEditor';

let cachedLocalizedWebviewStrings: WebviewStrings | undefined;

const getLocalizedWebviewStrings = (): WebviewStrings => {
  if (!cachedLocalizedWebviewStrings) {
    cachedLocalizedWebviewStrings = Object.fromEntries(
      Object.entries(DEFAULT_WEBVIEW_STRINGS).map(([key, value]) => [key, t(value)]),
    ) as WebviewStrings;
  }
  return cachedLocalizedWebviewStrings;
};

const serializeForInlineScript = (value: unknown): string =>
  JSON.stringify(value).replaceAll('<', String.raw`\u003c`);

const markdownItParser = MarkdownIt('commonmark', {
  html: false,
  linkify: true,
}).use(frontMatterPlugin, () => {});

type EditorSession = {
  document: vscode.TextDocument;
  panel: vscode.WebviewPanel;
  sync: DocumentSync;
  ready: boolean;
  pendingCommands: ViewEditorCommand[];
  pendingFlushes: Map<number, (ok: boolean) => void>;
  applyingText?: string;
  lastAppliedText?: string;
  draft?: { markdown: string; baseMarkdown: string };
  applyQueue: Promise<void>;
  recovering: boolean;
  tableDrafts: Map<string, string>;
  imageCache?: { sources: string[]; map: ImageUriMap };
  disposables: vscode.Disposable[];
};

type SessionSettings = {
  mermaidEnabled: boolean;
  toolbarMode: ToolbarMode;
  contentWidth: ContentWidthSetting;
};

type HostMarkdownPayload = SerializedMarkdownPayload & {
  imageSources: ImageUriMap;
};

type ImageSourceInput = {
  kind: HostImageInsertKind;
  name?: string;
  mime?: string;
  bytes: Uint8Array;
};

type PendingImageInsert = {
  session: EditorSession;
  uri: vscode.Uri;
  markdownPath: string;
  bytes: Uint8Array;
};

export class MuninnCustomEditorProvider
  implements vscode.CustomTextEditorProvider, vscode.Disposable
{
  private readonly sessionsByUri = new Map<string, EditorSession>();
  private readonly sessions = new Map<string, EditorSession>();
  private readonly disposables: vscode.Disposable[] = [];
  private nextSessionId = 1;
  private nextFlushId = 1;
  private nextImageInsertId = 1;
  private readonly pendingAnchors = new Map<string, string>();
  private readonly pendingImageInsertions = new Map<number, PendingImageInsert>();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly configService: ConfigService,
    private readonly logger: vscode.LogOutputChannel,
  ) {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        this.handleDocumentChanged(event);
      }),
      vscode.workspace.onDidGrantWorkspaceTrust(() => {
        void this.notifyConfigurationChanged();
      }),
      vscode.workspace.onWillSaveTextDocument((event) => {
        const session = this.getFirstSessionForUri(event.document.uri);
        if (session?.ready) event.waitUntil(this.flushSession(session).then(() => []));
      }),
    );
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    for (const session of this.sessions.values()) {
      session.ready = false;
      for (const finish of session.pendingFlushes.values()) finish(false);
      for (const disposable of session.disposables) {
        disposable.dispose();
      }
    }
    this.pendingImageInsertions.clear();
    this.pendingAnchors.clear();
    this.sessions.clear();
    this.sessionsByUri.clear();
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: this.getLocalResourceRoots(document.uri),
    };
    webviewPanel.webview.html = this.getHtml(webviewPanel.webview);

    const sessionId = String(this.nextSessionId++);
    const uriKey = document.uri.toString();
    const sync = new DocumentSync(document);
    const session: EditorSession = {
      document,
      panel: webviewPanel,
      sync,
      ready: false,
      pendingCommands: [],
      pendingFlushes: new Map(),
      applyQueue: Promise.resolve(),
      recovering: false,
      tableDrafts: new Map(),
      disposables: [],
    };
    this.sessions.set(sessionId, session);
    this.sessionsByUri.set(uriKey, session);

    session.disposables.push(
      webviewPanel.webview.onDidReceiveMessage(async (rawMessage: unknown) => {
        if (!isViewToHostMessage(rawMessage)) {
          this.logger.warn('Ignoring invalid message payload from Muninn webview editor.');
          return;
        }
        const message: ViewToHostMessage = rawMessage;
        try {
          await this.handleViewMessage(sessionId, message);
        } catch (error: unknown) {
          this.logger.error(t('Could not synchronize the document.'), error);
        }
      }),
      webviewPanel.onDidDispose(() => {
        this.disposeSession(sessionId);
      }),
    );
  }

  async openRawMarkdownForActiveEditor(): Promise<void> {
    const uri = this.getActiveCustomEditorUri();
    if (uri) {
      await this.openRawMarkdown(uri);
      return;
    }

    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor?.document.languageId === 'markdown') {
      await this.openRawMarkdown(activeEditor.document.uri);
    }
  }

  async executeCommandInActiveEditor(command: ViewEditorCommand): Promise<void> {
    const session = this.getActiveSession();
    if (!session) return;
    if (!session.ready) {
      session.pendingCommands.push(command);
      return;
    }

    await this.postMessage(session.panel.webview, {
      type: 'host.executeCommand',
      payload: { command },
    });
  }

  async insertImageInActiveEditor(): Promise<void> {
    const session = this.getActiveSession();
    if (!session || !session.ready) {
      return;
    }

    const selection = await vscode.window.showOpenDialog({
      title: t('Insert Image'),
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: {
        [t('Images')]: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'],
      },
    });

    const sourceUri = selection?.[0];
    if (!sourceUri) {
      return;
    }

    try {
      const sourceStat = await vscode.workspace.fs.stat(sourceUri);
      if (sourceStat.size > MAX_IMAGE_BYTES) {
        await this.rejectImageForSession(session, this.formatImageRejection('tooLarge'));
        return;
      }
      const bytes = await vscode.workspace.fs.readFile(sourceUri);
      await this.insertImageForSession(session, {
        kind: 'command',
        name: path.posix.basename(sourceUri.path),
        bytes,
      });
    } catch (error) {
      this.logger.error(t('Image insertion failed.'), error);
      await this.rejectImageForSession(session, t('Could not add image. Please retry.'));
    }
  }

  async notifyConfigurationChanged(): Promise<void> {
    for (const session of this.sessions.values()) {
      if (!session.ready) {
        continue;
      }
      const settings = this.getSessionSettings(session.document.uri);
      await this.postMessage(session.panel.webview, {
        type: 'host.settingsChanged',
        payload: settings,
      });
    }
  }

  private async handleViewMessage(sessionId: string, message: ViewToHostMessage): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    switch (message.type) {
      case 'view.requestPicker': {
        const { requestId, kind, current } = message.payload;
        const items: (vscode.QuickPickItem & { command: PickerCommand })[] =
          kind === 'blockStyle'
            ? [
                { label: t('Heading 1'), command: 'setHeading1' as const, level: 1 },
                { label: t('Heading 2'), command: 'setHeading2' as const, level: 2 },
                { label: t('Heading 3'), command: 'setHeading3' as const, level: 3 },
                { label: t('Paragraph'), command: 'setParagraph' as const, level: 0 },
              ].map((item) => ({
                ...item,
                description: current === item.level ? t('Current') : undefined,
              }))
            : [
                { label: t('Add Row'), command: 'addTableRow' as const },
                { label: t('Add Column'), command: 'addTableColumn' as const },
              ];
        let placeholder = t(kind === 'blockStyle' ? 'Block style' : 'Add to table');
        if (kind === 'blockStyle' && current !== undefined)
          placeholder = t('Block style: {0}', current === 0 ? t('Paragraph') : 'H' + current);
        const selected = await vscode.window.showQuickPick(items, { placeHolder: placeholder });
        await this.postMessage(session.panel.webview, {
          type: 'host.pickerResult',
          payload: { requestId, command: selected?.command },
        });
        return;
      }
      case 'view.tableDraft': {
        const { key, markdown } = message.payload;
        if (markdown === undefined) session.tableDrafts.delete(key);
        else session.tableDrafts.set(key, markdown);
        return;
      }
      case 'view.flushComplete': {
        session.pendingFlushes.get(message.payload.requestId)?.(message.payload.ok);
        return;
      }
      case 'view.imageInsertResult': {
        const pending = this.pendingImageInsertions.get(message.payload.requestId);
        if (pending?.session !== session) return;
        this.pendingImageInsertions.delete(message.payload.requestId);
        if (!message.payload.ok) await this.removeRejectedImage(pending);
        return;
      }
      case 'view.draft': {
        session.draft = message.payload;
        return;
      }
      case 'view.recoverDraft': {
        await this.recoverDraft(session, message.payload.markdown);
        return;
      }
      case 'view.openLink': {
        await this.openDocumentLink(session, message.payload.href);
        return;
      }
      case 'view.ready': {
        session.ready = true;
        const settings = this.getSessionSettings(session.document.uri);
        await this.postMessage(session.panel.webview, {
          type: 'host.init',
          payload: {
            ...this.getHostMarkdownPayload(session),
            fileName: getDocumentFileName(session.document),
            ...settings,
          },
        });
        for (const command of session.pendingCommands.splice(0)) {
          await this.postMessage(session.panel.webview, {
            type: 'host.executeCommand',
            payload: { command },
          });
        }
        const anchor = this.pendingAnchors.get(session.document.uri.toString());
        if (anchor) {
          this.pendingAnchors.delete(session.document.uri.toString());
          await this.postMessage(session.panel.webview, {
            type: 'host.revealAnchor',
            payload: { anchor },
          });
        }
        return;
      }
      case 'view.executeCommand': {
        if (message.payload.command === 'openRawMarkdown')
          await this.openRawMarkdown(session.document.uri);
        if (message.payload.command === 'save' && (await this.flushSession(session)))
          await session.document.save();
        if (message.payload.command === 'insertImage') await this.insertImageInActiveEditor();
        if (message.payload.command === 'insertFileLink') await this.insertFileLinkInActiveEditor();
        if (message.payload.command === 'goToHeading') await this.goToHeadingInActiveEditor();
        return;
      }
      case 'view.requestLinkInput': {
        await this.requestLinkInputForSession(session, message.payload.selectedText);
        return;
      }
      case 'view.requestImageInsert': {
        await this.handleRequestedImageInsert(session, message.payload);
        return;
      }
      case 'view.applyDocument': {
        session.applyQueue = session.applyQueue
          .then(async () => {
            session.applyingText = message.payload.markdown;
            let ok = false;
            try {
              const result = await session.sync.applyDocument(
                message.payload.markdown,
                message.payload.revision,
              );
              ok = result.ok;
              if (ok) session.lastAppliedText = message.payload.markdown;
            } catch (error: unknown) {
              this.logger.error(t('Could not synchronize the document.'), error);
            } finally {
              session.applyingText = undefined;
            }
            await this.postMessage(session.panel.webview, {
              type: 'host.applyResult',
              payload: {
                ...this.getHostMarkdownPayload(session),
                operationId: message.payload.operationId,
                ok,
              },
            });
          })
          .catch((error: unknown) => {
            this.logger.error(t('Could not synchronize the document.'), error);
          });
        await session.applyQueue;
        return;
      }
      default: {
        return;
      }
    }
  }

  private async requestLinkInputForSession(
    session: EditorSession,
    selectedText?: string,
  ): Promise<void> {
    const trimmedSelectedText = selectedText?.trim();
    const href = await vscode.window.showInputBox({
      title: t('Insert Link'),
      placeHolder: t('https://example.com or /relative/path'),
      prompt:
        trimmedSelectedText && trimmedSelectedText.length > 0
          ? t('Enter the link destination for "{0}".', trimmedSelectedText)
          : t('Enter the link destination.'),
      ignoreFocusOut: true,
      validateInput: (value) => {
        const trimmed = value.trim();
        if (trimmed.length === 0) {
          return t('Link URL is required.');
        }
        if (/\s/.test(trimmed)) {
          return t('Link URL cannot contain spaces.');
        }
        return;
      },
    });

    if (!href) {
      await this.postMessage(session.panel.webview, { type: 'host.linkInputCanceled' });
      return;
    }

    await this.postMessage(session.panel.webview, {
      type: 'host.insertLink',
      payload: {
        href: href.trim(),
        text: trimmedSelectedText,
      },
    });
  }

  private getSessionSettings(resource: vscode.Uri): SessionSettings {
    return {
      mermaidEnabled: isMermaidIntegrationActive(this.configService, resource),
      toolbarMode: this.configService.getToolbarMode(resource),
      contentWidth: this.configService.getContentWidth(resource),
    };
  }

  private handleDocumentChanged(event: vscode.TextDocumentChangeEvent): void {
    const uriKey = event.document.uri.toString();
    const session = this.sessionsByUri.get(uriKey);
    if (!session) return;
    const snapshot = session.sync.handleDocumentChanged(event);
    if (!snapshot || !session.ready || snapshot.markdown === session.applyingText) return;
    void this.postMessage(session.panel.webview, {
      type: 'host.documentChanged',
      payload: this.withImageSources(snapshot, session),
    });
  }

  private disposeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }
    session.ready = false;
    for (const finish of session.pendingFlushes.values()) finish(false);
    void session.applyQueue
      .then(async () => {
        await this.preserveTableDrafts(session);
        const draft = session.draft;
        const snapshot = session.sync.getSnapshot();
        if (!draft || draft.markdown === snapshot.markdown) return;
        const merged =
          snapshot.markdown === session.lastAppliedText
            ? draft.markdown
            : mergeIndependentChanges(draft.baseMarkdown, draft.markdown, snapshot.markdown);
        const result =
          merged === undefined
            ? undefined
            : await session.sync.applyDocument(merged, snapshot.revision);
        if (!result?.ok) {
          await this.recoverDraft(session, draft.markdown);
        }
      })
      .catch((error: unknown) =>
        this.logger.error(t('Could not preserve the closing editor draft.'), error),
      );
    for (const disposable of session.disposables) {
      disposable.dispose();
    }
    this.sessions.delete(sessionId);
    for (const [requestId, pending] of this.pendingImageInsertions) {
      if (pending.session === session) this.pendingImageInsertions.delete(requestId);
    }

    const uriKey = session.document.uri.toString();
    if (this.sessionsByUri.get(uriKey) === session) this.sessionsByUri.delete(uriKey);
  }

  private async openRawMarkdown(uri: vscode.Uri): Promise<void> {
    const session = this.getFirstSessionForUri(uri);
    if (session) {
      if (!(await this.flushSession(session))) return;
      await this.preserveTableDrafts(session);
    }
    try {
      await vscode.commands.executeCommand('vscode.openWith', uri, 'default', {
        preview: false,
      });
      return;
    } catch {
      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document, {
        preview: false,
        preserveFocus: false,
      });
    }
  }

  private async preserveTableDrafts(session: EditorSession): Promise<void> {
    for (const [key, markdown] of session.tableDrafts) {
      const copy = await vscode.workspace.openTextDocument({
        language: 'markdown',
        content: markdown,
      });
      await vscode.window.showTextDocument(copy, { preview: false, preserveFocus: true });
      if (session.tableDrafts.get(key) === markdown) session.tableDrafts.delete(key);
      void vscode.window.showWarningMessage(
        t('Unapplied table source was preserved in a separate unsaved Markdown document.'),
      );
    }
  }

  private flushSession(session: EditorSession): Promise<boolean> {
    if (!session.ready) return Promise.resolve(true);
    const requestId = this.nextFlushId++;
    return new Promise((resolve) => {
      const finish = (ok: boolean): void => {
        if (!session.pendingFlushes.has(requestId)) return;
        clearTimeout(timer);
        session.pendingFlushes.delete(requestId);
        if (!ok && session.ready)
          void vscode.window.showWarningMessage(
            t('Edits are still synchronizing. Retry once synchronization finishes.'),
          );
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false), 1200);
      session.pendingFlushes.set(requestId, finish);
      void this.postMessage(session.panel.webview, {
        type: 'host.requestFlush',
        payload: { requestId },
      }).then(
        (sent) => {
          if (!sent) finish(false);
        },
        (error: unknown) => {
          this.logger.error(t('Could not synchronize the document.'), error);
          finish(false);
        },
      );
    });
  }

  private async recoverDraft(session: EditorSession, markdown: string): Promise<void> {
    if (session.recovering) return;
    session.recovering = true;
    try {
      const copy = await vscode.workspace.openTextDocument({
        language: 'markdown',
        content: markdown,
      });
      await vscode.window.showTextDocument(copy, { preview: false });
      session.draft = undefined;
      await vscode.window.showWarningMessage(
        t(
          'The document changed elsewhere. Your edits are preserved in a separate unsaved Markdown document.',
        ),
      );
      if (session.ready)
        await this.postMessage(session.panel.webview, {
          type: 'host.draftRecovered',
          payload: session.sync.getSnapshot(),
        });
    } finally {
      session.recovering = false;
    }
  }

  private async openDocumentLink(session: EditorSession, href: string): Promise<void> {
    try {
      if (/^(?:https?:|mailto:)/i.test(href)) {
        await vscode.env.openExternal(vscode.Uri.parse(href));
        return;
      }
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) return;
      const [relativePath, fragment] = href.split('#');
      if (!relativePath) return;
      const target = vscode.Uri.joinPath(
        session.document.uri,
        '..',
        decodeURIComponent(relativePath),
      );
      await vscode.workspace.fs.stat(target);
      if (!(await this.flushSession(session))) return;
      const anchor = fragment ? decodeURIComponent(fragment) : undefined;
      if (anchor) this.pendingAnchors.set(target.toString(), anchor);
      await vscode.commands.executeCommand('vscode.open', target);
      const targetSession = this.getFirstSessionForUri(target);
      if (anchor && targetSession?.ready) {
        this.pendingAnchors.delete(target.toString());
        await this.postMessage(targetSession.panel.webview, {
          type: 'host.revealAnchor',
          payload: { anchor },
        });
      }
    } catch {
      this.logger.warn(t('Could not open the link.'));
      await vscode.window.showWarningMessage(t('Could not open the link.'));
    }
  }

  async insertFileLinkInActiveEditor(): Promise<void> {
    const session = this.getActiveSession();
    if (!session?.ready) return;
    const selected = await vscode.window.showOpenDialog({
      title: t('Link to a File'),
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      defaultUri: vscode.Uri.joinPath(session.document.uri, '..'),
    });
    if (!selected?.[0]) {
      await this.postMessage(session.panel.webview, { type: 'host.linkInputCanceled' });
      return;
    }
    const target = selected[0];
    await this.postMessage(session.panel.webview, {
      type: 'host.insertLink',
      payload: {
        href: getMarkdownImagePath(session.document.uri, target),
        text: path.posix.basename(target.path),
      },
    });
  }

  async goToHeadingInActiveEditor(): Promise<void> {
    const session = this.getActiveSession();
    if (!session?.ready || !(await this.flushSession(session))) return;
    const tokens = markdownItParser.parse(session.document.getText(), {});
    const headings: Array<vscode.QuickPickItem & { index: number }> = [];
    for (let index = 0; index < tokens.length; index++) {
      if (tokens[index].type !== 'heading_open') continue;
      headings.push({
        label: tokens[index + 1]?.content ?? '',
        description: tokens[index].tag.toUpperCase(),
        index: headings.length,
      });
    }
    const selected = await vscode.window.showQuickPick(headings, {
      placeHolder: t('Go to a heading in this document'),
    });
    if (selected)
      await this.postMessage(session.panel.webview, {
        type: 'host.revealHeading',
        payload: { index: selected.index },
      });
  }

  private getActiveCustomEditorUri(): vscode.Uri | undefined {
    const activeTab = vscode.window.tabGroups.activeTabGroup?.activeTab;
    if (!activeTab) {
      return undefined;
    }
    const input = activeTab.input;
    if (!(input instanceof vscode.TabInputCustom)) {
      return undefined;
    }
    if (input.viewType !== MUNINN_MARKDOWN_EDITOR_VIEW_TYPE) {
      return undefined;
    }
    return input.uri;
  }

  private getActiveSession(): EditorSession | undefined {
    const uri = this.getActiveCustomEditorUri();
    if (!uri) {
      return undefined;
    }
    return this.getFirstSessionForUri(uri);
  }

  private getFirstSessionForUri(uri: vscode.Uri): EditorSession | undefined {
    return this.sessionsByUri.get(uri.toString());
  }

  private async postMessage(webview: vscode.Webview, message: HostToViewMessage): Promise<boolean> {
    const sent = await webview.postMessage(message);
    if (!sent) {
      this.logger.warn('Failed to post message to Muninn webview editor.');
    }
    return sent;
  }

  private async handleRequestedImageInsert(
    session: EditorSession,
    payload: Extract<ViewToHostMessage, { type: 'view.requestImageInsert' }>['payload'],
  ): Promise<void> {
    let bytes: Uint8Array;
    if (payload.bytesBase64.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) {
      await this.rejectImageForSession(session, this.formatImageRejection('tooLarge'));
      return;
    }
    if (
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payload.bytesBase64)
    ) {
      await this.rejectImageForSession(session, t('Could not read image data.'));
      return;
    }
    try {
      bytes = Buffer.from(payload.bytesBase64, 'base64');
    } catch {
      await this.rejectImageForSession(session, t('Could not read image data.'));
      return;
    }

    await this.insertImageForSession(session, {
      kind: payload.kind,
      name: payload.name,
      mime: payload.mime,
      bytes,
    });
  }

  private async insertImageForSession(
    session: EditorSession,
    input: ImageSourceInput,
  ): Promise<void> {
    const validation = validateImageAsset({
      byteLength: input.bytes.byteLength,
      name: input.name,
      mime: input.mime,
    });
    if (!validation.ok) {
      await this.rejectImageForSession(session, this.formatImageRejection(validation.reason));
      return;
    }

    const destinationDirectory = getImageDestinationDirectory(
      session.document.uri,
      this.configService.getImageDestination(session.document.uri),
    );
    const requestedFileName =
      input.kind === 'paste'
        ? formatPasteImageFileName(new Date(), validation.extension)
        : sanitizeImageFileName(input.name ?? 'image', validation.extension);

    let imageUri: vscode.Uri | undefined;
    let markdownPath: string | undefined;
    let requestId: number | undefined;
    try {
      await vscode.workspace.fs.createDirectory(destinationDirectory);
      imageUri = await this.getAvailableImageUri(destinationDirectory, requestedFileName);
      markdownPath = getMarkdownImagePath(session.document.uri, imageUri);
      await vscode.workspace.fs.writeFile(imageUri, input.bytes);
      requestId = this.nextImageInsertId++;
      this.pendingImageInsertions.set(requestId, {
        session,
        uri: imageUri,
        markdownPath,
        bytes: input.bytes,
      });
      const sent = await this.postMessage(session.panel.webview, {
        type: 'host.imageInserted',
        payload: {
          requestId,
          path: markdownPath,
          webviewUri: session.panel.webview.asWebviewUri(imageUri).toString(),
          filename: path.posix.basename(imageUri.path),
        },
      });
      if (!sent) throw new Error('Image insertion message was not delivered to the webview.');
    } catch (error) {
      if (requestId !== undefined) {
        const pending = this.pendingImageInsertions.get(requestId);
        if (pending) {
          this.pendingImageInsertions.delete(requestId);
          await this.removeRejectedImage(pending);
        }
      } else if (imageUri && markdownPath) {
        await this.removeRejectedImage({
          session,
          uri: imageUri,
          markdownPath,
          bytes: input.bytes,
        });
      }
      this.logger.error(t('Image insertion failed.'), error);
      await this.rejectImageForSession(session, t('Could not add image. Please retry.'));
    }
  }

  private async removeRejectedImage(pending: PendingImageInsert): Promise<void> {
    if (pending.session.document.getText().includes(pending.markdownPath)) return;
    try {
      const stored = await vscode.workspace.fs.readFile(pending.uri);
      if (Buffer.from(stored).equals(Buffer.from(pending.bytes))) {
        await vscode.workspace.fs.delete(pending.uri);
      }
    } catch (error: unknown) {
      this.logger.warn(`Could not remove rejected image: ${String(error)}`);
    }
  }

  private async getAvailableImageUri(
    directory: vscode.Uri,
    requestedFileName: string,
  ): Promise<vscode.Uri> {
    let suffix = 0;
    while (true) {
      const fileName =
        suffix === 0 ? requestedFileName : appendDeduplicationSuffix(requestedFileName, suffix);
      const candidate = vscode.Uri.joinPath(directory, fileName);
      try {
        await vscode.workspace.fs.stat(candidate);
        suffix += 1;
      } catch (error: unknown) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'FileNotFound')
          return candidate;
        throw error;
      }
    }
  }

  private async rejectImageForSession(session: EditorSession, reason: string): Promise<void> {
    await this.postMessage(session.panel.webview, {
      type: 'host.imageRejected',
      payload: { reason },
    });
  }

  private formatImageRejection(reason: ImageValidationFailure): string {
    if (reason === 'tooLarge') {
      return t('Images must be 10 MB or smaller.');
    }
    if (reason === 'empty') {
      return t('Image data is empty.');
    }
    return t('Unsupported image type. Use PNG, JPG, JPEG, GIF, SVG, or WEBP.');
  }

  private getLocalResourceRoots(documentUri: vscode.Uri): vscode.Uri[] {
    return [
      vscode.Uri.joinPath(this.extensionUri, 'media'),
      vscode.Uri.joinPath(documentUri, '..'),
    ];
  }

  private getHostMarkdownPayload(session: EditorSession): HostMarkdownPayload {
    return this.withImageSources(session.sync.getSnapshot(), session);
  }

  private withImageSources(
    payload: SerializedMarkdownPayload,
    session: EditorSession,
  ): HostMarkdownPayload {
    const sources = collectMarkdownImageSources(payload.markdown);
    if (
      !session.imageCache ||
      JSON.stringify(sources) !== JSON.stringify(session.imageCache.sources)
    ) {
      session.imageCache = {
        sources,
        map: this.createImageUriMap(sources, session.document.uri, session.panel.webview),
      };
      const resourceRoots = this.getLocalResourceRoots(session.document.uri);
      for (const source of sources) {
        const uri = resolveMarkdownImageUri(session.document.uri, source);
        if (uri) resourceRoots.push(vscode.Uri.joinPath(uri, '..'));
      }
      session.panel.webview.options = {
        ...session.panel.webview.options,
        localResourceRoots: resourceRoots,
      };
    }
    return { ...payload, imageSources: session.imageCache.map };
  }

  private createImageUriMap(
    sources: string[],
    documentUri: vscode.Uri,
    webview: vscode.Webview,
  ): ImageUriMap {
    const imageSources: ImageUriMap = {};
    for (const source of sources) {
      const imageUri = resolveMarkdownImageUri(documentUri, source);
      if (!imageUri) {
        continue;
      }
      imageSources[source] = webview.asWebviewUri(imageUri).toString();
    }
    return imageSources;
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'generated', 'editor-webview.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'generated', 'editor-webview.css'),
    );
    const nonce = createNonce();
    const localizedWebviewStrings = serializeForInlineScript(getLocalizedWebviewStrings());

    return `<!DOCTYPE html>
<html lang="${vscode.env.language.replaceAll(/[^a-zA-Z0-9-]/g, '')}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' 'strict-dynamic';"
  />
  <link rel="stylesheet" href="${styleUri}" />
  <title>Muninn</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}">
    window.__MUNINN_WEBVIEW_STRINGS__ = ${localizedWebviewStrings};
  </script>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

const createNonce = (): string => randomBytes(16).toString('hex');

const getDocumentFileName = (document: vscode.TextDocument): string =>
  path.posix.basename(document.uri.path).trim();

const collectMarkdownImageSources = (markdown: string): string[] => {
  if (!markdown.includes('![')) return [];
  const sources = new Set<string>();
  for (const token of markdownItParser.parse(markdown, {})) {
    const children = token.children ?? [];
    for (const child of children) {
      if (child.type !== 'image') {
        continue;
      }
      const source = child.attrGet('src');
      if (source) {
        sources.add(source);
      }
    }
  }
  return [...sources];
};
