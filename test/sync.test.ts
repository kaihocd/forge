import { writeFileSync } from 'node:fs';
import { mkdtemp, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ResolvedSyncEntry } from '../scripts/lib/config.js';
import { applySyncPlan, createSyncPlan } from '../scripts/sync/linker.js';
import { collectPackageSyncEntries } from '../scripts/sync/packages.js';

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

  it('creates links and recognizes correct relative links', async () => {
    const directory = await temporaryDirectory();
    const source = await sourceFile(directory, 'source');
    const target = path.join(directory, 'nested', 'target');
    const plan = await createSyncPlan([link('file', source, target)]);
    await applySyncPlan(plan);
    expect(await readlink(target)).toBe(source);
    expect((await createSyncPlan([link('file', source, target)]))[0]?.status).toBe('skip');

    const relativeTarget = path.join(directory, 'relative-target');
    await symlink(path.relative(path.dirname(relativeTarget), source), relativeTarget);
    expect((await createSyncPlan([link('relative', source, relativeTarget)]))[0]?.status).toBe(
      'skip',
    );
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
  });

  it('does not write package links when a config target conflicts', async () => {
    const directory = await temporaryDirectory();
    const packageSource = await sourceFile(directory, 'package-source');
    const configSource = await sourceFile(directory, 'config-source');
    const packageTarget = path.join(directory, 'package-target');
    const configTarget = path.join(directory, 'config-target');
    await writeFile(configTarget, 'unmanaged');
    const entries = await collectPackageSyncEntries((planDirectory) => {
      writeFileSync(
        path.join(planDirectory, 'package.json'),
        JSON.stringify([link('package/command', packageSource, packageTarget)]),
      );
    });
    const plan = await createSyncPlan([
      ...entries,
      link('config/main', configSource, configTarget),
    ]);
    await expect(applySyncPlan(plan)).rejects.toThrow(/sync aborted: 1 conflict/);
    await expect(readlink(packageTarget)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

function link(name: string, source: string, target: string): ResolvedSyncEntry {
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
