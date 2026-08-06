// Verifies Base16 scheme contracts, loading, and repository caching.

import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import {
  ensureSchemesCache,
  readBase16Schemes,
  readSchemesCache,
  refreshSchemesCache,
  rawSchemeSchema,
} from '../scripts/lib/schemes.js';

const fixtures = new URL('./fixtures/', import.meta.url);
const execFileAsync = promisify(execFile);
let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'swatch-fetch-test-'));
});

afterEach(async () => {
  await rm(directory, { force: true, recursive: true });
});

describe('readBase16Schemes', () => {
  it('rejects an empty scheme directory', async () => {
    await expect(readBase16Schemes(directory)).rejects.toThrow('No Base16 YAML schemes found');
  });

  it('loads YAML files in stable theme ID order and ignores other files', async () => {
    await copyFixture('onedark.yaml', 'z-theme.yaml');
    await copyFixture('cyberpunk.yml', 'a-theme.yml');
    await writeFile(path.join(directory, 'README.md'), 'not a scheme\n');

    const schemes = await readBase16Schemes(directory);

    expect(schemes.map(({ id }) => id)).toEqual(['a-theme', 'z-theme']);
    expect(schemes.map(({ source }) => source)).toEqual([
      'base16/a-theme.yml',
      'base16/z-theme.yaml',
    ]);
  });

  it('rejects invalid theme IDs with the source path', async () => {
    await copyFixture('onedark.yaml', 'Bad Name.yaml');

    await expect(readBase16Schemes(directory)).rejects.toThrow('base16/Bad Name.yaml');
  });

  it('reports malformed YAML with the source path', async () => {
    await writeFile(path.join(directory, 'broken.yaml'), 'palette: [\n');

    await expect(readBase16Schemes(directory)).rejects.toThrow('base16/broken.yaml');
  });

  it('reports schema failures with the source path', async () => {
    await copyFixture('invalid.yaml', 'invalid.yaml');

    await expect(readBase16Schemes(directory)).rejects.toThrow('base16/invalid.yaml');
  });

  it('rejects duplicate IDs across YAML extensions', async () => {
    await copyFixture('onedark.yaml', 'duplicate.yaml');
    await copyFixture('onedark.yaml', 'duplicate.yml');

    await expect(readBase16Schemes(directory)).rejects.toThrow('duplicate theme ID duplicate');
  });
});

describe('readSchemesCache', () => {
  it('reads the Git revision and validates schemes from a cached repository', async () => {
    await createSchemeRepository(directory);
    const { stdout } = await execFileAsync('git', ['-C', directory, 'rev-parse', 'HEAD']);

    const result = await readSchemesCache(directory);

    expect(result.revision).toBe(stdout.trim());
    expect(result.schemes.map(({ id }) => id)).toEqual(['onedark']);
  });

  it('rejects tracked changes in the cached Base16 sources', async () => {
    await createSchemeRepository(directory);
    await writeFile(path.join(directory, 'base16', 'onedark.yaml'), 'changed locally\n');

    await expect(readSchemesCache(directory)).rejects.toThrow(
      'Cached Base16 schemes contain uncommitted changes',
    );
  });

  it('rejects untracked Base16 sources', async () => {
    await createSchemeRepository(directory);
    await copyFixture('onedark.yaml', path.join('base16', 'untracked.yaml'));

    await expect(readSchemesCache(directory)).rejects.toThrow(
      'Cached Base16 schemes contain uncommitted changes',
    );
  });
});

describe('refreshSchemesCache', () => {
  it('caches the complete shallow-cloned repository', async () => {
    const repository = path.join(directory, 'upstream');
    const cacheDirectory = path.join(directory, 'cache', 'schemes');
    await mkdir(repository);
    await createSchemeRepository(repository);

    const result = await refreshSchemesCache({ cacheDirectory, repository });

    await expect(readFile(path.join(cacheDirectory, 'README.md'), 'utf8')).resolves.toBe(
      'upstream repository\n',
    );
    await expect(stat(path.join(cacheDirectory, '.git'))).resolves.toBeDefined();
    await expect(stat(path.join(cacheDirectory, 'REVISION'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect((await readSchemesCache(cacheDirectory)).revision).toBe(result.revision);
  });

  it('rebuilds after staging and legacy backup directories are left behind', async () => {
    const repository = path.join(directory, 'upstream');
    const cacheParent = path.join(directory, 'cache');
    const cacheDirectory = path.join(cacheParent, 'schemes');
    await mkdir(repository);
    await createSchemeRepository(repository);
    await refreshSchemesCache({ cacheDirectory, repository });
    await mkdir(path.join(cacheParent, '.schemes-build', 'incomplete'), { recursive: true });
    await mkdir(path.join(cacheParent, '.schemes-backup', 'legacy'), { recursive: true });

    const result = await refreshSchemesCache({ cacheDirectory, repository });

    expect((await readSchemesCache(cacheDirectory)).revision).toBe(result.revision);
    await expect(stat(path.join(cacheParent, '.schemes-build'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(stat(path.join(cacheParent, '.schemes-backup'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});

describe('ensureSchemesCache', () => {
  it('fetches a missing cache and validates every theme conversion', async () => {
    const repository = path.join(directory, 'upstream');
    const cacheDirectory = path.join(directory, 'cache', 'schemes');
    await mkdir(repository);
    await createSchemeRepository(repository);

    const result = await ensureSchemesCache({ cacheDirectory, repository });

    expect(result.initialized).toBe(true);
    expect(result.result.schemes.map(({ id }) => id)).toEqual(['onedark']);
  });

  it('validates an existing cache without replacing local changes', async () => {
    const repository = path.join(directory, 'upstream');
    const cacheDirectory = path.join(directory, 'cache', 'schemes');
    await mkdir(repository);
    await createSchemeRepository(repository);
    await refreshSchemesCache({ cacheDirectory, repository });
    await writeFile(path.join(cacheDirectory, 'base16', 'onedark.yaml'), 'changed locally\n');

    await expect(ensureSchemesCache({ cacheDirectory, repository })).rejects.toThrow(
      'Cached Base16 schemes contain uncommitted changes',
    );
    await expect(
      readFile(path.join(cacheDirectory, 'base16', 'onedark.yaml'), 'utf8'),
    ).resolves.toBe('changed locally\n');
  });

  it('recovers an interrupted replacement without fetching again', async () => {
    const repository = path.join(directory, 'upstream');
    const cacheParent = path.join(directory, 'cache');
    const cacheDirectory = path.join(cacheParent, 'schemes');
    const backupDirectory = path.join(cacheParent, '.schemes-backup');
    await mkdir(repository);
    await createSchemeRepository(repository);
    await refreshSchemesCache({ cacheDirectory, repository });
    await rename(cacheDirectory, backupDirectory);

    const result = await ensureSchemesCache({
      cacheDirectory,
      repository: path.join(directory, 'does-not-exist'),
    });

    expect(result.initialized).toBe(false);
    expect(result.result.schemes.map(({ id }) => id)).toEqual(['onedark']);
  });
});

describe('rawSchemeSchema', () => {
  it('accepts a standard Base16 scheme', async () => {
    const scheme = rawSchemeSchema.parse(await parsedFixture('onedark.yaml'));

    expect(scheme).toMatchObject({
      system: 'base16',
      name: 'OneDark',
      palette: { base0F: '#be5046' },
    });
  });

  it('accepts optional metadata, an empty author, and mixed-case hex colors', async () => {
    const seti = rawSchemeSchema.parse(await parsedFixture('seti.yaml'));
    const cyberpunk = rawSchemeSchema.parse(await parsedFixture('cyberpunk.yml'));

    expect(seti).toMatchObject({
      author: '',
      slug: 'seti',
      palette: { base08: '#Cd3f45' },
    });
    expect(cyberpunk.description).toContain('Cyberpunk color scheme');
  });

  it('rejects an incomplete Base16 palette', async () => {
    expect(rawSchemeSchema.safeParse(await parsedFixture('invalid.yaml')).success).toBe(false);
  });

  it('ignores unrelated upstream metadata', async () => {
    const input = await parsedFixture('onedark.yaml');
    if (typeof input !== 'object' || input === null) {
      throw new TypeError('expected fixture to contain an object');
    }

    expect(rawSchemeSchema.parse({ ...input, license: 'MIT' })).not.toHaveProperty('license');
  });
});

async function copyFixture(source: string, destination: string): Promise<void> {
  await copyFile(new URL(source, fixtures), path.join(directory, destination));
}

async function parsedFixture(name: string): Promise<unknown> {
  return parse(await readFile(new URL(name, fixtures), 'utf8'));
}

async function createSchemeRepository(repository: string): Promise<void> {
  const base16Directory = path.join(repository, 'base16');
  await mkdir(base16Directory);
  await copyFile(new URL('onedark.yaml', fixtures), path.join(base16Directory, 'onedark.yaml'));
  await writeFile(path.join(repository, 'README.md'), 'upstream repository\n');
  await execFileAsync('git', ['init', '--initial-branch', 'spec-0.11', repository]);
  await execFileAsync('git', ['-C', repository, 'add', '.']);
  await execFileAsync('git', [
    '-C',
    repository,
    '-c',
    'user.name=Swatch Tests',
    '-c',
    'user.email=swatch@example.invalid',
    'commit',
    '-m',
    'test fixture',
  ]);
}
