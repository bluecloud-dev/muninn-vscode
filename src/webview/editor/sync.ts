// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { mergeIndependentChanges } from '../../shared/text-edits';

export type ApplyDocumentPayload = { markdown: string; revision: number; operationId: number };
export type Snapshot = { markdown: string; revision: number };
type SyncOptions = {
  postApply: (payload: ApplyDocumentPayload) => void;
  applyRemote: (markdown: string) => void;
  onConflict: (markdown: string) => void;
  onSettled?: (markdown: string) => void;
};

/** One acknowledged operation at a time; newer local text is never replaced by its echo. */
export class HostSyncController {
  private currentRevision = 0;
  private baseMarkdown = '';
  private localMarkdown = '';
  private operationSequence = 0;
  private inFlight: ApplyDocumentPayload | undefined;
  private remote: Snapshot | undefined;
  private conflicted = false;
  private suppressSync = false;
  private readonly waiters = new Set<(ok: boolean) => void>();

  constructor(private readonly options: SyncOptions) {}

  initialize(markdown: string, revision: number): void {
    this.baseMarkdown = markdown;
    this.localMarkdown = markdown;
    this.currentRevision = revision;
    this.inFlight = undefined;
    this.remote = undefined;
    this.conflicted = false;
    this.settle(true);
  }

  getRevision(): number {
    return this.currentRevision;
  }
  getBaseMarkdown(): string {
    return this.baseMarkdown;
  }
  getLocalMarkdown(): string {
    return this.localMarkdown;
  }
  isDirty(): boolean {
    return this.inFlight !== undefined || this.localMarkdown !== this.baseMarkdown;
  }

  withSuppressedSync<T>(run: () => T): T {
    this.suppressSync = true;
    try {
      return run();
    } finally {
      this.suppressSync = false;
    }
  }

  queueApply(getMarkdown: () => string): void {
    if (this.suppressSync) return;
    this.localMarkdown = getMarkdown();
    this.sendPending();
  }

  flush(getMarkdown: () => string): Promise<boolean> {
    this.queueApply(getMarkdown);
    return this.whenIdle();
  }

  whenIdle(): Promise<boolean> {
    if (this.conflicted) return Promise.resolve(false);
    if (!this.isDirty()) return Promise.resolve(true);
    return new Promise((resolve) => {
      const finish = (ok: boolean): void => {
        clearTimeout(timer);
        this.waiters.delete(finish);
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false), 1000);
      this.waiters.add(finish);
    });
  }

  handleHostDocumentChanged(snapshot: Snapshot): void {
    if (snapshot.revision <= this.currentRevision) return;
    if (this.inFlight) {
      if (!this.remote || snapshot.revision > this.remote.revision) this.remote = snapshot;
      return;
    }
    this.reconcile(snapshot);
    this.sendPending();
  }

  handleApplyResult(result: Snapshot & { operationId: number; ok: boolean }): void {
    const sent = this.inFlight;
    if (!sent || result.operationId !== sent.operationId) return;
    this.inFlight = undefined;
    if (result.ok) {
      // The server accepted the sent text. Later local edits remain in localMarkdown.
      this.baseMarkdown = sent.markdown;
      this.currentRevision = Math.min(this.currentRevision, result.revision);
      this.reconcile(result);
    } else if (result.markdown === this.baseMarkdown && result.revision === this.currentRevision) {
      this.failConflict();
    } else {
      this.reconcile(result);
    }
    const remote = this.remote;
    this.remote = undefined;
    if (remote && remote.revision > this.currentRevision) this.reconcile(remote);
    this.sendPending();
  }

  dispose(): void {
    this.settle(false);
  }

  private reconcile(snapshot: Snapshot): void {
    if (this.conflicted) {
      this.baseMarkdown = snapshot.markdown;
      this.currentRevision = snapshot.revision;
      return;
    }
    const merged = mergeIndependentChanges(
      this.baseMarkdown,
      this.localMarkdown,
      snapshot.markdown,
    );
    this.baseMarkdown = snapshot.markdown;
    this.currentRevision = snapshot.revision;
    if (merged === undefined) {
      this.failConflict();
      return;
    }
    if (merged !== this.localMarkdown) {
      this.localMarkdown = merged;
      this.withSuppressedSync(() => this.options.applyRemote(merged));
    }
  }

  private failConflict(): void {
    this.conflicted = true;
    this.settle(false);
    this.options.onConflict(this.localMarkdown);
  }

  private sendPending(): void {
    if (this.inFlight || this.conflicted) return;
    if (this.localMarkdown === this.baseMarkdown) {
      this.settle(true);
      this.options.onSettled?.(this.baseMarkdown);
      return;
    }
    this.inFlight = {
      markdown: this.localMarkdown,
      revision: this.currentRevision,
      operationId: ++this.operationSequence,
    };
    this.options.postApply(this.inFlight);
  }

  private settle(ok: boolean): void {
    for (const waiter of this.waiters) waiter(ok);
  }
}
