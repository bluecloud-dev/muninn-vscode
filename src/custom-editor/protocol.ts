// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { ContentWidthSetting } from '../types/config';

export type DocumentRevision = number;
export type ToolbarMode = 'basic' | 'advanced';
export type ImageInsertKind = 'paste' | 'drop';
export type ImageUriMap = Record<string, string>;

export type ViewEditorCommand =
  | 'undo'
  | 'redo'
  | 'toggleTask'
  | 'toggleStrike'
  | 'toggleBold'
  | 'toggleItalic'
  | 'setHeading1'
  | 'setHeading2'
  | 'setHeading3'
  | 'setParagraph'
  | 'toggleBulletList'
  | 'toggleNumberedList'
  | 'insertLink'
  | 'insertMermaidBlock'
  | 'insertTable'
  | 'insertCodeBlock'
  | 'addTableRow'
  | 'addTableColumn';

export type PickerCommand = Extract<
  ViewEditorCommand,
  'setParagraph' | 'setHeading1' | 'setHeading2' | 'setHeading3' | 'addTableRow' | 'addTableColumn'
>;

export type HostToViewMessage =
  | { type: 'host.pickerResult'; payload: { requestId: number; command?: PickerCommand } }
  | { type: 'host.revealAnchor'; payload: { anchor: string } }
  | {
      type: 'host.applyResult';
      payload: SerializedMarkdownPayload & {
        operationId: number;
        ok: boolean;
        imageSources: ImageUriMap;
      };
    }
  | { type: 'host.requestFlush'; payload: { requestId: number } }
  | { type: 'host.linkInputCanceled' }
  | { type: 'host.draftRecovered'; payload: SerializedMarkdownPayload }
  | { type: 'host.revealHeading'; payload: { index: number } }
  | {
      type: 'host.init';
      payload: SerializedMarkdownPayload & {
        fileName: string;
        mermaidEnabled: boolean;
        toolbarMode: ToolbarMode;
        contentWidth: ContentWidthSetting;
        imageSources: ImageUriMap;
      };
    }
  | {
      type: 'host.documentChanged';
      payload: SerializedMarkdownPayload & {
        imageSources: ImageUriMap;
      };
    }
  | {
      type: 'host.executeCommand';
      payload: {
        command: ViewEditorCommand;
      };
    }
  | {
      type: 'host.settingsChanged';
      payload: {
        mermaidEnabled: boolean;
        toolbarMode: ToolbarMode;
        contentWidth: ContentWidthSetting;
      };
    }
  | {
      type: 'host.insertLink';
      payload: {
        href: string;
        text?: string;
      };
    }
  | {
      type: 'host.imageInserted';
      payload: {
        requestId: number;
        path: string;
        webviewUri: string;
        filename: string;
      };
    }
  | {
      type: 'host.imageRejected';
      payload: {
        reason: string;
      };
    }
  | {
      type: 'host.error';
      payload: {
        code: 'revision_mismatch' | 'apply_failed';
        message: string;
      };
    };

export type ViewToHostMessage =
  | {
      type: 'view.requestPicker';
      payload: { requestId: number; kind: 'blockStyle' | 'tableAdd'; current?: number };
    }
  | { type: 'view.tableDraft'; payload: { key: string; markdown?: string } }
  | {
      type: 'view.ready';
    }
  | {
      type: 'view.applyDocument';
      payload: SerializedMarkdownPayload & { operationId: number };
    }
  | {
      type: 'view.executeCommand';
      payload: {
        command: 'openRawMarkdown' | 'save' | 'insertImage' | 'insertFileLink' | 'goToHeading';
      };
    }
  | {
      type: 'view.requestLinkInput';
      payload: {
        selectedText?: string;
      };
    }
  | {
      type: 'view.requestImageInsert';
      payload: {
        kind: ImageInsertKind;
        name?: string;
        mime?: string;
        bytesBase64: string;
      };
    }
  | { type: 'view.imageInsertResult'; payload: { requestId: number; ok: boolean } }
  | { type: 'view.flushComplete'; payload: { requestId: number; ok: boolean } }
  | { type: 'view.draft'; payload: { markdown: string; baseMarkdown: string } }
  | { type: 'view.recoverDraft'; payload: { markdown: string } }
  | { type: 'view.openLink'; payload: { href: string } };

export type SerializedMarkdownPayload = {
  markdown: string;
  revision: DocumentRevision;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isString = (value: unknown): value is string => typeof value === 'string';
const isRevision = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isImageUriMap = (value: unknown): value is ImageUriMap => {
  if (!isObject(value)) {
    return false;
  }

  return Object.entries(value).every(([key, mapValue]) => isString(key) && isString(mapValue));
};

const isSerializedMarkdownPayload = (value: unknown): value is SerializedMarkdownPayload => {
  if (!isObject(value)) {
    return false;
  }

  return isString(value.markdown) && isRevision(value.revision);
};

const isViewEditorCommand = (value: unknown): value is ViewEditorCommand =>
  // Explicit comparisons preserve this security-sensitive type guard without allocating a list per message.
  // eslint-disable-next-line unicorn/prefer-includes-over-repeated-comparisons
  value === 'undo' ||
  value === 'redo' ||
  value === 'toggleTask' ||
  value === 'toggleStrike' ||
  value === 'toggleBold' ||
  value === 'toggleItalic' ||
  value === 'setHeading1' ||
  value === 'setHeading2' ||
  value === 'setHeading3' ||
  value === 'setParagraph' ||
  value === 'toggleBulletList' ||
  value === 'toggleNumberedList' ||
  value === 'insertLink' ||
  value === 'insertMermaidBlock' ||
  value === 'insertTable' ||
  value === 'insertCodeBlock' ||
  value === 'addTableRow' ||
  value === 'addTableColumn';

const isPickerCommand = (value: unknown): value is PickerCommand =>
  [
    'setParagraph',
    'setHeading1',
    'setHeading2',
    'setHeading3',
    'addTableRow',
    'addTableColumn',
  ].includes(value as string);

const isToolbarMode = (value: unknown): value is ToolbarMode =>
  value === 'basic' || value === 'advanced';

const isContentWidthSetting = (value: unknown): value is ContentWidthSetting =>
  value === 'comfortable' ||
  value === 'full' ||
  (typeof value === 'number' && Number.isFinite(value) && value >= 40 && value <= 120);

export const isViewToHostMessage = (value: unknown): value is ViewToHostMessage => {
  if (!isObject(value) || !isString(value.type)) {
    return false;
  }

  if (value.type === 'view.requestPicker')
    return (
      isObject(value.payload) &&
      isRevision(value.payload.requestId) &&
      (value.payload.kind === 'blockStyle' || value.payload.kind === 'tableAdd') &&
      (value.payload.current === undefined ||
        (isRevision(value.payload.current) && value.payload.current <= 6))
    );

  if (value.type === 'view.tableDraft')
    return (
      isObject(value.payload) &&
      isString(value.payload.key) &&
      (value.payload.markdown === undefined || isString(value.payload.markdown))
    );

  if (value.type === 'view.ready') {
    return true;
  }

  if (value.type === 'view.applyDocument') {
    return (
      isObject(value.payload) &&
      isRevision(value.payload.operationId) &&
      isSerializedMarkdownPayload(value.payload)
    );
  }

  if (value.type === 'view.flushComplete')
    return (
      isObject(value.payload) &&
      isRevision(value.payload.requestId) &&
      typeof value.payload.ok === 'boolean'
    );
  if (value.type === 'view.draft')
    return (
      isObject(value.payload) &&
      isString(value.payload.markdown) &&
      isString(value.payload.baseMarkdown)
    );
  if (value.type === 'view.recoverDraft')
    return isObject(value.payload) && isString(value.payload.markdown);
  if (value.type === 'view.openLink')
    return isObject(value.payload) && isString(value.payload.href);

  if (value.type === 'view.executeCommand') {
    return (
      isObject(value.payload) &&
      ['openRawMarkdown', 'save', 'insertImage', 'insertFileLink', 'goToHeading'].includes(
        value.payload.command as string,
      )
    );
  }

  if (value.type === 'view.requestLinkInput') {
    return (
      isObject(value.payload) &&
      (value.payload.selectedText === undefined || isString(value.payload.selectedText))
    );
  }

  if (value.type === 'view.requestImageInsert') {
    return (
      isObject(value.payload) &&
      (value.payload.kind === 'paste' || value.payload.kind === 'drop') &&
      (value.payload.name === undefined || isString(value.payload.name)) &&
      (value.payload.mime === undefined || isString(value.payload.mime)) &&
      isString(value.payload.bytesBase64)
    );
  }

  if (value.type === 'view.imageInsertResult')
    return (
      isObject(value.payload) &&
      isRevision(value.payload.requestId) &&
      typeof value.payload.ok === 'boolean'
    );

  return false;
};

export const isHostToViewMessage = (value: unknown): value is HostToViewMessage => {
  if (!isObject(value) || !isString(value.type)) {
    return false;
  }

  if (value.type === 'host.pickerResult')
    return (
      isObject(value.payload) &&
      isRevision(value.payload.requestId) &&
      (value.payload.command === undefined || isPickerCommand(value.payload.command))
    );

  if (value.type === 'host.revealAnchor')
    return isObject(value.payload) && isString(value.payload.anchor);
  if (value.type === 'host.linkInputCanceled') return true;
  if (value.type === 'host.requestFlush')
    return isObject(value.payload) && isRevision(value.payload.requestId);
  if (value.type === 'host.revealHeading')
    return isObject(value.payload) && isRevision(value.payload.index);
  if (value.type === 'host.draftRecovered') return isSerializedMarkdownPayload(value.payload);
  if (value.type === 'host.applyResult')
    return (
      isObject(value.payload) &&
      isRevision(value.payload.operationId) &&
      typeof value.payload.ok === 'boolean' &&
      isImageUriMap(value.payload.imageSources) &&
      isSerializedMarkdownPayload(value.payload)
    );

  if (value.type === 'host.init') {
    const payload = value.payload;
    return (
      isObject(payload) &&
      isString(payload.fileName) &&
      typeof payload.mermaidEnabled === 'boolean' &&
      isToolbarMode(payload.toolbarMode) &&
      isContentWidthSetting(payload.contentWidth) &&
      isImageUriMap(payload.imageSources) &&
      isSerializedMarkdownPayload(payload)
    );
  }

  if (value.type === 'host.documentChanged') {
    const payload = value.payload;
    return (
      isObject(payload) &&
      isImageUriMap(payload.imageSources) &&
      isSerializedMarkdownPayload(payload)
    );
  }

  if (value.type === 'host.executeCommand') {
    return isObject(value.payload) && isViewEditorCommand(value.payload.command);
  }

  if (value.type === 'host.settingsChanged') {
    return (
      isObject(value.payload) &&
      typeof value.payload.mermaidEnabled === 'boolean' &&
      isToolbarMode(value.payload.toolbarMode) &&
      isContentWidthSetting(value.payload.contentWidth)
    );
  }

  if (value.type === 'host.insertLink') {
    return (
      isObject(value.payload) &&
      isString(value.payload.href) &&
      (value.payload.text === undefined || isString(value.payload.text))
    );
  }

  if (value.type === 'host.imageInserted') {
    return (
      isObject(value.payload) &&
      isRevision(value.payload.requestId) &&
      isString(value.payload.path) &&
      isString(value.payload.webviewUri) &&
      isString(value.payload.filename)
    );
  }

  if (value.type === 'host.imageRejected') {
    return isObject(value.payload) && isString(value.payload.reason);
  }

  if (value.type === 'host.error') {
    return (
      isObject(value.payload) &&
      (value.payload.code === 'revision_mismatch' || value.payload.code === 'apply_failed') &&
      isString(value.payload.message)
    );
  }

  return false;
};
