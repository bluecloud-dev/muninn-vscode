// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import * as vscode from 'vscode';

export const t = (message: string, ...values: Array<string | number | boolean>): string =>
  vscode.l10n.t(message, ...values);
