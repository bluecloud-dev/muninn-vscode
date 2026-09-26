import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@vscode/test-cli';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const runRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'muninn-vscode-test-'));
const workspaceFolder = path.join(runRoot, 'workspace');
const userDataDir = path.join(runRoot, 'user-data');
const extensionsDir = path.join(runRoot, 'extensions');
const sharedDataArgs =
  process.env.VSCODE_VERSION === '1.85.2'
    ? []
    : [`--shared-data-dir=${path.join(runRoot, 'shared')}`];
const fixturesRoot = path.join(__dirname, 'tests', 'fixtures');

fs.mkdirSync(runRoot, { recursive: true });
if (fs.existsSync(workspaceFolder)) {
  fs.rmSync(workspaceFolder, { recursive: true, force: true });
}
fs.cpSync(fixturesRoot, workspaceFolder, { recursive: true });

export default defineConfig({
  files: ['out/tests/integration-cli/**/*.test.js'],
  version: process.env.VSCODE_VERSION ?? 'stable',
  extensionDevelopmentPath: __dirname,
  workspaceFolder,
  launchArgs: [
    ...sharedDataArgs,
    '--disable-extensions',
    '--disable-workspace-trust',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    `--user-data-dir=${userDataDir}`,
    `--extensions-dir=${extensionsDir}`,
  ],
  mocha: {
    ui: 'bdd',
    color: true,
    timeout: 30_000,
  },
});
