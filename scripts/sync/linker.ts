import { lstat, mkdir, readlink, symlink } from 'node:fs/promises';
import path from 'node:path';

import type { ResolvedSyncEntry } from '../lib/config.js';
import { expandHome } from '../lib/paths.js';

type PlannedLink = { name: string; source: string; target: string };
export type SyncAction =
  | (PlannedLink & { status: 'create'; sourceType: 'dir' | 'file' })
  | (PlannedLink & { status: 'skip' })
  | (PlannedLink & { status: 'conflict'; reason: string });

export async function createSyncPlan(links: ResolvedSyncEntry[]): Promise<SyncAction[]> {
  const resolvedLinks = await Promise.all(
    links.map(async (link) => {
      const sourceStat = await maybeLstat(link.source);
      if (!sourceStat)
        throw new Error(`missing ${link.name}: source does not exist: ${link.source}`);
      return {
        ...link,
        sourceType: sourceStat.isDirectory() ? ('dir' as const) : ('file' as const),
        target: expandHome(link.target),
      };
    }),
  );
  const targetCounts = new Map<string, number>();
  for (const link of resolvedLinks)
    targetCounts.set(link.target, (targetCounts.get(link.target) ?? 0) + 1);
  return Promise.all(
    resolvedLinks.map(async (link): Promise<SyncAction> => {
      if ((targetCounts.get(link.target) ?? 0) > 1)
        return {
          ...link,
          status: 'conflict',
          reason: `${link.target} is configured more than once`,
        };
      const targetStat = await maybeLstat(link.target);
      if (!targetStat) return { ...link, status: 'create' };
      if (!targetStat.isSymbolicLink())
        return {
          ...link,
          status: 'conflict',
          reason: `${link.target} exists and is not a symlink`,
        };
      const currentTarget = path.resolve(path.dirname(link.target), await readlink(link.target));
      if (currentTarget === link.source)
        return { name: link.name, source: link.source, target: link.target, status: 'skip' };
      return {
        ...link,
        status: 'conflict',
        reason: `${link.target} points to ${currentTarget}, expected ${link.source}`,
      };
    }),
  );
}
export async function applySyncPlan(plan: SyncAction[]): Promise<void> {
  const conflicts = plan.filter((action) => action.status === 'conflict').length;
  if (conflicts > 0)
    throw new Error(`sync aborted: ${conflicts} conflict${conflicts === 1 ? '' : 's'}`);
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
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
      return null;
    throw error;
  }
}
