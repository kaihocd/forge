// Verifies runtime catalog loading, validation, and safe theme lookup.

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CatalogError, readManifest, readTheme } from '../src/catalog.js';

const revision = 'a'.repeat(40);
const palette = Object.fromEntries(
  [
    '00',
    '01',
    '02',
    '03',
    '04',
    '05',
    '06',
    '07',
    '08',
    '09',
    '0A',
    '0B',
    '0C',
    '0D',
    '0E',
    '0F',
    '10',
    '11',
    '12',
    '13',
    '14',
    '15',
    '16',
    '17',
  ].map((suffix) => [`base${suffix}`, '#abcdef']),
);
let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'swatch-catalog-test-'));
});

afterEach(async () => {
  await rm(directory, { force: true, recursive: true });
});

describe('readManifest', () => {
  it('reads a valid catalog manifest', async () => {
    await writeManifest(['alpha', 'beta']);

    await expect(readManifest(directory)).resolves.toEqual({
      revision,
      defaultTheme: 'alpha',
      themes: ['alpha', 'beta'],
    });
  });

  it('rejects missing and malformed manifests with catalog errors', async () => {
    await expect(readManifest(directory)).rejects.toThrow(CatalogError);
    await writeFile(path.join(directory, 'manifest.json'), '{');
    await expect(readManifest(directory)).rejects.toThrow('Invalid JSON in catalog manifest');
  });

  it('rejects duplicate, unsorted, and extra manifest data', async () => {
    await writeJson('manifest.json', {
      revision,
      defaultTheme: 'alpha',
      themes: ['alpha', 'alpha'],
    });
    await expect(readManifest(directory)).rejects.toThrow('duplicate theme ID alpha');

    await writeJson('manifest.json', {
      revision,
      defaultTheme: 'alpha',
      themes: ['beta', 'alpha'],
    });
    await expect(readManifest(directory)).rejects.toThrow('theme IDs must be sorted');

    await writeJson('manifest.json', {
      revision,
      defaultTheme: 'alpha',
      themes: ['alpha'],
      source: 'upstream',
    });
    await expect(readManifest(directory)).rejects.toThrow('Invalid catalog manifest');

    await writeJson('manifest.json', { revision, defaultTheme: 'missing', themes: ['alpha'] });
    await expect(readManifest(directory)).rejects.toThrow(
      'default theme missing is not in the catalog',
    );
  });
});

describe('readTheme', () => {
  it('reads a valid normalized theme', async () => {
    await writeManifest(['one-dark']);
    await writeJson('one-dark.json', theme('one-dark'));

    await expect(readTheme('one-dark', directory)).resolves.toEqual(theme('one-dark'));
  });

  it('rejects invalid IDs before reading a file', async () => {
    await expect(readTheme('../manifest', directory)).rejects.toThrow(
      'Invalid theme ID: ../manifest',
    );
    await expect(readTheme('OneDark', directory)).rejects.toThrow('Invalid theme ID: OneDark');
  });

  it('reports a missing theme clearly', async () => {
    await writeManifest(['missing']);
    await expect(readTheme('missing', directory)).rejects.toThrow('Missing theme missing');
  });

  it('rejects malformed JSON and invalid theme data', async () => {
    await writeManifest(['broken', 'invalid']);
    await writeFile(path.join(directory, 'broken.json'), '{');
    await expect(readTheme('broken', directory)).rejects.toThrow('Invalid JSON in theme broken');

    await writeJson('invalid.json', { ...theme('invalid'), palette: {} });
    await expect(readTheme('invalid', directory)).rejects.toThrow('Invalid theme invalid');
  });

  it('rejects a theme whose embedded ID differs from the requested ID', async () => {
    await writeManifest(['requested']);
    await writeJson('requested.json', theme('different'));

    await expect(readTheme('requested', directory)).rejects.toThrow(
      'Theme ID mismatch: requested requested, found different',
    );
  });

  it('supports catalog directory paths containing URL-special characters', async () => {
    const specialDirectory = path.join(directory, 'catalog #1');
    await mkdir(specialDirectory);
    await writeFile(
      path.join(specialDirectory, 'manifest.json'),
      `${JSON.stringify({ revision, defaultTheme: 'special', themes: ['special'] })}\n`,
    );
    await writeFile(
      path.join(specialDirectory, 'special.json'),
      `${JSON.stringify(theme('special'))}\n`,
    );

    await expect(readTheme('special', specialDirectory)).resolves.toEqual(theme('special'));
  });

  it('rejects a valid orphan theme not listed by the manifest', async () => {
    await writeManifest(['alpha']);
    await writeJson('orphan.json', theme('orphan'));

    await expect(readTheme('orphan', directory)).rejects.toThrow(
      'Theme orphan is not in the catalog manifest',
    );
  });
});

function theme(id: string) {
  return { id, name: id, variant: 'dark', palette };
}

async function writeManifest(themes: string[]): Promise<void> {
  await writeJson('manifest.json', { revision, defaultTheme: themes[0], themes });
}

async function writeJson(fileName: string, value: unknown): Promise<void> {
  await writeFile(path.join(directory, fileName), `${JSON.stringify(value)}\n`);
}
