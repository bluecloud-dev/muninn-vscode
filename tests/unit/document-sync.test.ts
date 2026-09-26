// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { DocumentSync } from '../../src/custom-editor/document-sync';

type RecordedEdit = vscode.WorkspaceEdit & {
  replacements: Array<{ uri: vscode.Uri; range: vscode.Range; text: string }>;
};

describe('DocumentSync', () => {
  const workspace = vscode.workspace as unknown as {
    applyEdit: (edit: vscode.WorkspaceEdit) => Promise<boolean>;
  };
  const original = workspace.applyEdit;
  afterEach(() => {
    workspace.applyEdit = original;
  });

  const fixture = (initial: string) => {
    let text = initial;
    const document = {
      uri: vscode.Uri.file('/workspace/doc.md'),
      getText: () => text,
      positionAt: (offset: number) => {
        const lines = text.slice(0, offset).split('\n');
        return new vscode.Position(lines.length - 1, lines.at(-1)!.length);
      },
    } as unknown as vscode.TextDocument;
    const offsetAt = (p: vscode.Position) =>
      text
        .split('\n')
        .slice(0, p.line)
        .reduce((sum, line) => sum + line.length + 1, 0) + p.character;
    const edits: RecordedEdit[] = [];
    workspace.applyEdit = async (edit) => {
      const recorded = edit as RecordedEdit;
      edits.push(recorded);
      for (const change of recorded.replacements.toReversed()) {
        text =
          text.slice(0, offsetAt(change.range.start)) +
          change.text +
          text.slice(offsetAt(change.range.end));
      }
      return true;
    };
    return {
      document,
      sync: new DocumentSync(document),
      edits,
      replaceExternally: (value: string) => {
        text = value;
      },
    };
  };

  it('revisions track actual text changes exactly once, including changes observed before their event', () => {
    const f = fixture('Alpha');
    assert.deepEqual(f.sync.getSnapshot(), { markdown: 'Alpha', revision: 0 });
    assert.equal(
      f.sync.handleDocumentChanged({ document: f.document } as vscode.TextDocumentChangeEvent),
      undefined,
    );
    f.replaceExternally('Beta');
    assert.deepEqual(f.sync.getSnapshot(), { markdown: 'Beta', revision: 1 });
    assert.equal(
      f.sync.handleDocumentChanged({ document: f.document } as vscode.TextDocumentChangeEvent),
      undefined,
    );
    f.replaceExternally('Gamma');
    assert.deepEqual(
      f.sync.handleDocumentChanged({ document: f.document } as vscode.TextDocumentChangeEvent),
      { markdown: 'Gamma', revision: 2 },
    );
    assert.equal(
      f.sync.handleDocumentChanged({
        document: { uri: vscode.Uri.file('/other.md') },
      } as vscode.TextDocumentChangeEvent),
      undefined,
    );
  });

  it('rejects a stale revision without writing', async () => {
    const f = fixture('Alpha');
    f.replaceExternally('Remote');
    const result = await f.sync.applyDocument('Local', 0);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'revision_mismatch');
    assert.equal(f.edits.length, 0);
  });

  it('acknowledges a no-op without applying an edit', async () => {
    const f = fixture('Alpha\n');
    assert.deepEqual(await f.sync.applyDocument('Alpha\n', 0), { ok: true });
    assert.equal(f.edits.length, 0);
  });

  it('changes only the intended ranges and preserves CRLF, trailing blanks and emoji', async () => {
    const original = '# Title\r\n\r\nAlpha 😀 keeps  \r\n\r\nTail\r\n';
    const desired = original.replace('Alpha', 'Bravo').replace('Tail', 'End');
    const f = fixture(original);
    assert.deepEqual(await f.sync.applyDocument(desired, 0), { ok: true });
    assert.equal(f.sync.getSnapshot().markdown, desired);
    for (const change of f.edits[0].replacements) assert.ok(change.range.start.line >= 2);
  });

  for (const [source, target] of [
    ['', 'Alpha'],
    ['Alpha\n', 'Alpha'],
    ['Alpha', 'Alpha\n'],
    ['\n', ''],
  ]) {
    it(
      'applies explicitly requested source including EOF changes: ' +
        JSON.stringify([source, target]),
      async () => {
        const f = fixture(source);
        assert.deepEqual(await f.sync.applyDocument(target, 0), { ok: true });
        assert.equal(f.sync.getSnapshot().markdown, target);
      },
    );
  }

  it('reports both a rejected workspace edit and an exception', async () => {
    const f = fixture('Alpha');
    workspace.applyEdit = async () => false;
    const rejected = await f.sync.applyDocument('Beta', 0);
    assert.equal(rejected.ok, false);
    workspace.applyEdit = async () => {
      throw new Error('Disconnected');
    };
    const failed = await f.sync.applyDocument('Beta', 0);
    assert.equal(failed.ok, false);
    assert.equal(f.sync.getSnapshot().markdown, 'Alpha');
  });
});
