// Stores the selected theme ID separately from the built catalog data.

import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import { currentStateSchema, type CatalogManifest, type CurrentState } from './schema.js';

export class StateError extends Error {
  override readonly name = 'StateError';

  constructor(
    message: string,
    readonly kind: 'invalid' | 'read' | 'write',
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export function currentStatePath(homeDirectory = homedir()): string {
  return path.join(homeDirectory, '.forge', 'swatch', 'current.json');
}

export async function readOrInitializeCurrentThemeId(
  manifest: CatalogManifest,
  validateTheme: (themeId: string) => Promise<unknown>,
  filePath = currentStatePath(),
): Promise<string> {
  const state = await readCurrentState(filePath);

  if (!state) {
    await validateTheme(manifest.defaultTheme);
    await writeCurrentState(filePath, { id: manifest.defaultTheme });
    return manifest.defaultTheme;
  }

  assertThemeInCatalog(state.id, manifest);
  await validateTheme(state.id);
  return state.id;
}

export async function selectCurrentTheme(
  themeId: string,
  manifest: CatalogManifest,
  filePath = currentStatePath(),
): Promise<void> {
  assertThemeInCatalog(themeId, manifest);

  let state: CurrentState | undefined;
  try {
    state = await readCurrentState(filePath);
  } catch (error) {
    if (!(error instanceof StateError) || error.kind !== 'invalid') throw error;
  }

  if (state?.id === themeId) return;
  await writeCurrentState(filePath, { id: themeId });
}

async function readCurrentState(filePath: string): Promise<CurrentState | undefined> {
  let contents: string;

  try {
    const stats = await lstat(filePath);
    if (!stats.isFile()) {
      throw new StateError(`Current theme state is not a regular file: ${filePath}`, 'read');
    }
    contents = await readFile(filePath, 'utf8');
  } catch (error) {
    if (isFileNotFound(error)) return undefined;
    if (error instanceof StateError) throw error;
    throw new StateError(`Failed to read current theme state: ${filePath}`, 'read', {
      cause: error,
    });
  }

  let input: unknown;
  try {
    input = JSON.parse(contents);
  } catch (error) {
    throw new StateError(`Invalid JSON in current theme state: ${filePath}`, 'invalid', {
      cause: error,
    });
  }

  const result = currentStateSchema.safeParse(input);
  if (!result.success) {
    throw new StateError(
      `Invalid current theme state: ${filePath}: ${result.error.message}`,
      'invalid',
    );
  }
  return result.data;
}

function assertThemeInCatalog(themeId: string, manifest: CatalogManifest): void {
  if (!manifest.themes.includes(themeId)) {
    throw new StateError(`Current theme ${themeId} is not in the catalog manifest`, 'invalid');
  }
}

async function writeCurrentState(filePath: string, state: CurrentState): Promise<void> {
  const directory = path.dirname(filePath);
  const temporaryPath = path.join(directory, `.${path.basename(filePath)}.${randomUUID()}.tmp`);

  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
      flag: 'wx',
      mode: 0o600,
    });
    await rename(temporaryPath, filePath);
  } catch (error) {
    throw new StateError(`Failed to write current theme state: ${filePath}`, 'write', {
      cause: error,
    });
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

function isFileNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}
