// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import assert from 'node:assert/strict';
import { HostSyncController, type ApplyDocumentPayload } from '../../src/webview/editor/sync';

const fixture = (initial = 'Alpha') => {
  const sent: ApplyDocumentPayload[] = [];
  const applied: string[] = [];
  const conflicts: string[] = [];
  const sync = new HostSyncController({
    postApply: (payload) => sent.push(payload),
    applyRemote: (markdown) => applied.push(markdown),
    onConflict: (markdown) => conflicts.push(markdown),
  });
  sync.initialize(initial, 0);
  const ack = (index: number, revision: number, markdown = sent[index].markdown, ok = true) =>
    sync.handleApplyResult({ operationId: sent[index].operationId, revision, markdown, ok });
  return { sync, sent, applied, conflicts, ack };
};

describe('acknowledged webview synchronization', () => {
  it('preserves AlphaXY when AlphaX is acknowledged while Y is pending', async () => {
    const f = fixture();
    f.sync.queueApply(() => 'AlphaX');
    f.sync.queueApply(() => 'AlphaXY');
    const idle = f.sync.whenIdle();
    assert.equal(f.sent.length, 1);
    f.ack(0, 1);
    assert.equal(f.sync.getLocalMarkdown(), 'AlphaXY');
    assert.deepEqual(f.applied, []);
    assert.equal(f.sent[1].markdown, 'AlphaXY');
    assert.equal(f.sent[1].revision, 1);
    f.ack(1, 2);
    assert.equal(await idle, true);
    assert.equal(f.sync.isDirty(), false);
  });

  it('ignores duplicate and unrelated acknowledgments', () => {
    const f = fixture();
    f.sync.queueApply(() => 'AlphaX');
    f.sync.handleApplyResult({ operationId: 999, revision: 999, markdown: 'Bad', ok: true });
    assert.equal(f.sync.getLocalMarkdown(), 'AlphaX');
    f.ack(0, 1);
    f.sync.queueApply(() => 'AlphaXY');
    f.ack(0, 1);
    assert.equal(f.sync.isDirty(), true);
    f.ack(1, 2);
    assert.equal(f.sync.isDirty(), false);
  });

  it('merges independent local and external edits after a stale-revision rejection', () => {
    const f = fixture('Alpha\nBeta\n');
    f.sync.queueApply(() => 'AlphaX\nBeta\n');
    f.ack(0, 1, 'Alpha\nBetaY\n', false);
    assert.equal(f.sent[1].markdown, 'AlphaX\nBetaY\n');
    assert.deepEqual(f.applied, ['AlphaX\nBetaY\n']);
    assert.deepEqual(f.conflicts, []);
  });

  it('buffers external events until the in-flight operation resolves', () => {
    const f = fixture('Alpha\nBeta\n');
    f.sync.queueApply(() => 'AlphaX\nBeta\n');
    f.sync.handleHostDocumentChanged({ markdown: 'AlphaX\nBetaY\n', revision: 2 });
    assert.deepEqual(f.applied, []);
    f.ack(0, 1);
    assert.equal(f.sync.getLocalMarkdown(), 'AlphaX\nBetaY\n');
    assert.equal(f.sync.getRevision(), 2);
  });

  it('keeps overlapping local edits for recovery instead of overwriting them', async () => {
    const f = fixture();
    f.sync.queueApply(() => 'Local');
    f.ack(0, 1, 'Remote', false);
    assert.deepEqual(f.conflicts, ['Local']);
    assert.equal(f.sync.getLocalMarkdown(), 'Local');
    assert.equal(await f.sync.whenIdle(), false);
    f.sync.initialize('Remote', 1);
    assert.equal(await f.sync.whenIdle(), true);
  });

  it('treats apply failure as a recoverable draft and settles waiting saves', async () => {
    const f = fixture();
    f.sync.queueApply(() => 'Local');
    const idle = f.sync.whenIdle();
    f.ack(0, 0, 'Alpha', false);
    assert.equal(await idle, false);
    assert.deepEqual(f.conflicts, ['Local']);
  });

  it('does not echo programmatic updates or reapply old remote revisions', () => {
    const f = fixture();
    f.sync.withSuppressedSync(() => f.sync.queueApply(() => 'ignored'));
    assert.deepEqual(f.sent, []);
    f.sync.handleHostDocumentChanged({ markdown: 'Remote', revision: 1 });
    f.sync.handleHostDocumentChanged({ markdown: 'old', revision: 0 });
    assert.equal(f.sync.getLocalMarkdown(), 'Remote');
    assert.deepEqual(f.applied, ['Remote']);
  });

  it('releases pending waits when disposed', async () => {
    const f = fixture();
    f.sync.queueApply(() => 'Local');
    const idle = f.sync.whenIdle();
    f.sync.dispose();
    assert.equal(await idle, false);
  });
});
