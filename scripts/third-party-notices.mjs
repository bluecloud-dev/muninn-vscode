// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs';
import path from 'node:path';

/** Gather license text from packages actually present in the production bundles. */
export function writeNotices(metafiles) {
  const packages = new Map();
  for (const input of metafiles.flatMap((meta) => Object.keys(meta.inputs))) {
    if (!input.includes('node_modules/')) continue;
    let folder = path.dirname(path.resolve(input));
    while (folder.includes('node_modules')) {
      const manifest = path.join(folder, 'package.json');
      if (fs.existsSync(manifest)) {
        const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
        if (pkg.name && pkg.version) {
          const licenses = fs
            .readdirSync(folder)
            .filter(
              (name) =>
                /^(?:licen[cs]e|copying|notice)(?:[-.]|$)/i.test(name) &&
                fs.statSync(path.join(folder, name)).isFile(),
            );
          if (licenses.length === 0) throw new Error('Missing bundled license text: ' + pkg.name);
          const body = licenses
            .sort()
            .map((name) =>
              fs
                .readFileSync(path.join(folder, name), 'utf8')
                .replaceAll('\r\n', '\n')
                .replaceAll(/[ \t]+$/gm, '')
                .trim(),
            )
            .join('\n\n');
          packages.set(`${pkg.name}@${pkg.version}`, { license: pkg.license, body });
          break;
        }
      }
      folder = path.dirname(folder);
    }
  }
  const sections = [...packages.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, pkg]) => '## ' + name + '\n\nLicense: ' + pkg.license + '\n\n' + pkg.body);
  fs.writeFileSync(
    'THIRD_PARTY_NOTICES.md',
    '# Third-party notices\n\nGenerated from the production bundle dependency graph. Muninn source is available at https://github.com/bluecloud-dev/muninn-vscode under AGPL-3.0-only.\n\n' +
      sections.join('\n\n---\n\n') +
      '\n',
  );
}
