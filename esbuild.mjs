import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build, context } from 'esbuild';

const isWatch = process.argv.includes('--watch');
const isProduction = process.argv.includes('--production');
const workspaceRoot = path.dirname(fileURLToPath(import.meta.url));
for (const relative of ['dist', 'media/generated']) {
  const target = path.resolve(relative);
  if (target !== path.resolve(workspaceRoot, relative))
    throw new Error('Unsafe generated output directory');
  fs.rmSync(target, { recursive: true, force: true });
}

const extensionBuildOptions = {
  entryPoints: {
    extension: 'src/extension.ts',
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outdir: 'dist',
  entryNames: '[name]',
  external: ['vscode'],
  sourcemap: !isProduction,
  minify: isProduction,
  metafile: true,
  legalComments: 'external',
  logLevel: 'info',
};

const webviewBuildOptions = {
  entryPoints: {
    'editor-webview': 'src/webview/editor/index.ts',
  },
  bundle: true,
  platform: 'browser',
  format: 'esm',
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]',
  target: ['chrome114'],
  outdir: 'media/generated',
  entryNames: '[name]',
  sourcemap: !isProduction,
  minify: isProduction,
  metafile: true,
  legalComments: 'external',
  loader: {
    '.css': 'css',
    '.ttf': 'file',
  },
  logLevel: 'info',
};

if (isWatch) {
  const [extensionContext, webviewContext] = await Promise.all([
    context(extensionBuildOptions),
    context(webviewBuildOptions),
  ]);
  await Promise.all([extensionContext.watch(), webviewContext.watch()]);
} else {
  const results = await Promise.all([build(extensionBuildOptions), build(webviewBuildOptions)]);
  if (isProduction) {
    fs.mkdirSync('artifacts/build', { recursive: true });
    fs.writeFileSync(
      'artifacts/build/metafile.json',
      JSON.stringify(
        results.map((result) => result.metafile),
        null,
        2,
      ),
    );
    const initial = results[1].metafile.outputs['media/generated/editor-webview.js'].bytes;
    const total = results
      .flatMap((result) => Object.values(result.metafile.outputs))
      .reduce((sum, entry) => sum + entry.bytes, 0);
    if (initial > 600 * 1024 || total > 8 * 1024 * 1024)
      throw new Error('Production bundle exceeds budget: ' + JSON.stringify({ initial, total }));
    console.log('Production bytes: ' + JSON.stringify({ initial, total }));
    const { writeNotices } = await import('./scripts/third-party-notices.mjs');
    writeNotices(results.map((result) => result.metafile));
  }
}
