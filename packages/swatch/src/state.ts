// Manages the selected Swatch theme through the Forge State Hub.

import { StateClient } from '@forge/state';

import { themeSchema, type CatalogManifest, type Theme } from './schema.js';

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

const selectionKey = 'swatch.selection';
const themeKey = 'swatch.theme';

export async function readCurrentTheme(
  manifest: CatalogManifest,
  readTheme: (themeId: string) => Promise<Theme>,
  client: StateClient = new StateClient(),
): Promise<Theme> {
  const values = await readStateKeys(client, [themeKey, selectionKey]);

  const theme = values[themeKey];
  if (isTheme(theme)) return theme;

  const selection = values[selectionKey];
  if (isSelection(selection)) {
    assertThemeInCatalog(selection.id, manifest);
    const resolved = await readTheme(selection.id);
    await writeCurrentTheme(client, resolved);
    return resolved;
  }

  const defaultTheme = await readTheme(manifest.defaultTheme);
  await writeCurrentTheme(client, defaultTheme);
  return defaultTheme;
}

export async function selectCurrentTheme(
  themeId: string,
  manifest: CatalogManifest,
  readTheme: (themeId: string) => Promise<Theme>,
  client: StateClient = new StateClient(),
): Promise<void> {
  assertThemeInCatalog(themeId, manifest);

  const currentId = await readCurrentSelection(client);
  if (currentId === themeId) {
    return;
  }

  const theme = await readTheme(themeId);

  try {
    await writeCurrentTheme(client, theme);
  } catch (error) {
    throw new StateError(
      `Failed to write current theme state: ${error instanceof Error ? error.message : String(error)}`,
      'write',
      { cause: error },
    );
  }
}

async function readStateKeys(
  client: StateClient,
  keys: string[],
): Promise<Record<string, unknown>> {
  try {
    return await client.get(keys);
  } catch (error) {
    throw new StateError(
      `Failed to read current theme state: ${error instanceof Error ? error.message : String(error)}`,
      'read',
      { cause: error },
    );
  }
}

async function writeCurrentTheme(client: StateClient, theme: Theme): Promise<void> {
  await client.set(selectionKey, { id: theme.id });
  await client.set(themeKey, theme);
}

function assertThemeInCatalog(themeId: string, manifest: CatalogManifest): void {
  if (!manifest.themes.includes(themeId)) {
    throw new StateError(`Current theme ${themeId} is not in the catalog manifest`, 'invalid');
  }
}

async function readCurrentSelection(client: StateClient): Promise<string | undefined> {
  try {
    const values = await client.get([selectionKey]);
    const selection = values[selectionKey];
    if (isSelection(selection)) return selection.id;
  } catch {
    // If the selection cannot be read, proceed as if it were missing.
  }
  return undefined;
}

function isTheme(value: unknown): value is Theme {
  return themeSchema.safeParse(value).success;
}

function isSelection(value: unknown): value is { id: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof (value as { id: unknown }).id === 'string'
  );
}
