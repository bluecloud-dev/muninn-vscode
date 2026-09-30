// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

let drafts: Record<string, string> = {};
let publish: (key: string, markdown?: string) => void = () => {};
export const initializeTableDrafts = (
  saved: unknown,
  onChange: (drafts: Record<string, string>, key: string, markdown?: string) => void,
): void => {
  drafts =
    saved && typeof saved === 'object'
      ? Object.fromEntries(
          Object.entries(saved).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        )
      : {};
  publish = (key, markdown) => onChange(drafts, key, markdown);
  for (const [key, markdown] of Object.entries(drafts)) publish(key, markdown);
};
export const readTableDraft = (key: string): string | undefined => drafts[key];
export const writeTableDraft = (key: string, markdown?: string): void => {
  if (markdown === undefined) delete drafts[key];
  else drafts[key] = markdown;
  publish(key, markdown);
};
