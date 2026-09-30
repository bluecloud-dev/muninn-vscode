// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import {
  isHostToViewMessage,
  type HostToViewMessage,
  type ViewEditorCommand,
} from '../../custom-editor/protocol';

type Payload<T extends HostToViewMessage['type']> =
  Extract<HostToViewMessage, { type: T }> extends { payload: infer P } ? P : never;
type HostMessageHandlers = {
  onRevealAnchor: (payload: { anchor: string }) => void;
  onInit: (payload: Payload<'host.init'>) => void;
  onDocumentChanged: (payload: Payload<'host.documentChanged'>) => void;
  onApplyResult: (payload: Payload<'host.applyResult'>) => void;
  onRequestFlush: (payload: Payload<'host.requestFlush'>) => void;
  onDraftRecovered: (payload: Payload<'host.draftRecovered'>) => void;
  onLinkInputCanceled: () => void;
  onRevealHeading: (payload: Payload<'host.revealHeading'>) => void;
  onExecuteCommand: (command: ViewEditorCommand) => void;
  onSettingsChanged: (payload: Payload<'host.settingsChanged'>) => void;
  onInsertLink: (payload: Payload<'host.insertLink'>) => void;
  onImageInserted: (payload: Payload<'host.imageInserted'>) => void;
  onImageRejected: (payload: Payload<'host.imageRejected'>) => void;
  onError: (payload: Payload<'host.error'>) => void;
};

export const dispatchHostMessage = (
  message: HostToViewMessage,
  handlers: HostMessageHandlers,
): void => {
  switch (message.type) {
    case 'host.revealAnchor': {
      handlers.onRevealAnchor(message.payload);
      break;
    }
    case 'host.init': {
      handlers.onInit(message.payload);
      return;
    }
    case 'host.documentChanged': {
      handlers.onDocumentChanged(message.payload);
      return;
    }
    case 'host.applyResult': {
      handlers.onApplyResult(message.payload);
      return;
    }
    case 'host.requestFlush': {
      handlers.onRequestFlush(message.payload);
      return;
    }
    case 'host.draftRecovered': {
      handlers.onDraftRecovered(message.payload);
      return;
    }
    case 'host.linkInputCanceled': {
      handlers.onLinkInputCanceled();
      return;
    }
    case 'host.revealHeading': {
      handlers.onRevealHeading(message.payload);
      return;
    }
    case 'host.executeCommand': {
      handlers.onExecuteCommand(message.payload.command);
      return;
    }
    case 'host.settingsChanged': {
      handlers.onSettingsChanged(message.payload);
      return;
    }
    case 'host.insertLink': {
      handlers.onInsertLink(message.payload);
      return;
    }
    case 'host.imageInserted': {
      handlers.onImageInserted(message.payload);
      return;
    }
    case 'host.imageRejected': {
      handlers.onImageRejected(message.payload);
      return;
    }
    case 'host.error': {
      handlers.onError(message.payload);
      return;
    }
  }
};

export const attachHostMessageListener = (handlers: HostMessageHandlers): (() => void) => {
  const listener = (event: MessageEvent<unknown>): void => {
    if (isHostToViewMessage(event.data)) dispatchHostMessage(event.data, handlers);
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
};
