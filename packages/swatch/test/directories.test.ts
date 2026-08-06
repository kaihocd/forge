import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { recoverDirectoryReplacement, replaceDirectory } from '../scripts/lib/directories.js';

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'swatch-directory-test-'));
});

afterEach(async () => {
  await rm(directory, { force: true, recursive: true });
});

describe('replaceDirectory', () => {
  it('publishes staging and removes the previous directory', async () => {
    const paths = replacementPaths();
    await writeMarker(paths.target, 'old');
    await writeMarker(paths.staging, 'new');

    await replaceDirectory(paths.staging, paths.target, paths.backup);

    await expect(readMarker(paths.target)).resolves.toBe('new');
    await expect(readMarker(paths.backup)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('restores the previous directory when staging cannot be published', async () => {
    const paths = replacementPaths();
    await writeMarker(paths.target, 'old');

    await expect(replaceDirectory(paths.staging, paths.target, paths.backup)).rejects.toMatchObject(
      {
        code: 'ENOENT',
      },
    );
    await expect(readMarker(paths.target)).resolves.toBe('old');
    await expect(readMarker(paths.backup)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('recoverDirectoryReplacement', () => {
  it('restores a backup left before publication', async () => {
    const paths = replacementPaths();
    await writeMarker(paths.backup, 'old');

    await recoverDirectoryReplacement(paths.target, paths.backup);

    await expect(readMarker(paths.target)).resolves.toBe('old');
  });

  it('keeps a published target and removes its stale backup', async () => {
    const paths = replacementPaths();
    await writeMarker(paths.target, 'new');
    await writeMarker(paths.backup, 'old');

    await recoverDirectoryReplacement(paths.target, paths.backup);

    await expect(readMarker(paths.target)).resolves.toBe('new');
    await expect(readMarker(paths.backup)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

function replacementPaths() {
  return {
    staging: path.join(directory, 'staging'),
    target: path.join(directory, 'target'),
    backup: path.join(directory, 'backup'),
  };
}

async function writeMarker(target: string, value: string): Promise<void> {
  await mkdir(target, { recursive: true });
  await writeFile(path.join(target, 'marker'), value);
}

async function readMarker(target: string): Promise<string> {
  return readFile(path.join(target, 'marker'), 'utf8');
}
