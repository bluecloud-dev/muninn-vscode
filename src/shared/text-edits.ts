// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { diffChars } from 'diff';

export type TextChange = { from: number; to: number; insert: string };

/** UTF-16 offsets match VS Code and ProseMirror; diff counts Unicode code points. */
export const textChanges = (before: string, after: string): TextChange[] => {
  if (before === after) return [];
  const changes = diffChars(before, after, { timeout: 80, maxEditLength: 20_000 });
  if (!changes) {
    let from = 0;
    while (from < before.length && from < after.length && before[from] === after[from]) from++;
    let oldEnd = before.length;
    let newEnd = after.length;
    while (oldEnd > from && newEnd > from && before[oldEnd - 1] === after[newEnd - 1]) {
      oldEnd--;
      newEnd--;
    }
    return [{ from, to: oldEnd, insert: after.slice(from, newEnd) }];
  }
  const edits: TextChange[] = [];
  let offset = 0;
  let pending: TextChange | undefined;
  for (const change of changes) {
    if (!change.added && !change.removed) {
      if (pending) edits.push(pending);
      pending = undefined;
      offset += change.value.length;
      continue;
    }
    pending ??= { from: offset, to: offset, insert: '' };
    if (change.removed) {
      offset += change.value.length;
      pending.to = offset;
    } else pending.insert += change.value;
  }
  if (pending) edits.push(pending);
  return edits;
};

export const applyTextChanges = (source: string, edits: readonly TextChange[]): string => {
  let end = 0;
  const pieces: string[] = [];
  for (const edit of edits) {
    if (edit.from < end || edit.to < edit.from || edit.to > source.length)
      throw new Error('Invalid or overlapping text change.');
    pieces.push(source.slice(end, edit.from), edit.insert);
    end = edit.to;
  }
  pieces.push(source.slice(end));
  return pieces.join('');
};

/** Undefined means the position is inside rewritten syntax. Never guess. */
export const mapTextOffset = (
  offset: number,
  edits: readonly TextChange[],
  association: -1 | 1,
): number | undefined => {
  let delta = 0;
  for (const edit of edits) {
    if (offset < edit.from) break;
    if (offset === edit.from)
      return (
        edit.from + delta + (edit.from === edit.to && association === 1 ? edit.insert.length : 0)
      );
    if (offset < edit.to) return undefined;
    delta += edit.insert.length - (edit.to - edit.from);
  }
  return offset + delta;
};

/** Overlapping edits stay available for recovery instead of guessing a winner. */
export const mergeIndependentChanges = (
  base: string,
  local: string,
  remote: string,
): string | undefined => {
  if (local === remote || local === base) return remote;
  if (remote === base) return local;
  const localChanges = textChanges(base, local);
  const remoteChanges = textChanges(base, remote);
  const rebased: TextChange[] = [];
  for (const localChange of localChanges) {
    if (
      remoteChanges.some(
        (change) =>
          change.from === localChange.from &&
          change.to === localChange.to &&
          change.insert === localChange.insert,
      )
    )
      continue;
    if (
      remoteChanges.some(
        (change) =>
          (localChange.from < change.to && localChange.to > change.from) ||
          (localChange.from === localChange.to &&
            localChange.from >= change.from &&
            localChange.from <= change.to) ||
          (change.from === change.to &&
            change.from >= localChange.from &&
            change.from <= localChange.to),
      )
    )
      return undefined;
    const from = mapTextOffset(localChange.from, remoteChanges, 1);
    const to = mapTextOffset(localChange.to, remoteChanges, -1);
    if (from === undefined || to === undefined) return undefined;
    rebased.push({ from, to, insert: localChange.insert });
  }
  return applyTextChanges(remote, rebased);
};
