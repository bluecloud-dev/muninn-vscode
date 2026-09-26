// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import * as vscode from 'vscode';

export class Logger {
  constructor(private readonly channel: vscode.OutputChannel) {}

  private getTimestamp(): string {
    return new Date().toISOString();
  }

  private formatMessage(level: string, message: string): string {
    return `[${this.getTimestamp()}] [${level}] ${message}`;
  }

  info(message: string): void {
    this.channel.appendLine(this.formatMessage('INFO', message));
  }

  warn(message: string): void {
    this.channel.appendLine(this.formatMessage('WARN', message));
  }

  error(message: string, error?: unknown): void {
    this.channel.appendLine(this.formatMessage('ERROR', message));
    if (error instanceof Error) {
      this.channel.appendLine(`  Stack: ${error.stack ?? error.message}`);
      return;
    }
    if (error !== undefined) {
      this.channel.appendLine(`  Details: ${String(error)}`);
    }
  }

  show(preserveFocus = true): void {
    this.channel.show(preserveFocus);
  }
}
