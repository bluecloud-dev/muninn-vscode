// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import * as vscode from 'vscode';
import { textChanges } from '../shared/text-edits';
import type { SerializedMarkdownPayload } from './protocol';

type ApplyResult =
  { ok: true } | { ok: false; code: 'revision_mismatch' | 'apply_failed'; message: string };

export class DocumentSync {
  private revision = 0;
  private lastText: string;

  constructor(private readonly document: vscode.TextDocument) {
    this.lastText = document.getText();
  }

  getSnapshot(): SerializedMarkdownPayload {
    const markdown = this.document.getText();
    if (markdown !== this.lastText) {
      this.lastText = markdown;
      this.revision++;
    }
    return { markdown, revision: this.revision };
  }

  handleDocumentChanged(
    event: vscode.TextDocumentChangeEvent,
  ): SerializedMarkdownPayload | undefined {
    if (event.document.uri.toString() !== this.document.uri.toString()) return;
    const previous = this.revision;
    const snapshot = this.getSnapshot();
    return previous === this.revision ? undefined : snapshot;
  }

  async applyDocument(markdown: string, expectedRevision: number): Promise<ApplyResult> {
    const snapshot = this.getSnapshot();
    if (expectedRevision !== snapshot.revision)
      return {
        ok: false,
        code: 'revision_mismatch',
        message: 'The document changed before the edit could be applied.',
      };
    const changes = textChanges(snapshot.markdown, markdown);
    if (changes.length === 0) return { ok: true };
    const edit = new vscode.WorkspaceEdit();
    for (const change of changes) {
      edit.replace(
        this.document.uri,
        new vscode.Range(
          this.document.positionAt(change.from),
          this.document.positionAt(change.to),
        ),
        change.insert,
      );
    }
    try {
      if (await vscode.workspace.applyEdit(edit)) return { ok: true };
    } catch {
      // The provider reports failure and retains the draft for recovery.
    }
    return { ok: false, code: 'apply_failed', message: 'VS Code could not apply the edit.' };
  }
}
