// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import * as vscode from 'vscode';
import { ConfigInspection, ConfigService } from './services/config-service';
import { createMarkdownNote } from './custom-editor/note-commands';
import { t } from './utils/l10n';
import {
  MUNINN_MARKDOWN_EDITOR_VIEW_TYPE,
  MuninnCustomEditorProvider,
} from './custom-editor/muninn-custom-editor-provider';
import { ViewEditorCommand } from './custom-editor/protocol';

const formatInspectValue = <T>(inspect?: ConfigInspection<T>): string => {
  if (!inspect) {
    return 'unavailable';
  }

  const parts = [
    ['default', inspect.defaultValue],
    ['user', inspect.globalValue],
    ['workspace', inspect.workspaceValue],
    ['folder', inspect.workspaceFolderValue],
  ].filter(([, value]) => value !== undefined);

  if (parts.length === 0) {
    return 'unset';
  }

  return parts.map(([label, value]) => `${label}=${JSON.stringify(value)}`).join(' | ');
};

const getActiveMarkdownResource = (): vscode.Uri | undefined => {
  const activeTab = vscode.window.tabGroups.activeTabGroup?.activeTab;
  if (
    activeTab?.input instanceof vscode.TabInputCustom &&
    activeTab.input.viewType === MUNINN_MARKDOWN_EDITOR_VIEW_TYPE
  ) {
    return activeTab.input.uri;
  }

  return vscode.window.activeTextEditor?.document.uri;
};

const dispatchEditorCommand = async (
  provider: MuninnCustomEditorProvider,
  command: ViewEditorCommand,
): Promise<void> => {
  await provider.executeCommandInActiveEditor(command);
};

const registerCommands = (
  entries: ReadonlyArray<Readonly<{ id: string; run: () => unknown }>>,
): vscode.Disposable[] =>
  entries.map((entry) => vscode.commands.registerCommand(entry.id, entry.run));

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel(t('Muninn for VS Code'), { log: true });
  const configService = new ConfigService();
  const customEditorProvider = new MuninnCustomEditorProvider(
    context.extensionUri,
    configService,
    outputChannel,
  );

  const logConfigInspection = (resource?: vscode.Uri): void => {
    const inspection = configService.inspect(resource);
    outputChannel.clear();
    outputChannel.appendLine(t('Muninn for VS Code configuration'));
    outputChannel.appendLine(t('Workspace trusted: {0}', String(vscode.workspace.isTrusted)));
    outputChannel.appendLine(t('Resource: {0}', resource?.toString() ?? 'global'));
    outputChannel.appendLine(
      t('integrations.mermaid.enabled: {0}', formatInspectValue(inspection.mermaidEnabled)),
    );
    outputChannel.appendLine(
      t(
        'integrations.mermaid.allowInUntrustedWorkspaces: {0}',
        formatInspectValue(inspection.mermaidAllowInUntrustedWorkspaces),
      ),
    );
    outputChannel.appendLine(t('toolbar.mode: {0}', formatInspectValue(inspection.toolbarMode)));
    outputChannel.appendLine(
      t('appearance.contentWidth: {0}', formatInspectValue(inspection.contentWidth)),
    );
    outputChannel.appendLine(
      t('images.destination: {0}', formatInspectValue(inspection.imageDestination)),
    );
    outputChannel.show(true);
  };

  const showTableActions = async (provider: MuninnCustomEditorProvider): Promise<void> => {
    const selected = await vscode.window.showQuickPick(
      [
        {
          label: t('Insert New Table'),
          command: 'insertTable' as ViewEditorCommand,
        },
        {
          label: t('Add Table Row'),
          command: 'addTableRow' as ViewEditorCommand,
        },
        {
          label: t('Add Table Column'),
          command: 'addTableColumn' as ViewEditorCommand,
        },
      ],
      {
        title: t('Muninn Table Actions'),
        placeHolder: t('Select a table operation'),
      },
    );

    if (!selected) {
      return;
    }

    await dispatchEditorCommand(provider, selected.command);
  };

  const editorCommandEntries: ReadonlyArray<Readonly<{ id: string; command: ViewEditorCommand }>> =
    [
      { id: 'muninn.undo', command: 'undo' },
      { id: 'muninn.redo', command: 'redo' },
      { id: 'muninn.toggleTask', command: 'toggleTask' },
      { id: 'muninn.toggleStrike', command: 'toggleStrike' },
      { id: 'muninn.toggleBold', command: 'toggleBold' },
      { id: 'muninn.toggleItalic', command: 'toggleItalic' },
      { id: 'muninn.setHeading1', command: 'setHeading1' },
      { id: 'muninn.setHeading2', command: 'setHeading2' },
      { id: 'muninn.setHeading3', command: 'setHeading3' },
      { id: 'muninn.setParagraph', command: 'setParagraph' },
      { id: 'muninn.toggleBulletList', command: 'toggleBulletList' },
      { id: 'muninn.toggleNumberedList', command: 'toggleNumberedList' },
      { id: 'muninn.insertLink', command: 'insertLink' },
      { id: 'muninn.insertMermaidBlock', command: 'insertMermaidBlock' },
      { id: 'muninn.insertTable', command: 'insertTable' },
      { id: 'muninn.addTableRow', command: 'addTableRow' },
      { id: 'muninn.addTableColumn', command: 'addTableColumn' },
    ];

  const commandDisposables = registerCommands([
    { id: 'muninn.newNote', run: createMarkdownNote },
    { id: 'muninn.goToHeading', run: () => customEditorProvider.goToHeadingInActiveEditor() },
    { id: 'muninn.insertFileLink', run: () => customEditorProvider.insertFileLinkInActiveEditor() },
    {
      id: 'muninn.inspectConfiguration',
      run: () => {
        logConfigInspection(getActiveMarkdownResource());
      },
    },
    {
      id: 'muninn.openRawMarkdown',
      run: async () => {
        await customEditorProvider.openRawMarkdownForActiveEditor();
      },
    },
    {
      id: 'muninn.insertCodeBlock',
      run: async () => {
        await dispatchEditorCommand(customEditorProvider, 'insertCodeBlock');
      },
    },
    {
      id: 'muninn.insertImage',
      run: async () => {
        await customEditorProvider.insertImageInActiveEditor();
      },
    },
    {
      id: 'muninn.tableActions',
      run: async () => {
        await showTableActions(customEditorProvider);
      },
    },
    ...editorCommandEntries.map((entry) => ({
      id: entry.id,
      run: async () => {
        await dispatchEditorCommand(customEditorProvider, entry.command);
      },
    })),
  ]);

  const disposables: vscode.Disposable[] = [
    outputChannel,
    customEditorProvider,
    vscode.window.registerCustomEditorProvider(
      MUNINN_MARKDOWN_EDITOR_VIEW_TYPE,
      customEditorProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
          enableFindWidget: true,
        },
        supportsMultipleEditorsPerDocument: false,
      },
    ),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration('muninn')) {
        return;
      }
      void customEditorProvider.notifyConfigurationChanged();
    }),
    ...commandDisposables,
  ];

  context.subscriptions.push(...disposables);
  outputChannel.info(t('Muninn custom markdown editor activated.'));
}

export const __testing = { formatInspectValue };
