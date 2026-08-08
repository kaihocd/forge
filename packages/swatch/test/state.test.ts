// Verifies current-theme initialization, validation, repair, and atomic publication.

import { lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CatalogManifest } from '../src/schema.js';
import {
  currentStatePath,
  readOrInitializeCurrentThemeId,
  selectCurrentTheme,
  StateError,
} from '../src/state.js';

const manifest: CatalogManifest = {
  revision: 'a'.repeat(40),
  defaultTheme: 'default-dark',
  themes: ['default-dark', 'one-dark'],
};
let directory: string;
let statePath: string;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'swatch-state-test-'));
  statePath = path.join(directory, 'state', 'current.json');
});

afterEach(async () => {
  await rm(directory, { force: true, recursive: true });
});

describe('readOrInitializeCurrentThemeId', () => {
  it('resolves current state under the Forge data directory in the user home', () => {
    expect(currentStatePath('/Users/example')).toBe(
      path.join('/Users/example', '.forge', 'swatch', 'current.json'),
    );
  });

  it('validates and atomically initializes the catalog default when missing', async () => {
    const validateTheme = vi.fn(async () => undefined);

    await expect(readOrInitializeCurrentThemeId(manifest, validateTheme, statePath)).resolves.toBe(
      'default-dark',
    );
    expect(validateTheme).toHaveBeenCalledWith('default-dark');
    expect(await readFile(statePath, 'utf8')).toBe('{\n  "id": "default-dark"\n}\n');
    expect((await lstat(path.dirname(statePath))).mode & 0o777).toBe(0o700);
    expect((await lstat(statePath)).mode & 0o777).toBe(0o600);
    expect(await rmTemporaryFiles()).toEqual([]);
  });

  it('reads and validates an existing selection without rewriting it', async () => {
    await selectCurrentTheme('one-dark', manifest, statePath);
    const before = await lstat(statePath);

    await expect(
      readOrInitializeCurrentThemeId(manifest, async () => undefined, statePath),
    ).resolves.toBe('one-dark');
    expect((await lstat(statePath)).mtimeMs).toBe(before.mtimeMs);
  });

  it('rejects malformed, invalid, and dangling state without replacing it', async () => {
    for (const contents of ['{', '{}', '{"id":"missing"}\n']) {
      await writeFile(statePath, contents, { flag: 'w' }).catch(
        async (error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') throw error;
          await selectCurrentTheme('one-dark', manifest, statePath);
          await writeFile(statePath, contents);
        },
      );

      await expect(
        readOrInitializeCurrentThemeId(manifest, async () => undefined, statePath),
      ).rejects.toThrow(StateError);
      expect(await readFile(statePath, 'utf8')).toBe(contents);
    }
  });
});

describe('selectCurrentTheme', () => {
  it('does not rewrite an unchanged valid selection', async () => {
    await selectCurrentTheme('one-dark', manifest, statePath);
    const before = await lstat(statePath);

    await selectCurrentTheme('one-dark', manifest, statePath);

    expect((await lstat(statePath)).mtimeMs).toBe(before.mtimeMs);
  });

  it('repairs invalid content when the new selection is valid', async () => {
    await selectCurrentTheme('one-dark', manifest, statePath);
    await writeFile(statePath, '{');

    await selectCurrentTheme('default-dark', manifest, statePath);

    expect(JSON.parse(await readFile(statePath, 'utf8'))).toEqual({ id: 'default-dark' });
  });

  it('rejects an unknown selection without changing existing state', async () => {
    await selectCurrentTheme('one-dark', manifest, statePath);
    const before = await readFile(statePath, 'utf8');

    await expect(selectCurrentTheme('missing', manifest, statePath)).rejects.toThrow(
      'Current theme missing is not in the catalog manifest',
    );
    expect(await readFile(statePath, 'utf8')).toBe(before);
  });
});

async function rmTemporaryFiles(): Promise<string[]> {
  const entries = await import('node:fs/promises').then(({ readdir }) =>
    readdir(path.dirname(statePath)),
  );
  return entries.filter((entry) => entry !== path.basename(statePath));
}
