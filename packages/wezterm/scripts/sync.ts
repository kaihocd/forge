import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expandHome, loadManifestSyncEntries } from '@forge/shared';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const namespace = 'wezterm';

function planDirectory(): string {
  const argument = process.argv.find((arg) => arg.startsWith('--plan-dir='));
  if (!argument) throw new Error('missing --plan-dir');
  const directory = argument.slice('--plan-dir='.length);
  if (!path.isAbsolute(directory)) throw new Error('--plan-dir must be absolute');
  return directory;
}

try {
  const manifestPath = path.join(packageRoot, 'forge.yaml');
  const entries = (await loadManifestSyncEntries(manifestPath, packageRoot, namespace)).map(
    (entry) => ({ ...entry, target: expandHome(entry.target) }),
  );
  const directory = planDirectory();
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, `${namespace}.json`), `${JSON.stringify(entries)}\n`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
