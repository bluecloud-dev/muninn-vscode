// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import sinon from 'sinon';
import * as vscode from 'vscode';
import { createMarkdownNote } from '../../src/custom-editor/note-commands';

describe('native note capture', () => {
  afterEach(() => sinon.restore());
  it('does nothing when the save picker is cancelled', async () => {
    sinon.stub(vscode.window, 'showSaveDialog').resolves();
    const apply = sinon.stub(vscode.workspace, 'applyEdit');
    await createMarkdownNote();
    assert.equal(apply.called, false);
  });
  it('creates a note without overwrite permission and opens it with Muninn', async () => {
    const uri = vscode.Uri.parse('vscode-remote://host/notes/new.md');
    sinon.stub(vscode.window, 'showSaveDialog').resolves(uri);
    const apply = sinon.stub(vscode.workspace, 'applyEdit').resolves(true);
    const execute = sinon.stub(vscode.commands, 'executeCommand').resolves();
    await createMarkdownNote();
    const creation = (
      apply.firstCall.args[0] as unknown as { creation: { uri: vscode.Uri; options: object } }
    ).creation;
    assert.deepEqual(creation.options, { overwrite: false, ignoreIfExists: false });
    assert.equal(execute.firstCall.args[1], uri);
  });
  it('reports file creation failure without opening another document', async () => {
    sinon.stub(vscode.window, 'showSaveDialog').resolves(vscode.Uri.file('/read-only/new.md'));
    sinon.stub(vscode.workspace, 'applyEdit').resolves(false);
    const warn = sinon.stub(vscode.window, 'showWarningMessage').resolves();
    const execute = sinon.stub(vscode.commands, 'executeCommand').resolves();
    await createMarkdownNote();
    assert.equal(warn.calledOnce, true);
    assert.equal(execute.called, false);
  });
});
