// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import * as vscode from 'vscode';
import { t } from '../utils/l10n';

/** Use the native save picker and filesystem provider; never overwrite an existing note. */
export const createMarkdownNote = async (): Promise<void> => {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri;
  const uri = await vscode.window.showSaveDialog({
    title: t('Create Markdown Note'),
    defaultUri: root ? vscode.Uri.joinPath(root, 'note.md') : undefined,
    filters: { Markdown: ['md', 'markdown'] },
  });
  if (!uri) return;
  const edit = new vscode.WorkspaceEdit();
  edit.createFile(uri, { overwrite: false, ignoreIfExists: false });
  try {
    if (!(await vscode.workspace.applyEdit(edit))) throw new Error('File creation was rejected.');
    await vscode.commands.executeCommand('vscode.openWith', uri, 'muninn.markdownEditor', {
      preview: false,
    });
  } catch {
    await vscode.window.showWarningMessage(
      t('Could not create the note. Choose a new filename in a writable folder.'),
    );
  }
};
