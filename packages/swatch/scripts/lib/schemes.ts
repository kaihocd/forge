// Defines, fetches, reads, and validates upstream Base16 schemes.

import { execFile } from 'node:child_process';
import { lstat, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { parse } from 'yaml';
import { z } from 'zod';

import { themeIdSchema } from '../../src/schema.js';
import { recoverDirectoryReplacement, replaceDirectory } from './directories.js';
import { processTheme } from './themes.js';

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const base16Keys = [
  'base00',
  'base01',
  'base02',
  'base03',
  'base04',
  'base05',
  'base06',
  'base07',
  'base08',
  'base09',
  'base0A',
  'base0B',
  'base0C',
  'base0D',
  'base0E',
  'base0F',
] as const;
const inputHexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const schemesRepository = 'https://github.com/tinted-theming/schemes.git';
export const schemesRevision = 'spec-0.11';
export const schemesCacheDirectory = path.join(packageRoot, '.cache', 'schemes');
export const base16PaletteSchema = z.object(
  Object.fromEntries(base16Keys.map((key) => [key, inputHexColorSchema])) as {
    [Key in (typeof base16Keys)[number]]: z.ZodString;
  },
);
export const rawSchemeSchema = z.object({
  system: z.literal('base16'),
  name: z.string().min(1),
  author: z.string().optional(),
  variant: z.enum(['dark', 'light']),
  slug: z.string().optional(),
  description: z.string().optional(),
  palette: base16PaletteSchema,
});

export type RawScheme = z.infer<typeof rawSchemeSchema>;

export interface FetchedScheme {
  id: string;
  source: string;
  scheme: RawScheme;
}

interface FetchSchemesOptions {
  destination: string;
  repository?: string;
  revision?: string;
}

export interface FetchSchemesResult {
  revision: string;
  schemes: FetchedScheme[];
}

interface RefreshSchemesCacheOptions {
  cacheDirectory?: string;
  repository?: string;
  revision?: string;
}

interface EnsureSchemesCacheOptions extends RefreshSchemesCacheOptions {}

export async function readBase16Schemes(directory: string): Promise<FetchedScheme[]> {
  const fileNames = (await readdir(directory))
    .filter((fileName) => /\.ya?ml$/i.test(fileName))
    .sort();
  if (fileNames.length === 0) {
    throw new Error(`No Base16 YAML schemes found in ${directory}`);
  }

  const seenIds = new Set<string>();
  const schemes: FetchedScheme[] = [];

  for (const fileName of fileNames) {
    const source = path.posix.join('base16', fileName);
    const id = path.basename(fileName, path.extname(fileName));

    try {
      themeIdSchema.parse(id);
      if (seenIds.has(id)) {
        throw new Error(`duplicate theme ID ${id}`);
      }

      const contents = await readFile(path.join(directory, fileName), 'utf8');
      const scheme = rawSchemeSchema.parse(parse(contents));
      seenIds.add(id);
      schemes.push({ id, source, scheme });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load ${source}: ${message}`, { cause: error });
    }
  }

  return schemes;
}

export async function readSchemesCache(
  cacheDirectory = schemesCacheDirectory,
): Promise<FetchSchemesResult> {
  const before = await inspectSchemesCache(cacheDirectory);
  assertCleanSchemesCache(before.status);
  const schemes = await readBase16Schemes(path.join(cacheDirectory, 'base16'));
  const after = await inspectSchemesCache(cacheDirectory);
  assertCleanSchemesCache(after.status);

  if (before.revision !== after.revision) {
    throw new Error('Cached scheme revision changed while it was being read');
  }

  return { revision: before.revision, schemes };
}

async function fetchSchemes({
  destination,
  repository = schemesRepository,
  revision = schemesRevision,
}: FetchSchemesOptions): Promise<FetchSchemesResult> {
  await execFileAsync(
    'git',
    ['clone', '--depth', '1', '--single-branch', '--branch', revision, repository, destination],
    { maxBuffer: 10 * 1024 * 1024 },
  );

  return readSchemesCache(destination);
}

export async function refreshSchemesCache({
  cacheDirectory = schemesCacheDirectory,
  repository = schemesRepository,
  revision = schemesRevision,
}: RefreshSchemesCacheOptions = {}): Promise<FetchSchemesResult> {
  const cacheParent = path.dirname(cacheDirectory);
  const buildDirectory = path.join(cacheParent, '.schemes-build');
  const backupDirectory = path.join(cacheParent, '.schemes-backup');

  await mkdir(cacheParent, { recursive: true });
  await recoverDirectoryReplacement(cacheDirectory, backupDirectory);
  await rm(buildDirectory, { force: true, recursive: true });

  try {
    const result = await fetchSchemes({ destination: buildDirectory, repository, revision });
    validateProcessableSchemes(result);
    await replaceDirectory(buildDirectory, cacheDirectory, backupDirectory);
    return result;
  } finally {
    await rm(buildDirectory, { force: true, recursive: true });
  }
}

export async function ensureSchemesCache(
  options: EnsureSchemesCacheOptions = {},
): Promise<{ initialized: boolean; result: FetchSchemesResult }> {
  const cacheDirectory = options.cacheDirectory ?? schemesCacheDirectory;
  const backupDirectory = path.join(path.dirname(cacheDirectory), '.schemes-backup');
  await recoverDirectoryReplacement(cacheDirectory, backupDirectory);

  try {
    await lstat(cacheDirectory);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      const result = await refreshSchemesCache(options);
      return { initialized: true, result };
    }
    throw error;
  }

  // Existing input is never refreshed implicitly: local changes or corruption
  // must remain visible until the user explicitly chooses schemes:fetch.
  const result = await readSchemesCache(cacheDirectory);
  validateProcessableSchemes(result);
  return { initialized: false, result };
}

function validateProcessableSchemes(result: FetchSchemesResult): void {
  for (const scheme of result.schemes) processTheme(scheme);
}

async function inspectSchemesCache(
  cacheDirectory: string,
): Promise<{ revision: string; status: string }> {
  const [{ stdout: revision }, { stdout: status }] = await Promise.all([
    execFileAsync('git', ['-C', cacheDirectory, 'rev-parse', 'HEAD']),
    execFileAsync('git', [
      '-C',
      cacheDirectory,
      'status',
      '--porcelain',
      '--untracked-files=all',
      '--',
      'base16',
    ]),
  ]);

  return { revision: revision.trim(), status: status.trim() };
}

function assertCleanSchemesCache(status: string): void {
  if (status) {
    throw new Error(
      `Cached Base16 schemes contain uncommitted changes:\n${status}\nRun \`pnpm --filter @forge/swatch schemes:fetch\` to restore the cache.`,
    );
  }
}
