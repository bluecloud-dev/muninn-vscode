// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { ContentWidthSetting } from '../../types/config';

export const createEditorViewport = (shell: HTMLElement, surface: HTMLElement) => {
  let contentWidth: ContentWidthSetting = 'comfortable';
  let zoomPercent = 100;
  let fitToWidth = false;
  const apply = (): void => {
    const width = fitToWidth ? 'full' : contentWidth;
    let cssWidth = `${width}ch`;
    if (width === 'comfortable') cssWidth = '70ch';
    else if (width === 'full') cssWidth = 'none';
    shell.style.setProperty('--muninn-content-width', cssWidth);
    surface.style.zoom = String(zoomPercent / 100);
  };
  apply();
  return {
    get zoomPercent() {
      return zoomPercent;
    },
    get fitToWidth() {
      return fitToWidth;
    },
    setContentWidth(setting: ContentWidthSetting): void {
      contentWidth = setting;
      apply();
    },
    execute(command: string): boolean {
      switch (command) {
        case 'zoomIn': {
          zoomPercent = Math.min(200, zoomPercent + 10);
          break;
        }
        case 'zoomOut': {
          zoomPercent = Math.max(50, zoomPercent - 10);
          break;
        }
        case 'fitToWidth':
        case 'resetZoom': {
          fitToWidth = command === 'fitToWidth';
          zoomPercent = 100;
          break;
        }
        default: {
          return false;
        }
      }
      apply();
      return true;
    },
  };
};
