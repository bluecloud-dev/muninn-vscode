// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import * as vscode from 'vscode';
import { ContentWidthSetting, ExtensionConfiguration } from '../types/config';

export type ConfigInspection<T> = {
  defaultValue?: T;
  globalValue?: T;
  workspaceValue?: T;
  workspaceFolderValue?: T;
};

const DEFAULT_CONFIG: ExtensionConfiguration = {
  mermaidEnabled: true,
  mermaidAllowInUntrustedWorkspaces: false,
  toolbarMode: 'basic',
  contentWidth: 'comfortable',
  imageDestination: 'images/',
};

const isContentWidthSetting = (value: unknown): value is ContentWidthSetting =>
  value === 'comfortable' ||
  value === 'full' ||
  (typeof value === 'number' && Number.isFinite(value) && value >= 40 && value <= 120);

const normalizeContentWidthSetting = (value: unknown): ContentWidthSetting =>
  isContentWidthSetting(value) ? value : DEFAULT_CONFIG.contentWidth;

export class ConfigService {
  getMermaidEnabled(resource?: vscode.Uri): boolean {
    return this.getConfig(resource).mermaidEnabled;
  }

  getMermaidAllowInUntrustedWorkspaces(resource?: vscode.Uri): boolean {
    return this.getConfig(resource).mermaidAllowInUntrustedWorkspaces;
  }

  getToolbarMode(resource?: vscode.Uri): 'basic' | 'advanced' {
    return this.getConfig(resource).toolbarMode;
  }

  getContentWidth(resource?: vscode.Uri): ContentWidthSetting {
    return this.getConfig(resource).contentWidth;
  }

  getImageDestination(resource?: vscode.Uri): string {
    return this.getConfig(resource).imageDestination;
  }

  getConfig(resource?: vscode.Uri): ExtensionConfiguration {
    return this.loadConfig(resource);
  }

  inspect(resource?: vscode.Uri): {
    mermaidEnabled?: ConfigInspection<boolean>;
    mermaidAllowInUntrustedWorkspaces?: ConfigInspection<boolean>;
    toolbarMode?: ConfigInspection<'basic' | 'advanced'>;
    contentWidth?: ConfigInspection<ContentWidthSetting>;
    imageDestination?: ConfigInspection<string>;
  } {
    const config = vscode.workspace.getConfiguration('muninn', resource);
    return {
      mermaidEnabled: config.inspect<boolean>('integrations.mermaid.enabled'),
      mermaidAllowInUntrustedWorkspaces: config.inspect<boolean>(
        'integrations.mermaid.allowInUntrustedWorkspaces',
      ),
      toolbarMode: config.inspect<'basic' | 'advanced'>('toolbar.mode'),
      contentWidth: config.inspect<ContentWidthSetting>('appearance.contentWidth'),
      imageDestination: config.inspect<string>('images.destination'),
    };
  }

  private loadConfig(resource?: vscode.Uri): ExtensionConfiguration {
    const config = vscode.workspace.getConfiguration('muninn', resource);
    return {
      mermaidEnabled: config.get('integrations.mermaid.enabled', DEFAULT_CONFIG.mermaidEnabled),
      // Permission must come from the user, never a repository's settings.
      mermaidAllowInUntrustedWorkspaces:
        config.inspect<boolean>('integrations.mermaid.allowInUntrustedWorkspaces')?.globalValue ===
        true,
      toolbarMode: config.get('toolbar.mode', DEFAULT_CONFIG.toolbarMode),
      contentWidth: normalizeContentWidthSetting(
        config.get<unknown>('appearance.contentWidth', DEFAULT_CONFIG.contentWidth),
      ),
      imageDestination: config.get('images.destination', DEFAULT_CONFIG.imageDestination),
    };
  }
}
