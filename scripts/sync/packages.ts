import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';

import type { ResolvedSyncEntry } from '../lib/config.js';

const entrySchema = z
  .object({ name: z.string().min(1), source: z.string().min(1), target: z.string().min(1) })
  .strict();
const planSchema = z.array(entrySchema);

export async function collectPackageSyncEntries(
  runPackageSync: (planDirectory: string) => void,
): Promise<ResolvedSyncEntry[]> {
  const planDirectory = await mkdtemp(path.join(tmpdir(), 'forge-sync-plan-'));
  try {
    runPackageSync(planDirectory);
    const files = (await readdir(planDirectory)).filter((file) => file.endsWith('.json')).sort();
    const entries: ResolvedSyncEntry[] = [];
    for (const file of files) {
      const planPath = path.join(planDirectory, file);
      let input: unknown;
      try {
        input = JSON.parse(await readFile(planPath, 'utf8'));
      } catch (error) {
        throw new Error(`${planPath}: invalid package sync plan`, { cause: error });
      }
      const result = planSchema.safeParse(input);
      if (!result.success) throw new Error(`${planPath}: ${result.error.message}`);
      for (const entry of result.data) {
        if (!path.isAbsolute(entry.source) || !path.isAbsolute(entry.target)) {
          throw new Error(`${planPath}: package sync paths must be absolute`);
        }
        entries.push(entry);
      }
    }
    return entries;
  } finally {
    await rm(planDirectory, { recursive: true, force: true });
  }
}
