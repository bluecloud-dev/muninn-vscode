// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { build } from 'esbuild';

// Compile before NYC starts: synchronous esbuild workers can deadlock under spawn wrapping.
await build({
  entryPoints: ['src/webview/editor/index.ts'],
  bundle: true,
  outfile: 'artifacts/test-editor.js',
  format: 'iife',
  platform: 'browser',
  minify: true,
  loader: { '.css': 'empty' },
  logLevel: 'silent',
});
