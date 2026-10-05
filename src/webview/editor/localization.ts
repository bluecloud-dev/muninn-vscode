// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { DEFAULT_WEBVIEW_STRINGS, type WebviewStrings } from '../../shared/webview-strings';

type WebviewGlobal = typeof globalThis & {
  __MUNINN_WEBVIEW_STRINGS__?: Partial<WebviewStrings>;
};

const globalContext = globalThis as WebviewGlobal;

const strings: WebviewStrings = {
  ...DEFAULT_WEBVIEW_STRINGS,
  ...globalContext.__MUNINN_WEBVIEW_STRINGS__,
};

export const getString = <Key extends keyof WebviewStrings>(key: Key): string => strings[key];

export const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

export const getHtmlString = <Key extends keyof WebviewStrings>(key: Key): string =>
  escapeHtml(getString(key));

export const formatString = (
  template: string,
  ...values: Array<string | number | boolean>
): string => {
  let output = template;
  for (const [index, value] of values.entries()) {
    output = output.replaceAll(`{${index}}`, () => String(value));
  }
  return output;
};
