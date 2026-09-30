// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { formatString, getString } from './localization';

export type AnnouncementKind = 'status' | 'error';

export type Announce = (
  message: string,
  options: {
    kind: AnnouncementKind;
  },
) => void;

type AnnouncerElements = {
  statusLine: HTMLElement;
  alertLine: HTMLElement;
};

export const formatErrorAnnouncement = (message: string): string =>
  formatString(getString('statusErrorTemplate'), message);

export const createAnnouncer = ({ statusLine, alertLine }: AnnouncerElements): Announce => {
  return (message, { kind }) => {
    if (kind === 'error') {
      statusLine.textContent = '';
      statusLine.hidden = true;
      alertLine.textContent = formatErrorAnnouncement(message);
      alertLine.hidden = false;
      return;
    }

    alertLine.textContent = '';
    alertLine.hidden = true;
    statusLine.textContent = message;
    statusLine.hidden = false;
  };
};
