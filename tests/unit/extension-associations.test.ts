// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import sinon from 'sinon';
import * as vscode from 'vscode';
import { activate, __testing } from '../../src/extension';

describe('native editor associations', () => {
  afterEach(() => sinon.restore());
  it('never writes user or workspace associations during activation', () => {
    const update = sinon.stub();
    sinon.stub(vscode.workspace, 'getConfiguration').returns({
      get: (_key: string, fallback: unknown) => fallback,
      inspect: () => {},
      update,
    } as unknown as vscode.WorkspaceConfiguration);
    const context = {
      subscriptions: [],
      extensionUri: vscode.Uri.file('/extension'),
    } as unknown as vscode.ExtensionContext;
    activate(context);
    assert.equal(update.called, false);
    for (const disposable of context.subscriptions) disposable.dispose();
  });
  it('formats available configuration scopes', () => {
    assert.equal(__testing.formatInspectValue(), 'unavailable');
    assert.equal(__testing.formatInspectValue({}), 'unset');
    assert.equal(
      __testing.formatInspectValue({ defaultValue: false, globalValue: true }),
      'default=false | user=true',
    );
  });
});
