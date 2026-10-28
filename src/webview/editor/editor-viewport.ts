// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { ContentWidthSetting } from '../../types/config';

export const zoomLevels = Array.from({ length: 16 }, (_, index) => 50 + index * 10);

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
          zoomPercent = Math.min(zoomLevels.at(-1)!, zoomPercent + 10);
          break;
        }
        case 'zoomOut': {
          zoomPercent = Math.max(zoomLevels[0], zoomPercent - 10);
          break;
        }
        case 'fitToWidth': {
          fitToWidth = true;
          zoomPercent = 100;
          break;
        }
        default: {
          // An exact level also leaves fit and restores the configured reading width.
          const level = zoomLevels.find((percent) => command === 'setZoom' + percent);
          if (level === undefined) return false;
          fitToWidth = false;
          zoomPercent = level;
        }
      }
      apply();
      return true;
    },
  };
};
