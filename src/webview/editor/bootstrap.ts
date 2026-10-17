// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { getHtmlString } from './localization';
import { attachIconHelp, setIconButton } from './icon-button';

export type EditorBootstrap = {
  app: HTMLDivElement;
  toolbar: HTMLDivElement;
  editorShell: HTMLDivElement;
  editorContainer: HTMLDivElement;
  statusLine: HTMLDivElement;
  alertLine: HTMLDivElement;
  toolbarButtons: Map<string, HTMLButtonElement>;
};

export const bootstrapEditorApp = (): EditorBootstrap => {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) {
    throw new Error('Muninn webview app root not found.');
  }

  app.innerHTML = `
  <div class="muninn-toolbar" role="toolbar" aria-label="${getHtmlString('toolbarAriaLabel')}">
    <div class="muninn-toolbar-group" data-group="history" role="group" aria-label="${getHtmlString('toolbarGroupHistoryLabel')}">
      <button type="button" data-command="undo" data-icon="discard" data-shortcut="Ctrl/Cmd+Z" disabled tabindex="-1" title="${getHtmlString('commandLabelUndo')}">${getHtmlString('commandLabelUndo')}</button>
      <button type="button" data-command="redo" data-icon="redo" data-shortcut="Ctrl/Cmd+Shift+Z" disabled tabindex="-1" title="${getHtmlString('commandLabelRedo')}">${getHtmlString('commandLabelRedo')}</button>
    </div>
    <div class="muninn-toolbar-group" data-group="style" role="group" aria-label="${getHtmlString('toolbarBlockStyleLabel')}">
      <button type="button" class="muninn-block-style" data-command="chooseBlockStyle" tabindex="0" aria-haspopup="menu" aria-expanded="false" aria-controls="muninn-toolbar-menu" title="${getHtmlString('toolbarBlockStyleLabel')}"><span class="muninn-block-style-label">${getHtmlString('commandLabelParagraph')}</span><span class="codicon codicon-chevron-down" aria-hidden="true"></span></button>
    </div>
    <div class="muninn-toolbar-group" data-group="text" role="group" aria-label="${getHtmlString('toolbarGroupTextLabel')}">
      <button type="button" data-command="toggleBold" data-icon="bold" data-shortcut="Ctrl/Cmd+B" aria-pressed="false" tabindex="-1" title="${getHtmlString('toolbarButtonBoldTitle')}">${getHtmlString('commandLabelBold')}</button>
      <button type="button" data-command="toggleItalic" data-icon="italic" data-shortcut="Ctrl/Cmd+I" aria-pressed="false" tabindex="-1" title="${getHtmlString('toolbarButtonItalicTitle')}">${getHtmlString('commandLabelItalic')}</button>
      <button type="button" data-command="toggleStrike" data-icon="strikethrough" aria-pressed="false" tabindex="-1" title="${getHtmlString('commandLabelStrike')}">${getHtmlString('commandLabelStrike')}</button>
    </div>
    <div class="muninn-toolbar-group" data-group="lists" role="group" aria-label="${getHtmlString('toolbarGroupListsLabel')}">
      <button type="button" data-command="toggleBulletList" data-icon="list-unordered" aria-pressed="false" tabindex="-1" title="${getHtmlString('toolbarButtonBulletTitle')}">${getHtmlString('toolbarButtonBulletLabel')}</button>
      <button type="button" data-command="toggleNumberedList" data-icon="list-ordered" aria-pressed="false" tabindex="-1" title="${getHtmlString('toolbarButtonNumberedTitle')}">${getHtmlString('toolbarButtonNumberedLabel')}</button>
      <button type="button" data-command="toggleTask" data-icon="checklist" aria-pressed="false" tabindex="-1" title="${getHtmlString('commandLabelTask')}">${getHtmlString('commandLabelTask')}</button>
    </div>
    <div class="muninn-toolbar-group" data-group="insert" role="group" aria-label="${getHtmlString('toolbarGroupInsertLabel')}">
      <button type="button" data-command="insertLink" data-icon="link" aria-pressed="false" tabindex="-1" title="${getHtmlString('toolbarButtonLinkTitle')}">${getHtmlString('commandLabelLink')}</button>
      <button type="button" data-command="insertFileLink" data-icon="file-symlink-file" tabindex="-1" title="${getHtmlString('commandLabelFileLink')}">${getHtmlString('commandLabelFileLink')}</button>
      <button type="button" data-command="insertImage" data-icon="file-media" tabindex="-1" title="${getHtmlString('commandLabelImage')}">${getHtmlString('commandLabelImage')}</button>
      <button type="button" data-command="chooseTableAction" data-icon="table" tabindex="-1" aria-haspopup="menu" aria-expanded="false" aria-controls="muninn-toolbar-menu" title="${getHtmlString('commandLabelTable')}">${getHtmlString('commandLabelTable')}</button>
      <button type="button" data-command="insertCodeBlock" data-icon="code" tabindex="-1" title="${getHtmlString('toolbarButtonCodeTitle')}">${getHtmlString('commandLabelCodeBlock')}</button>
      <button type="button" data-command="insertMermaidBlock" data-icon="symbol-structure" data-shortcut="Ctrl/Cmd+Alt+M" tabindex="-1" title="${getHtmlString('toolbarButtonMermaidTitle')}">${getHtmlString('toolbarButtonMermaidLabel')}</button>
    </div>
    <div class="muninn-toolbar-group" data-group="utilities" role="group" aria-label="${getHtmlString('toolbarGroupUtilitiesLabel')}">
      <button type="button" data-command="exportHtml" data-icon="export" tabindex="-1" title="${getHtmlString('commandLabelExportHtml')}">${getHtmlString('commandLabelExportHtml')}</button>
      <button type="button" data-command="goToHeading" data-icon="list-tree" tabindex="-1" title="${getHtmlString('commandLabelHeadings')}">${getHtmlString('commandLabelHeadings')}</button>
      <button type="button" data-command="openRawMarkdown" data-icon="go-to-file" tabindex="-1" title="${getHtmlString('toolbarButtonSourceTitle')}">${getHtmlString('toolbarButtonSourceLabel')}</button>
      <button type="button" class="muninn-toolbar-more" data-icon="ellipsis" data-testid="muninn-toolbar-more" aria-haspopup="menu" aria-controls="muninn-toolbar-menu" aria-expanded="false" tabindex="-1" hidden title="${getHtmlString('toolbarMoreTitle')}">${getHtmlString('toolbarMoreLabel')}</button>
    </div>
  </div>
  <div class="muninn-editor-shell" id="editor-shell">
    <div id="editor"></div>
  </div>
  <div id="status" class="muninn-status" role="status" aria-live="polite">${getHtmlString('statusReady')}</div>
  <div id="status-alert" class="muninn-status" role="alert" aria-live="assertive" aria-atomic="true" hidden></div>
  <div id="muninn-toolbar-menu" class="muninn-toolbar-menu" role="menu" hidden></div>
`;

  const toolbar = document.querySelector<HTMLDivElement>('.muninn-toolbar');
  const editorShell = document.querySelector<HTMLDivElement>('#editor-shell');
  const editorContainer = document.querySelector<HTMLDivElement>('#editor');
  const statusLine = document.querySelector<HTMLDivElement>('#status');
  const alertLine = document.querySelector<HTMLDivElement>('#status-alert');
  if (!toolbar || !editorShell || !editorContainer || !statusLine || !alertLine) {
    throw new Error('Muninn webview UI elements are missing.');
  }

  const toolbarButtons = new Map<string, HTMLButtonElement>();
  attachIconHelp(app);
  for (const button of app.querySelectorAll<HTMLButtonElement>('button')) {
    if (button.dataset.icon)
      setIconButton(button, button.dataset.icon, button.textContent!, button.title);
    else {
      button.dataset.help = button.title;
      button.removeAttribute('title');
    }
    const command = button.dataset.command;
    if (!command) {
      continue;
    }
    toolbarButtons.set(command, button);
  }

  return {
    app,
    toolbar,
    editorShell,
    editorContainer,
    statusLine,
    alertLine,
    toolbarButtons,
  };
};
