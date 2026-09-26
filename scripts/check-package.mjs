// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import yauzl from 'yauzl';

const manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const file = process.env.MUNINN_VSIX || `muninn-vscode-${manifest.version}.vsix`;
// Validate and hash the same immutable snapshot, even if another build replaces the file.
const archiveBytes = fs.readFileSync(file);
assert.ok(archiveBytes.length <= 3 * 1024 * 1024, 'VSIX exceeds 3 MiB');
const entries = new Map();
const zip = await new Promise((resolve, reject) =>
  yauzl.fromBuffer(archiveBytes, { lazyEntries: true }, (error, value) =>
    error ? reject(error) : resolve(value),
  ),
);
await new Promise((resolve, reject) => {
  zip.on('error', reject);
  zip.on('end', resolve);
  zip.on('entry', (entry) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error) return reject(error);
      const buffers = [];
      stream.on('data', (data) => buffers.push(data));
      stream.on('error', reject);
      stream.on('end', () => {
        entries.set(entry.fileName, Buffer.concat(buffers));
        zip.readEntry();
      });
    });
  });
  zip.readEntry();
});
const packaged = JSON.parse(entries.get('extension/package.json').toString());
assert.equal(packaged.version, manifest.version);
assert.match(packaged.version, /^\d+\.\d+\.\d+$/);
assert.match(
  entries.get('extension.vsixmanifest').toString(),
  /Microsoft\.VisualStudio\.Code\.PreRelease" Value="true"/,
);
for (const required of [
  'dist/extension.js',
  'media/generated/editor-webview.js',
  'media/generated/editor-webview.css',
  'LICENSE.txt',
  'THIRD_PARTY_NOTICES.md',
]) {
  assert.ok(entries.has('extension/' + required), 'Missing packaged asset: ' + required);
}
for (const name of entries.keys()) {
  assert.doesNotMatch(
    name,
    /(?:\.map$|package-lock\.json$|\/node_modules\/|\/graphify-out\/|\/artifacts\/|\/src\/|\/tests\/|\/\.agents\/)/,
  );
  if (name.startsWith('extension/media/')) assert.ok(name.startsWith('extension/media/generated/'));
}
const entry = entries.get('extension/media/generated/editor-webview.js');
assert.ok(entry.length <= 600 * 1024, 'Initial editor exceeds 600 KiB');
fs.mkdirSync('artifacts/build', { recursive: true });
const report = {
  file,
  sha256: crypto.createHash('sha256').update(archiveBytes).digest('hex'),
  bytes: archiveBytes.length,
  initialEditorBytes: entry.length,
  files: entries.size,
};
fs.writeFileSync('artifacts/build/package-report.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
