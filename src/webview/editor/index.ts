// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import '@vscode/codicons/dist/codicon.css';
import './styles.css';
import { baseKeymap, setBlockType, toggleMark } from 'prosemirror-commands';
import { history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import type { Node as ProseMirrorNode, MarkType, NodeType } from 'prosemirror-model';
import { liftListItem, wrapInList } from 'prosemirror-schema-list';
import { type Command, EditorState, Plugin, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import {
  isHostToViewMessage,
  type ToolbarMode,
  type PickerCommand,
  type ViewEditorCommand,
  type ViewToHostMessage,
} from '../../custom-editor/protocol';
import { mergeIndependentChanges } from '../../shared/text-edits';
import { continueList, createDocumentNavigation, toggleTask } from './document-navigation';
import { createAnnouncer } from './announcements';
import { bootstrapEditorApp } from './bootstrap';
import { setIconButton } from './icon-button';
import { applyContentWidth } from './content-width';
import { createImageInsertionTransaction } from './image-insertion';
import { formatString, getString } from './localization';
import {
  parseHostMarkdown,
  schema,
  serializeToHostMarkdown,
  setDocumentSource,
} from './markdown-codec';
import { applyRemoteDocument } from './remote-document';
import { getEditorViewAttributes } from './editor-accessibility';
import { createFrontMatterNodeViewConstructor } from './nodes/front-matter-node-view';
import { createTableNodeViewConstructor } from './nodes/table-node-view';
import { editTable, isTableNode } from './tables/table-edit';
import { setMermaidRenderingEnabled } from './renderers/mermaid-renderer';
import { initializeTableDrafts } from './table-drafts';
import { createCodeBlockNodeViewConstructor } from './nodes/code-block-node-view';
import { HostSyncController } from './sync';
import { DEFAULT_TABLE_SOURCE } from './tables/markdown-table-utilities';
import { attachToolbarRovingFocus } from './toolbar-roving-focus';

declare function acquireVsCodeApi(): {
  postMessage: (message: ViewToHostMessage) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

const vscode = acquireVsCodeApi();
type RetainedState = {
  tableDrafts?: Record<string, string>;
  draft?: { markdown: string; baseMarkdown: string };
  scrollTop?: number;
};
const saved = vscode.getState();
const retained: RetainedState = saved && typeof saved === 'object' ? (saved as RetainedState) : {};
const savedDraft =
  retained.draft &&
  typeof retained.draft.markdown === 'string' &&
  typeof retained.draft.baseMarkdown === 'string'
    ? retained.draft
    : undefined;
const preserveState = (): void => {
  vscode.setState(retained);
};
initializeTableDrafts(retained.tableDrafts, (drafts, key, markdown) => {
  retained.tableDrafts = drafts;
  preserveState();
  vscode.postMessage({ type: 'view.tableDraft', payload: { key, markdown } });
});
let recovering = false;

const ADVANCED_TOOLBAR_COMMANDS = new Set<string>([
  'toggleStrike',
  'toggleTask',
  'insertFileLink',
  'insertCodeBlock',
  'insertMermaidBlock',
]);

const TRANSIENT_ACTIVE_COMMANDS = new Set<string>(['insertLink', 'insertTable', 'insertCodeBlock']);

const COMMAND_LABELS = new Map<string, string>([
  ['toggleBold', getString('commandLabelBold')],
  ['toggleItalic', getString('commandLabelItalic')],
  ['toggleStrike', getString('commandLabelStrike')],
  ['toggleTask', getString('commandLabelTask')],
  ['setHeading1', getString('commandLabelHeading1')],
  ['setHeading2', getString('commandLabelHeading2')],
  ['setHeading3', getString('commandLabelHeading3')],
  ['setParagraph', getString('commandLabelParagraph')],
  ['toggleBulletList', getString('commandLabelBulletList')],
  ['toggleNumberedList', getString('commandLabelNumberedList')],
  ['insertLink', getString('commandLabelLink')],
  ['insertMermaidBlock', getString('commandLabelMermaidDiagram')],
  ['insertTable', getString('commandLabelTable')],
  ['insertCodeBlock', getString('commandLabelCodeBlock')],
  ['addTableRow', getString('commandLabelAddTableRow')],
  ['addTableColumn', getString('commandLabelAddTableColumn')],
  ['openRawMarkdown', getString('commandLabelSourceEditor')],
]);

const formatCommandFailure = (command: string): string => {
  if (
    (command === 'addTableRow' || command === 'addTableColumn') &&
    findSelectedTablePosition() !== undefined
  )
    return getString('statusTableSourceApplyFailed');
  if (command === 'addTableRow') {
    return getString('commandFailureAddRowNoTable');
  }
  if (command === 'addTableColumn') {
    return getString('commandFailureAddColumnNoTable');
  }
  const label = COMMAND_LABELS.get(command) ?? command;
  return formatString(getString('commandFailureGenericTemplate'), label);
};

const { editorContainer, editorShell, toolbar, statusLine, alertLine, toolbarButtons } =
  bootstrapEditorApp();
const moreButton = document.querySelector<HTMLButtonElement>('[data-testid="muninn-toolbar-more"]');
const toolbarRovingFocus = attachToolbarRovingFocus(toolbar);

let view: EditorView | undefined;
let advancedActionsVisible = false;
let lastMermaidInsertAt = 0;
let imageSources = new Map<string, string>();
let documentFileName = '';

const announce = createAnnouncer({ statusLine, alertLine });

const setImageSources = (sources: Record<string, string>): void => {
  imageSources = new Map(Object.entries(sources));
};

const getRenderedImageSource = (source: string): string | undefined => imageSources.get(source);

const updateAdvancedToolbarVisibility = (): void => {
  for (const command of ADVANCED_TOOLBAR_COMMANDS) {
    const button = toolbarButtons.get(command);
    if (!button) {
      continue;
    }
    button.hidden = !advancedActionsVisible;
  }

  if (moreButton) {
    moreButton.hidden = false;
    moreButton.setAttribute('aria-expanded', advancedActionsVisible ? 'true' : 'false');
  }

  toolbarRovingFocus.revalidateCurrentStop(moreButton ?? undefined);
};

const getFirstAdvancedToolbarButton = (): HTMLButtonElement | undefined => {
  for (const command of ADVANCED_TOOLBAR_COMMANDS) {
    const button = toolbarButtons.get(command);
    if (button) {
      return button;
    }
  }
  return undefined;
};

const isFocusedAdvancedToolbarAction = (): boolean => {
  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLButtonElement)) {
    return false;
  }
  const command = activeElement.dataset.command;
  if (!command) {
    return false;
  }
  return ADVANCED_TOOLBAR_COMMANDS.has(command);
};

const setToolbarMode = (mode: ToolbarMode): void => {
  const needsFocusFallback = mode === 'basic' && isFocusedAdvancedToolbarAction();
  advancedActionsVisible = mode === 'advanced';
  updateAdvancedToolbarVisibility();
  if (!needsFocusFallback) {
    return;
  }
  if (moreButton && !moreButton.hidden) {
    moreButton.focus();
    return;
  }
  view?.focus();
};

const serializeMarkdownForHost = (): string => {
  if (!view) {
    return '';
  }

  return serializeToHostMarkdown(view.state.doc);
};

const syncController = new HostSyncController({
  applyRemote: (markdown) => applyHostMarkdown(markdown),
  onConflict: (markdown) => {
    recovering = true;
    view?.setProps({ editable: () => false });
    announce(getString('statusSyncConflict'), { kind: 'error' });
    vscode.postMessage({ type: 'view.recoverDraft', payload: { markdown } });
  },
  onSettled: (markdown) => {
    retained.draft = undefined;
    preserveState();
    vscode.postMessage({ type: 'view.draft', payload: { markdown, baseMarkdown: markdown } });
  },
  postApply: (payload) => {
    vscode.postMessage({
      type: 'view.applyDocument',
      payload,
    });
  },
});

const parseMarkdown = (markdown: string): EditorState =>
  EditorState.create({
    doc: parseHostMarkdown(markdown),
    plugins: [
      createDocumentNavigation((href) =>
        vscode.postMessage({ type: 'view.openLink', payload: { href } }),
      ),
      history(),
      keymap({
        Enter: continueList,
        'Shift-Enter': baseKeymap.Enter,
        'Mod-b': () => executeEditorCommand('toggleBold'),
        'Mod-i': () => executeEditorCommand('toggleItalic'),
        'Mod-z': (state, dispatch) => {
          undo(state, dispatch);
          return true;
        },
        'Mod-Shift-z': (state, dispatch) => {
          redo(state, dispatch);
          return true;
        },
        'Mod-y': (state, dispatch) => {
          redo(state, dispatch);
          return true;
        },
        'Mod-s': () => {
          void requestHostCommand('save');
          return true;
        },
      }),
      keymap(baseKeymap),
      new Plugin({
        props: {
          handlePaste: (_editorView, event) => {
            const file = getFirstImageFile(event.clipboardData?.files);
            if (!file) {
              return false;
            }
            event.preventDefault();
            void requestImageInsert('paste', file);
            return true;
          },
          handleDOMEvents: {
            dragover: (_editorView, event) => {
              if (!hasImageTransfer(event.dataTransfer)) {
                return false;
              }
              event.preventDefault();
              return true;
            },
            drop: (editorView, event) => {
              const file = getFirstImageFile(event.dataTransfer?.files);
              if (!file) {
                return false;
              }
              event.preventDefault();
              const position = editorView.posAtCoords({
                left: event.clientX,
                top: event.clientY,
              });
              if (!position) {
                return true;
              }
              editorView.dispatch(
                editorView.state.tr.setSelection(
                  TextSelection.create(editorView.state.doc, position.pos),
                ),
              );
              editorView.focus();
              void requestImageInsert('drop', file);
              return true;
            },
          },
        },
        view: () => ({
          update: () => {
            updateToolbarState();
          },
        }),
      }),
    ],
  });

const getFirstImageFile = (fileList?: FileList | null): File | undefined => {
  if (!fileList) {
    return undefined;
  }
  return [...fileList].find(
    (file) => file.type.startsWith('image/') || /\.(?:png|jpe?g|gif|svg|webp)$/i.test(file.name),
  );
};

const hasImageTransfer = (dataTransfer?: DataTransfer | null): boolean => {
  if (!dataTransfer) {
    return false;
  }
  if (getFirstImageFile(dataTransfer.files)) {
    return true;
  }
  return [...dataTransfer.items].some(
    (item) => item.kind === 'file' && item.type.startsWith('image/'),
  );
};

const readFileAsBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Expected FileReader data URL result.'));
        return;
      }
      const [, base64 = ''] = reader.result.split(',', 2);
      resolve(base64);
    });
    reader.addEventListener('error', () => {
      reject(reader.error ?? new Error('Could not read image file.'));
    });
    reader.readAsDataURL(file);
  });

const requestImageInsert = async (kind: 'paste' | 'drop', file: File): Promise<void> => {
  try {
    const bytesBase64 = await readFileAsBase64(file);
    vscode.postMessage({
      type: 'view.requestImageInsert',
      payload: {
        kind,
        name: file.name,
        mime: file.type,
        bytesBase64,
      },
    });
  } catch {
    announce(getString('statusInsertImageFailed'), { kind: 'error' });
  }
};

const getWordSelection = (state: EditorState): TextSelection | undefined => {
  if (!state.selection.empty) {
    return undefined;
  }

  const { $from } = state.selection;
  const parent = $from.parent;
  if (!parent.isTextblock) {
    return undefined;
  }

  const text = parent.textContent;
  if (text.length === 0) {
    return undefined;
  }

  const matcher = /[\p{L}\p{N}_]/u;
  let candidateOffset = $from.parentOffset;
  if (candidateOffset >= text.length) {
    candidateOffset = text.length - 1;
  }

  if (!matcher.test(text[candidateOffset] ?? '')) {
    let right = candidateOffset;
    while (right < text.length && !matcher.test(text[right] ?? '')) {
      right += 1;
    }

    if (right < text.length) {
      candidateOffset = right;
    } else {
      let left = candidateOffset - 1;
      while (left >= 0 && !matcher.test(text[left] ?? '')) {
        left -= 1;
      }
      if (left < 0) {
        return undefined;
      }
      candidateOffset = left;
    }
  }

  let start = candidateOffset;
  let end = candidateOffset;
  while (start > 0 && matcher.test(text[start - 1] ?? '')) {
    start -= 1;
  }
  while (end < text.length && matcher.test(text[end] ?? '')) {
    end += 1;
  }

  return TextSelection.create(state.doc, $from.start() + start, $from.start() + end);
};

const withExpandedWordSelection = (): EditorState | undefined => {
  if (!view) {
    return undefined;
  }

  const state = view.state;
  if (!state.selection.empty) {
    return state;
  }

  const wordSelection = getWordSelection(state);
  if (!wordSelection) {
    return state;
  }

  const transaction = state.tr.setSelection(wordSelection);
  view.dispatch(transaction);
  return view.state;
};

const runInlineMarkCommand = (markCommand: Command): boolean => {
  if (!view) {
    return false;
  }

  const state = withExpandedWordSelection();
  if (!state) {
    return false;
  }

  return markCommand(state, view.dispatch, view);
};

const runViewCommand = (command: Command): boolean => {
  if (!view) {
    return false;
  }
  return command(view.state, view.dispatch, view);
};

const getActiveHeadingLevel = (): number | undefined => {
  if (!view) {
    return undefined;
  }

  const { $from } = view.state.selection;
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type === schema.nodes.heading) {
      const level = Number(node.attrs.level);
      return Number.isFinite(level) ? level : 1;
    }
    if (node.type === schema.nodes.paragraph) {
      return undefined;
    }
  }
  return undefined;
};

const isParagraphActive = (): boolean => {
  if (!view) {
    return false;
  }
  const { $from } = view.state.selection;
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    if ($from.node(depth).type === schema.nodes.paragraph) {
      return true;
    }
  }
  return false;
};

const toggleHeadingLevel = (level: 1 | 2 | 3): boolean => {
  const activeLevel = getActiveHeadingLevel();
  if (activeLevel === level) {
    return runViewCommand(setBlockType(schema.nodes.paragraph));
  }
  return runViewCommand(setBlockType(schema.nodes.heading, { level }));
};

const createToggleListCommand = (listType: NodeType): Command => {
  const liftCommand = liftListItem(schema.nodes.list_item);
  const wrapCommand = wrapInList(listType);
  return (state, dispatch, editorView) =>
    liftCommand(state, dispatch, editorView) || wrapCommand(state, dispatch, editorView);
};

const toggleBulletListCommand = createToggleListCommand(schema.nodes.bullet_list);
const toggleNumberedListCommand = createToggleListCommand(schema.nodes.ordered_list);

const findSelectedTablePosition = (): number | undefined => {
  if (!view) {
    return undefined;
  }

  const atSelection = view.state.doc.nodeAt(view.state.selection.from);
  if (atSelection && isTableNode(atSelection)) return view.state.selection.from;
  const { $from } = view.state.selection;
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    const node = $from.node(depth);
    if (!isTableNode(node)) {
      continue;
    }

    return depth === 0 ? 0 : $from.before(depth);
  }

  return undefined;
};

const insertBlockAfterSelection = (node: ProseMirrorNode): void => {
  if (!view) return;
  const selection = view.state.selection;
  const position = selection.$to.depth > 0 ? selection.$to.after(1) : selection.to;
  const tr = view.state.tr.insert(position, node);
  tr.setSelection(TextSelection.near(tr.doc.resolve(position + 1)));
  view.dispatch(tr.scrollIntoView());
};

const insertMermaidBlock = (): boolean => {
  if (!view) {
    return false;
  }

  const now = Date.now();
  if (now - lastMermaidInsertAt < 150) {
    return false;
  }
  lastMermaidInsertAt = now;

  const content = schema.text('graph TD\n  A[Start] --> B[Finish]');
  const node = schema.nodes.code_block.create({ params: 'mermaid' }, content);
  insertBlockAfterSelection(node);
  announce(getString('statusInsertedMermaid'), { kind: 'status' });
  return true;
};

const insertTableBlock = (): boolean => {
  if (!view) {
    return false;
  }

  const node = schema.nodes.table.create({ source: DEFAULT_TABLE_SOURCE });
  insertBlockAfterSelection(node);
  announce(getString('statusInsertedTable'), { kind: 'status' });
  return true;
};

const insertCodeBlock = (): boolean => {
  if (!view) {
    return false;
  }

  const node = schema.nodes.code_block.create();
  insertBlockAfterSelection(node);

  announce(getString('statusInsertedCodeBlock'), { kind: 'status' });
  return true;
};

const requestLinkInput = (): boolean => {
  if (!view) {
    return false;
  }

  const state = withExpandedWordSelection();
  if (!state) {
    return false;
  }

  const { from, to } = state.selection;
  const selectedText = from === to ? undefined : state.doc.textBetween(from, to, ' ');

  vscode.postMessage({
    type: 'view.requestLinkInput',
    payload: {
      selectedText: selectedText?.trim().length ? selectedText.trim() : undefined,
    },
  });
  announce(getString('statusAwaitingLinkInput'), { kind: 'status' });
  return true;
};

const insertLinkFromHost = (href: string, text?: string): boolean => {
  if (!view) {
    return false;
  }

  const linkMark = schema.marks.link.create({ href });
  const state = view.state;
  let transaction = state.tr;
  const from = state.selection.from;
  let to = state.selection.to;

  if (state.selection.empty) {
    const label = text && text.trim().length > 0 ? text.trim() : href;
    transaction = transaction.insertText(label, from, to);
    to = from + label.length;
  }

  transaction = transaction.removeMark(from, to, schema.marks.link).addMark(from, to, linkMark);
  transaction = transaction
    .setSelection(TextSelection.create(transaction.doc, to, to))
    .scrollIntoView();
  view.dispatch(transaction);
  announce(getString('statusInsertedLink'), { kind: 'status' });
  return true;
};

const insertImageFromHost = (source: string, webviewUri: string, filename: string): boolean => {
  if (!view) {
    return false;
  }

  imageSources.set(source, webviewUri);
  const state = view.state;
  const transaction = createImageInsertionTransaction(state, schema.nodes.image, source);
  view.dispatch(transaction);
  if (!view.state.doc.eq(transaction.doc)) {
    imageSources.delete(source);
    return false;
  }
  announce(formatString(getString('statusImageAddedTemplate'), filename), { kind: 'status' });
  return true;
};

const createImageNodeView = (
  node: ProseMirrorNode,
): { dom: HTMLImageElement; update: (nextNode: ProseMirrorNode) => boolean } => {
  const dom = document.createElement('img');
  const updateImage = (imageNode: ProseMirrorNode): void => {
    const source = typeof imageNode.attrs.src === 'string' ? imageNode.attrs.src : '';
    const alt = typeof imageNode.attrs.alt === 'string' ? imageNode.attrs.alt : '';
    const renderedSource = getRenderedImageSource(source);
    if (renderedSource) dom.src = renderedSource;
    else dom.removeAttribute('src');
    dom.alt = alt;
  };
  updateImage(node);

  return {
    dom,
    update: (nextNode) => {
      if (nextNode.type !== node.type) {
        return false;
      }
      updateImage(nextNode);
      return true;
    },
  };
};

let pickerRequestId = 0;
let pendingPicker:
  | {
      requestId: number;
      kind: 'blockStyle' | 'tableAdd';
      state: EditorState;
      tablePosition?: number;
      focusTarget?: HTMLElement;
    }
  | undefined;
const requestPicker = (kind: 'blockStyle' | 'tableAdd', tablePosition?: number): void => {
  if (!view) return;
  const requestId = ++pickerRequestId;
  pendingPicker = {
    requestId,
    kind,
    state: view.state,
    tablePosition,
    focusTarget:
      kind === 'tableAdd' && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined,
  };
  vscode.postMessage({
    type: 'view.requestPicker',
    payload: {
      requestId,
      kind,
      current:
        kind === 'blockStyle'
          ? (getActiveHeadingLevel() ?? (isParagraphActive() ? 0 : undefined))
          : undefined,
    },
  });
};
const applyPickerResult = (requestId: number, command?: PickerCommand): void => {
  const pending = pendingPicker;
  if (!view || !pending || requestId !== pending.requestId) return;
  pendingPicker = undefined;
  if (view.state.doc !== pending.state.doc) {
    announce(getString('pickerStaleMessage'), { kind: 'error' });
    view.focus();
    return;
  }
  view.dispatch(view.state.tr.setSelection(pending.state.selection));
  if (command) {
    let applied = false;
    if (pending.kind === 'blockStyle' && command.startsWith('set')) {
      const level = Number(command.at(-1));
      runViewCommand(
        command === 'setParagraph'
          ? setBlockType(schema.nodes.paragraph)
          : setBlockType(schema.nodes.heading, { level }),
      );
      applied = true;
    } else if (
      pending.kind === 'tableAdd' &&
      pending.tablePosition !== undefined &&
      (command === 'addTableRow' || command === 'addTableColumn')
    ) {
      applied =
        editTable(view, pending.tablePosition, {
          type: command === 'addTableRow' ? 'addRow' : 'addColumn',
        }) !== 'rejected';
    }
    if (!applied) announce(formatCommandFailure(command), { kind: 'error' });
  }
  if (pending.focusTarget?.isConnected) pending.focusTarget.focus();
  else view.focus();
};

const executeEditorCommand = (command: ViewEditorCommand): boolean => {
  if (!view) {
    return false;
  }

  switch (command) {
    case 'undo': {
      return runViewCommand(undo);
    }
    case 'redo': {
      return runViewCommand(redo);
    }
    case 'toggleTask': {
      return runViewCommand(toggleTask);
    }
    case 'toggleStrike': {
      return runInlineMarkCommand(toggleMark(schema.marks.strike));
    }
    case 'toggleBold': {
      return runInlineMarkCommand(toggleMark(schema.marks.strong));
    }
    case 'toggleItalic': {
      return runInlineMarkCommand(toggleMark(schema.marks.em));
    }
    case 'setHeading1': {
      return toggleHeadingLevel(1);
    }
    case 'setHeading2': {
      return toggleHeadingLevel(2);
    }
    case 'setHeading3': {
      return toggleHeadingLevel(3);
    }
    case 'setParagraph': {
      return runViewCommand(setBlockType(schema.nodes.paragraph));
    }
    case 'toggleBulletList': {
      return runViewCommand(toggleBulletListCommand);
    }
    case 'toggleNumberedList': {
      return runViewCommand(toggleNumberedListCommand);
    }
    case 'insertLink': {
      if (isMarkActive(schema.marks.link)) {
        const removed = runInlineMarkCommand(toggleMark(schema.marks.link));
        if (removed) {
          announce(getString('statusRemovedLink'), { kind: 'status' });
        }
        return removed;
      }
      return requestLinkInput();
    }
    case 'insertMermaidBlock': {
      return insertMermaidBlock();
    }
    case 'insertTable': {
      return insertTableBlock();
    }
    case 'insertCodeBlock': {
      return insertCodeBlock();
    }
    case 'addTableRow': {
      return editTable(view, findSelectedTablePosition(), { type: 'addRow' }) !== 'rejected';
    }
    case 'addTableColumn': {
      return editTable(view, findSelectedTablePosition(), { type: 'addColumn' }) !== 'rejected';
    }
    default: {
      return false;
    }
  }
};

const requestHostCommand = async (
  command: 'openRawMarkdown' | 'save' | 'insertFileLink' | 'goToHeading',
): Promise<void> => {
  if (await syncController.flush(serializeMarkdownForHost)) {
    vscode.postMessage({ type: 'view.executeCommand', payload: { command } });
  } else {
    announce(getString('statusSyncPending'), { kind: 'error' });
  }
};

for (const [command, button] of toolbarButtons.entries()) {
  button.addEventListener('click', () => {
    if (command === 'chooseBlockStyle') {
      requestPicker('blockStyle');
      return;
    }
    if (command === 'goToHeading' || command === 'insertFileLink') {
      void requestHostCommand(command);
      return;
    }
    if (command === 'openRawMarkdown') {
      void requestHostCommand('openRawMarkdown');
      return;
    }

    const executed = executeEditorCommand(command as ViewEditorCommand);
    if (!executed) {
      announce(formatCommandFailure(command), { kind: 'error' });
    }
    if (executed && TRANSIENT_ACTIVE_COMMANDS.has(command)) {
      button.classList.add('is-active');
      globalThis.setTimeout(() => {
        updateToolbarState();
      }, 600);
    }
    view?.focus();
  });
}

moreButton?.addEventListener('click', () => {
  advancedActionsVisible = !advancedActionsVisible;
  updateAdvancedToolbarVisibility();
  if (advancedActionsVisible) {
    getFirstAdvancedToolbarButton()?.focus();
    return;
  }
  moreButton.focus();
});

const updateToolbarPressedState = (command: string, pressed: boolean): void => {
  const button = toolbarButtons.get(command);
  if (!button) {
    return;
  }

  button.classList.toggle('is-active', pressed);
  button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
};

const isMarkActive = (markType: MarkType): boolean => {
  if (!view) {
    return false;
  }

  const { state } = view;
  const { from, to, empty, $from } = state.selection;

  if (empty) {
    return !!markType.isInSet(state.storedMarks ?? $from.marks());
  }
  return state.doc.rangeHasMark(from, to, markType);
};

const isListActive = (listNodeType: NodeType): boolean => {
  if (!view) {
    return false;
  }

  const { $from } = view.state.selection;
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    if ($from.node(depth).type === listNodeType) {
      return true;
    }
  }
  return false;
};

const updateToolbarState = (): void => {
  updateToolbarPressedState('toggleBold', isMarkActive(schema.marks.strong));
  updateToolbarPressedState('toggleItalic', isMarkActive(schema.marks.em));
  updateToolbarPressedState('toggleStrike', isMarkActive(schema.marks.strike));
  updateToolbarPressedState('insertLink', isMarkActive(schema.marks.link));

  const headingLevel = getActiveHeadingLevel();
  const blockStyleButton = toolbarButtons.get('chooseBlockStyle');
  if (blockStyleButton) {
    const style =
      headingLevel === undefined ? getString('commandLabelParagraph') : 'H' + headingLevel;
    const help = formatString(getString('toolbarBlockStyleCurrentTemplate'), style);
    setIconButton(blockStyleButton, 'text-size', getString('toolbarBlockStyleLabel'), help);
  }
  updateToolbarPressedState('toggleBulletList', isListActive(schema.nodes.bullet_list));
  updateToolbarPressedState('toggleNumberedList', isListActive(schema.nodes.ordered_list));
};

const applyHostMarkdown = (hostMarkdown: string, fileName = documentFileName): void => {
  documentFileName = fileName;
  const editorViewAttributes = getEditorViewAttributes(documentFileName);

  if (!view) {
    view = new EditorView(editorContainer, {
      state: parseMarkdown(hostMarkdown),
      attributes: editorViewAttributes,
      nodeViews: {
        code_block: createCodeBlockNodeViewConstructor({ announce }),
        table: createTableNodeViewConstructor({
          announce,
          pickAdd: (position) => requestPicker('tableAdd', position),
        }),
        front_matter: createFrontMatterNodeViewConstructor(),
        image: createImageNodeView,
      },
      dispatchTransaction(transaction) {
        if (!view || (recovering && transaction.docChanged)) {
          return;
        }
        let nextMarkdown: string | undefined;
        if (transaction.docChanged) {
          try {
            nextMarkdown = serializeToHostMarkdown(transaction.doc);
          } catch {
            announce(getString('statusSourceRequired'), { kind: 'error' });
            view.updateState(view.state);
            return;
          }
        }
        const nextState = view.state.apply(transaction);
        if (nextMarkdown !== undefined) setDocumentSource(nextState.doc, nextMarkdown);
        view.updateState(nextState);
        if (transaction.docChanged) {
          const markdown = serializeMarkdownForHost();
          retained.draft = { markdown, baseMarkdown: syncController.getBaseMarkdown() };
          preserveState();
          vscode.postMessage({
            type: 'view.draft',
            payload: { markdown, baseMarkdown: syncController.getBaseMarkdown() },
          });
          syncController.queueApply(() => markdown);
        }
      },
    });
    updateToolbarState();
    return;
  }

  view.setProps({ attributes: editorViewAttributes });
  const currentHostMarkdown = serializeMarkdownForHost();
  if (currentHostMarkdown === hostMarkdown) {
    return;
  }

  syncController.withSuppressedSync(() => {
    if (view) applyRemoteDocument(view, hostMarkdown);
  });
  updateToolbarState();
};

const onHostMessage = (event: MessageEvent<unknown>): void => {
  // VS Code relays from this origin without preserving the parent-window identity.
  if (event.origin !== globalThis.origin) return;
  const message = event.data;
  if (!isHostToViewMessage(message)) return;
  switch (message.type) {
    case 'host.pickerResult': {
      applyPickerResult(message.payload.requestId, message.payload.command);
      break;
    }
    case 'host.init': {
      const payload = message.payload;
      syncController.initialize(payload.markdown, payload.revision);
      setMermaidRenderingEnabled(payload.mermaidEnabled);
      applyContentWidth(editorShell, payload.contentWidth);
      setImageSources(payload.imageSources);
      setToolbarMode(payload.toolbarMode);
      applyHostMarkdown(payload.markdown, payload.fileName);
      announce(getString('statusConnected'), { kind: 'status' });
      if (savedDraft && savedDraft.markdown !== payload.markdown) {
        const merged = mergeIndependentChanges(
          savedDraft.baseMarkdown,
          savedDraft.markdown,
          payload.markdown,
        );
        if (merged === undefined) {
          recovering = true;
          view?.setProps({ editable: () => false });
          vscode.postMessage({
            type: 'view.recoverDraft',
            payload: { markdown: savedDraft.markdown },
          });
        } else {
          applyHostMarkdown(merged);
          syncController.queueApply(() => merged);
        }
      }
      if (typeof retained.scrollTop === 'number') editorShell.scrollTop = retained.scrollTop;
      return;
    }
    case 'host.documentChanged': {
      const payload = message.payload;
      setImageSources(payload.imageSources);
      syncController.handleHostDocumentChanged(payload);
      return;
    }
    case 'host.applyResult': {
      const payload = message.payload;
      setImageSources(payload.imageSources);
      syncController.handleApplyResult(payload);
      return;
    }
    case 'host.requestFlush': {
      const payload = message.payload;
      void syncController.flush(serializeMarkdownForHost).then((ok) => {
        vscode.postMessage({
          type: 'view.flushComplete',
          payload: { requestId: payload.requestId, ok },
        });
      });
      return;
    }
    case 'host.draftRecovered': {
      const payload = message.payload;
      recovering = false;
      view?.setProps({ editable: () => true });
      retained.draft = undefined;
      preserveState();
      syncController.initialize(payload.markdown, payload.revision);
      applyHostMarkdown(payload.markdown);
      return;
    }
    case 'host.linkInputCanceled': {
      announce('', { kind: 'status' });
      view?.focus();
      return;
    }
    case 'host.revealAnchor': {
      const { anchor } = message.payload;
      const heading = [...editorContainer.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')].find(
        (element) => element.id === anchor,
      );
      heading?.scrollIntoView({ block: 'center' });
      heading?.focus();
      return;
    }
    case 'host.revealHeading': {
      const { index } = message.payload;
      const heading = editorContainer.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')[index];
      heading?.scrollIntoView({ block: 'center' });
      heading?.focus();
      return;
    }
    case 'host.executeCommand': {
      const command = message.payload.command;
      const executed = executeEditorCommand(command);
      if (executed && (command === 'undo' || command === 'redo')) view?.focus();
      if (!executed) {
        announce(formatCommandFailure(command), { kind: 'error' });
      }
      return;
    }
    case 'host.settingsChanged': {
      const payload = message.payload;
      setMermaidRenderingEnabled(payload.mermaidEnabled);
      applyContentWidth(editorShell, payload.contentWidth);
      setToolbarMode(payload.toolbarMode);
      return;
    }
    case 'host.insertLink': {
      const payload = message.payload;
      const inserted = insertLinkFromHost(payload.href, payload.text);
      if (!inserted) {
        announce(getString('statusInsertLinkFailed'), { kind: 'error' });
      }
      return;
    }
    case 'host.imageInserted': {
      const payload = message.payload;
      const inserted = insertImageFromHost(payload.path, payload.webviewUri, payload.filename);
      if (!inserted && !view) announce(getString('statusInsertImageFailed'), { kind: 'error' });
      vscode.postMessage({
        type: 'view.imageInsertResult',
        payload: { requestId: payload.requestId, ok: inserted },
      });
      return;
    }
    case 'host.imageRejected': {
      const payload = message.payload;
      announce(payload.reason, { kind: 'error' });
      return;
    }
    case 'host.error': {
      const payload = message.payload;
      announce(payload.message, { kind: 'error' });
      return;
    }
  }
};
window.addEventListener('message', onHostMessage);

window.addEventListener('beforeunload', () => {
  syncController.queueApply(serializeMarkdownForHost);
  window.removeEventListener('message', onHostMessage);
  syncController.dispose();
});

editorShell.addEventListener(
  'scroll',
  () => {
    retained.scrollTop = editorShell.scrollTop;
    preserveState();
  },
  { passive: true },
);
vscode.postMessage({ type: 'view.ready' });
