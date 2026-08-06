// Verifies that link synchronization plans fully before changing the filesystem.

import { mkdir, mkdtemp, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { LinkEntry } from '../scripts/lib/config.js';
import { applySyncPlan, createSyncPlan } from '../scripts/sync/linker.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('link synchronization', () => {
  it('plans missing targets without creating them', async () => {
    const directory = await temporaryDirectory();
    const source = await sourceFile(directory, 'source');
    const target = path.join(directory, 'target');

    const plan = await createSyncPlan([link('theme', source, target)]);

    expect(plan[0]?.status).toBe('create');
    await expect(readlink(target)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('does not create any links when one target conflicts', async () => {
    const directory = await temporaryDirectory();
    const firstSource = await sourceFile(directory, 'first-source');
    const secondSource = await sourceFile(directory, 'second-source');
    const firstTarget = path.join(directory, 'first-target');
    const secondTarget = path.join(directory, 'second-target');
    await writeFile(secondTarget, 'unmanaged');

    const plan = await createSyncPlan([
      link('first', firstSource, firstTarget),
      link('second', secondSource, secondTarget),
    ]);

    await expect(applySyncPlan(plan)).rejects.toThrow(/sync aborted: 1 conflict/);
    await expect(readlink(firstTarget)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('creates all links when the complete plan is conflict-free', async () => {
    const directory = await temporaryDirectory();
    const fileSource = await sourceFile(directory, 'file-source');
    const directorySource = path.join(directory, 'directory-source');
    const fileTarget = path.join(directory, 'nested', 'file-target');
    const directoryTarget = path.join(directory, 'directory-target');
    await mkdir(directorySource);

    const plan = await createSyncPlan([
      link('file', fileSource, fileTarget),
      link('directory', directorySource, directoryTarget),
    ]);
    await applySyncPlan(plan);

    expect(await readlink(fileTarget)).toBe(fileSource);
    expect(await readlink(directoryTarget)).toBe(directorySource);
    expect(
      (
        await createSyncPlan([
          link('file', fileSource, fileTarget),
          link('directory', directorySource, directoryTarget),
        ])
      ).map((action) => action.status),
    ).toEqual(['skip', 'skip']);
  });

  it('recognizes a correct relative symbolic link', async () => {
    const directory = await temporaryDirectory();
    const source = await sourceFile(directory, 'source');
    const target = path.join(directory, 'target');
    await symlink(path.relative(path.dirname(target), source), target);

    const plan = await createSyncPlan([link('relative', source, target)]);

    expect(plan[0]?.status).toBe('skip');
  });

  it('rejects duplicate configured targets before applying the plan', async () => {
    const directory = await temporaryDirectory();
    const firstSource = await sourceFile(directory, 'first-source');
    const secondSource = await sourceFile(directory, 'second-source');
    const target = path.join(directory, 'target');

    const plan = await createSyncPlan([
      link('first', firstSource, target),
      link('second', secondSource, target),
    ]);

    expect(plan.map((action) => action.status)).toEqual(['conflict', 'conflict']);
    await expect(applySyncPlan(plan)).rejects.toThrow(/sync aborted: 2 conflicts/);
    await expect(readlink(target)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

function link(name: string, source: string, target: string): LinkEntry {
  return { name, source, target };
}

async function sourceFile(directory: string, name: string): Promise<string> {
  const source = path.join(directory, name);
  await writeFile(source, name);
  return source;
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'forge-sync-'));
  temporaryDirectories.push(directory);
  return directory;
}
