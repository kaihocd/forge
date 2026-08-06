// Plans all configured links before applying any filesystem changes.

import { lstat, mkdir, readlink, symlink } from 'node:fs/promises';
import path from 'node:path';

import type { LinkEntry } from '../lib/config.js';
import { expandHome, resolveRepoPath } from '../lib/paths.js';

type PlannedLink = {
  name: string;
  source: string;
  target: string;
};

export type SyncAction =
  | (PlannedLink & {
      status: 'create';
      sourceType: 'dir' | 'file';
    })
  | (PlannedLink & {
      status: 'skip';
    })
  | (PlannedLink & {
      status: 'conflict';
      reason: string;
    });

export async function createSyncPlan(links: LinkEntry[]): Promise<SyncAction[]> {
  const resolvedLinks = await Promise.all(
    links.map(async (link) => {
      const source = resolveRepoPath(link.source);
      const sourceStat = await maybeLstat(source);

      if (!sourceStat) {
        throw new Error(`missing ${link.name}: source does not exist: ${source}`);
      }

      return {
        name: link.name,
        source,
        sourceType: sourceStat.isDirectory() ? ('dir' as const) : ('file' as const),
        target: expandHome(link.target),
      };
    }),
  );

  const targetCounts = new Map<string, number>();

  for (const link of resolvedLinks) {
    targetCounts.set(link.target, (targetCounts.get(link.target) ?? 0) + 1);
  }

  return Promise.all(
    resolvedLinks.map(async (link): Promise<SyncAction> => {
      if ((targetCounts.get(link.target) ?? 0) > 1) {
        return {
          ...link,
          status: 'conflict',
          reason: `${link.target} is configured more than once`,
        };
      }

      const targetStat = await maybeLstat(link.target);

      if (!targetStat) {
        return { ...link, status: 'create' };
      }

      if (!targetStat.isSymbolicLink()) {
        return {
          ...link,
          status: 'conflict',
          reason: `${link.target} exists and is not a symlink`,
        };
      }

      const currentTarget = await readlink(link.target);
      const resolvedCurrentTarget = path.resolve(path.dirname(link.target), currentTarget);

      if (resolvedCurrentTarget === link.source) {
        return {
          name: link.name,
          source: link.source,
          target: link.target,
          status: 'skip',
        };
      }

      return {
        ...link,
        status: 'conflict',
        reason: `${link.target} points to ${resolvedCurrentTarget}, expected ${link.source}`,
      };
    }),
  );
}

export async function applySyncPlan(plan: SyncAction[]): Promise<void> {
  const conflictCount = plan.filter((action) => action.status === 'conflict').length;

  if (conflictCount > 0) {
    throw new Error(`sync aborted: ${conflictCount} conflict${conflictCount === 1 ? '' : 's'}`);
  }

  for (const action of plan) {
    if (action.status !== 'create') continue;

    await mkdir(path.dirname(action.target), { recursive: true });
    await symlink(action.source, action.target, action.sourceType);
  }
}

async function maybeLstat(filePath: string) {
  try {
    return await lstat(filePath);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}
