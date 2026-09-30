// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { formatString, getString } from './localization';

export const getEditorAriaLabel = (fileName: string): string => {
  const trimmedFileName = fileName.trim();
  if (trimmedFileName.length === 0) {
    return getString('editorAriaLabel');
  }
  return formatString(getString('editorAriaLabelTemplate'), trimmedFileName);
};

export const getEditorViewAttributes = (fileName: string): Record<string, string> => ({
  'aria-label': getEditorAriaLabel(fileName),
  'aria-multiline': 'true',
  role: 'textbox',
});
