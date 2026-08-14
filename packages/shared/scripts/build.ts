// Builds the shared Forge utilities distribution.

import { mkdir, rename, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildDirectory = path.join(packageRoot, '.build');
const distDirectory = path.join(packageRoot, 'dist');

try {
  await rm(buildDirectory, { force: true, recursive: true });
  await mkdir(buildDirectory, { recursive: true });

  const result = spawnSync('pnpm', ['exec', 'tsc', '-p', 'tsconfig.build.json'], {
    cwd: packageRoot,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`build failed with exit code ${result.status ?? 1}`);

  await rm(distDirectory, { force: true, recursive: true });
  await rename(buildDirectory, distDirectory);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
