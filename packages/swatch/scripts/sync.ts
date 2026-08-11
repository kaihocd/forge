import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createPackageSyncEntries, syncPackage } from './lib/sync.js';

try {
  const args = new Set(process.argv.slice(2));
  const preview = args.delete('--preview');
  const planDirectoryArgument = [...args].find((arg) => arg.startsWith('--plan-dir='));
  if (planDirectoryArgument) args.delete(planDirectoryArgument);
  if (args.size > 0) throw new Error(`unknown argument: ${[...args].join(', ')}`);
  if (planDirectoryArgument) {
    if (preview) throw new Error('--preview and --plan-dir cannot be used together');
    const planDirectory = planDirectoryArgument.slice('--plan-dir='.length);
    if (!path.isAbsolute(planDirectory)) throw new Error('--plan-dir must be absolute');
    await mkdir(planDirectory, { recursive: true });
    await writeFile(
      path.join(planDirectory, 'swatch.json'),
      `${JSON.stringify(createPackageSyncEntries())}\n`,
    );
  } else {
    await syncPackage(undefined, undefined, preview);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
