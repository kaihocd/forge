// Compiles the CLI, validates the complete output, and replaces dist.

import { spawnSync } from 'node:child_process';
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { catalogManifestSchema } from '../../src/schema.js';
import { writeZshCompletion } from './completion.js';
import { recoverDirectoryReplacement, replaceDirectory } from './directories.js';
import { readSchemesCache } from './schemes.js';
import { processTheme } from './themes.js';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const buildDirectory = path.join(packageRoot, '.build');
const distDirectory = path.join(packageRoot, 'dist');
const backupDirectory = path.join(packageRoot, '.dist-backup');
const defaultTheme = 'default-dark';

export async function buildPackage(): Promise<void> {
  await recoverDirectoryReplacement(distDirectory, backupDirectory);
  await rm(buildDirectory, { force: true, recursive: true });

  compileCli();
  const manifest = await buildCatalog(path.join(buildDirectory, 'catalog'));
  await Promise.all([
    chmod(path.join(buildDirectory, 'cli.js'), 0o755),
    writeZshCompletion(path.join(buildDirectory, 'completions', '_swatch'), manifest),
  ]);
  await publishDist();
}

async function buildCatalog(destination: string) {
  const { revision, schemes } = await readSchemesCache().catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      throw new Error(
        'Scheme cache is missing. Run `pnpm --filter @forge/swatch schemes:fetch` first.',
        { cause: error },
      );
    }
    throw error;
  });

  const manifest = catalogManifestSchema.parse({
    revision,
    defaultTheme,
    themes: schemes.map(({ id }) => id).sort(),
  });
  // Finish every fallible transformation before starting any catalog writes.
  const themes = schemes.map((scheme) => processTheme(scheme));

  await mkdir(destination, { recursive: true });

  await Promise.all([
    ...themes.map((theme) => writeJson(path.join(destination, `${theme.id}.json`), theme)),
    writeJson(path.join(destination, 'manifest.json'), manifest),
  ]);

  return manifest;
}

function compileCli(): void {
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const result = spawnSync(pnpm, ['exec', 'tsc', '-p', 'tsconfig.build.json'], {
    cwd: packageRoot,
    stdio: 'inherit',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`CLI compilation failed with exit code ${result.status ?? 1}`);
  }
}

async function publishDist(): Promise<void> {
  await replaceDirectory(buildDirectory, distDirectory, backupDirectory);
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
