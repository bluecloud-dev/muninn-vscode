// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

export type ContentWidthSetting = 'comfortable' | 'full' | number;

export interface ExtensionConfiguration {
  editorAssociations: boolean;
  mermaidEnabled: boolean;
  mermaidAllowInUntrustedWorkspaces: boolean;
  toolbarMode: 'basic' | 'advanced';
  contentWidth: ContentWidthSetting;
  imageDestination: string;
}
