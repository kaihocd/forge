// Reads and validates the built catalog without depending on the current directory.

import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  catalogManifestSchema,
  themeIdSchema,
  themeSchema,
  type CatalogManifest,
  type Theme,
} from './schema.js';

const defaultCatalogDirectory = fileURLToPath(new URL('./catalog/', import.meta.url));

export class CatalogError extends Error {
  override readonly name = 'CatalogError';
}

export async function readManifest(
  catalogDirectory = defaultCatalogDirectory,
): Promise<CatalogManifest> {
  const input = await readCatalogJson(
    new URL('manifest.json', directoryUrl(catalogDirectory)),
    'catalog manifest',
  );
  const result = catalogManifestSchema.safeParse(input);

  if (!result.success) {
    throw new CatalogError(`Invalid catalog manifest: ${result.error.message}`);
  }

  return result.data;
}

export async function readTheme(
  themeId: string,
  catalogDirectory = defaultCatalogDirectory,
): Promise<Theme> {
  if (!themeIdSchema.safeParse(themeId).success) {
    throw new CatalogError(`Invalid theme ID: ${themeId}`);
  }

  const manifest = await readManifest(catalogDirectory);
  if (!manifest.themes.includes(themeId)) {
    throw new CatalogError(`Theme ${themeId} is not in the catalog manifest`);
  }

  const input = await readCatalogJson(
    new URL(`${themeId}.json`, directoryUrl(catalogDirectory)),
    `theme ${themeId}`,
  );
  const result = themeSchema.safeParse(input);

  if (!result.success) {
    throw new CatalogError(`Invalid theme ${themeId}: ${result.error.message}`);
  }
  if (result.data.id !== themeId) {
    throw new CatalogError(`Theme ID mismatch: requested ${themeId}, found ${result.data.id}`);
  }

  return result.data;
}

async function readCatalogJson(fileUrl: URL, label: string): Promise<unknown> {
  let contents: string;

  try {
    contents = await readFile(fileUrl, 'utf8');
  } catch (error) {
    if (isFileNotFound(error)) {
      const buildHint = label === 'catalog manifest' ? '. Run `pnpm build` first' : '';
      throw new CatalogError(`Missing ${label}${buildHint}`);
    }
    throw new CatalogError(`Failed to read ${label}`, { cause: error });
  }

  try {
    return JSON.parse(contents);
  } catch (error) {
    throw new CatalogError(`Invalid JSON in ${label}`, { cause: error });
  }
}

function directoryUrl(directory: string): URL {
  return new URL('./', pathToFileURL(`${directory}/placeholder`));
}

function isFileNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}
