// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import * as vscode from 'vscode';
import { ConfigService } from '../services/config-service';

export const isMermaidIntegrationActive = (
  configService: ConfigService,
  resource?: vscode.Uri,
): boolean => {
  if (!configService.getMermaidEnabled(resource)) {
    return false;
  }

  if (configService.getMermaidAllowInUntrustedWorkspaces(resource)) {
    return true;
  }

  if (!vscode.workspace.isTrusted) {
    return false;
  }

  return true;
};
