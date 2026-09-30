// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { getHtmlString } from './localization';

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
    <div class="muninn-toolbar-group" data-group="text" role="group" aria-labelledby="muninn-toolbar-group-text-label">
      <span id="muninn-toolbar-group-text-label" class="muninn-toolbar-group-label">${getHtmlString('toolbarGroupTextLabel')}</span>
      <button type="button" data-command="toggleBold" aria-pressed="false" tabindex="0" title="${getHtmlString('toolbarButtonBoldTitle')}">${getHtmlString('commandLabelBold')}</button>
      <button type="button" data-command="toggleItalic" aria-pressed="false" tabindex="-1" title="${getHtmlString('toolbarButtonItalicTitle')}">${getHtmlString('commandLabelItalic')}</button>
      <button type="button" data-command="insertLink" aria-pressed="false" tabindex="-1" title="${getHtmlString('toolbarButtonLinkTitle')}">${getHtmlString('commandLabelLink')}</button>
    </div>
      <button type="button" id="muninn-toolbar-strike" data-command="toggleStrike" hidden aria-pressed="false" tabindex="-1" title="${getHtmlString('commandLabelStrike')}">${getHtmlString('commandLabelStrike')}</button>
    <div class="muninn-toolbar-group" data-group="structure" role="group" aria-labelledby="muninn-toolbar-group-structure-label">
      <span id="muninn-toolbar-group-structure-label" class="muninn-toolbar-group-label">${getHtmlString('toolbarGroupStructureLabel')}</span>
      <button type="button" id="muninn-toolbar-heading-1" hidden data-command="setHeading1" aria-pressed="false" tabindex="-1" title="${getHtmlString('toolbarButtonHeading1Title')}">${getHtmlString('toolbarButtonHeading1Label')}</button>
      <button type="button" id="muninn-toolbar-heading-2" hidden data-command="setHeading2" aria-pressed="false" tabindex="-1" title="${getHtmlString('toolbarButtonHeading2Title')}">${getHtmlString('toolbarButtonHeading2Label')}</button>
      <button type="button" id="muninn-toolbar-heading-3" data-command="setHeading3" aria-pressed="false" data-advanced="true" tabindex="-1" hidden title="${getHtmlString('toolbarButtonHeading3Title')}">${getHtmlString('toolbarButtonHeading3Label')}</button>
      <button type="button" id="muninn-toolbar-paragraph" data-command="setParagraph" aria-pressed="false" data-advanced="true" tabindex="-1" hidden title="${getHtmlString('toolbarButtonParagraphTitle')}">${getHtmlString('commandLabelParagraph')}</button>
      <button type="button" data-command="toggleBulletList" aria-pressed="false" tabindex="-1" title="${getHtmlString('toolbarButtonBulletTitle')}">${getHtmlString('toolbarButtonBulletLabel')}</button>
      <button type="button" data-command="toggleNumberedList" aria-pressed="false" tabindex="-1" title="${getHtmlString('toolbarButtonNumberedTitle')}">${getHtmlString('toolbarButtonNumberedLabel')}</button>
    </div>
    <div class="muninn-toolbar-group" data-group="insert" role="group" aria-labelledby="muninn-toolbar-group-insert-label">
      <span id="muninn-toolbar-group-insert-label" class="muninn-toolbar-group-label">${getHtmlString('toolbarGroupInsertLabel')}</span>
      <button type="button" id="muninn-toolbar-task" data-command="toggleTask" hidden tabindex="-1" title="${getHtmlString('commandLabelTask')}">${getHtmlString('commandLabelTask')}</button>
      <button type="button" data-command="insertTable" tabindex="-1" title="${getHtmlString('toolbarButtonTableTitle')}">${getHtmlString('commandLabelTable')}</button>
      <button type="button" id="muninn-toolbar-code-block" data-command="insertCodeBlock" data-advanced="true" tabindex="-1" hidden title="${getHtmlString('toolbarButtonCodeTitle')}">${getHtmlString('commandLabelCodeBlock')}</button>
      <button type="button" id="muninn-toolbar-mermaid" data-command="insertMermaidBlock" data-advanced="true" tabindex="-1" hidden title="${getHtmlString('toolbarButtonMermaidTitle')}">${getHtmlString('toolbarButtonMermaidLabel')}</button>
      <button type="button" data-command="openRawMarkdown" tabindex="-1" title="${getHtmlString('toolbarButtonSourceTitle')}">${getHtmlString('toolbarButtonSourceLabel')}</button>
    </div>
    <button type="button" data-command="goToHeading" tabindex="-1" title="${getHtmlString('commandLabelHeadings')}">${getHtmlString('commandLabelHeadings')}</button>
    <button type="button" id="muninn-toolbar-file-link" data-command="insertFileLink" hidden tabindex="-1" title="${getHtmlString('commandLabelFileLink')}">${getHtmlString('commandLabelFileLink')}</button>
    <button type="button" class="muninn-toolbar-more" data-testid="muninn-toolbar-more" aria-controls="muninn-toolbar-heading-1 muninn-toolbar-heading-2 muninn-toolbar-task muninn-toolbar-strike muninn-toolbar-file-link muninn-toolbar-heading-3 muninn-toolbar-paragraph muninn-toolbar-code-block muninn-toolbar-mermaid" aria-expanded="false" tabindex="-1" title="${getHtmlString('toolbarMoreTitle')}">${getHtmlString('toolbarMoreLabel')}</button>
  </div>
  <div class="muninn-editor-shell" id="editor-shell">
    <div id="editor"></div>
  </div>
  <div id="status" class="muninn-status" role="status" aria-live="polite">${getHtmlString('statusReady')}</div>
  <div id="status-alert" class="muninn-status" role="alert" aria-live="assertive" aria-atomic="true" hidden></div>
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
  for (const button of app.querySelectorAll<HTMLButtonElement>('button[data-command]')) {
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
