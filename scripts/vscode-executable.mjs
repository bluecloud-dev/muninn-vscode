// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export function resolveVSCodeExecutable(downloaded) {
  if (process.platform !== 'darwin') return downloaded;
  const contents = path.dirname(path.dirname(downloaded));
  const executable = execFileSync(
    '/usr/bin/plutil',
    ['-extract', 'CFBundleExecutable', 'raw', '-o', '-', path.join(contents, 'Info.plist')],
    { encoding: 'utf8' },
  ).trim();
  assert.ok(executable && path.basename(executable) === executable, 'Invalid bundle executable');
  return path.join(contents, 'MacOS', executable);
}
