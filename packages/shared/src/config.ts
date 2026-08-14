import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';

const syncSchema = z
  .object({
    name: z.string().min(1),
    source: z.string().min(1),
    target: z.string().min(1),
  })
  .strict();

const manifestSchema = z.object({ sync: z.array(syncSchema).default([]) }).strict();

export type ResolvedSyncEntry = { name: string; source: string; target: string };

export async function loadManifestSyncEntries(
  manifestPath: string,
  root: string,
  namespace: string,
): Promise<ResolvedSyncEntry[]> {
  let input: unknown;
  try {
    input = parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`${manifestPath}: failed to read manifest`, { cause: error });
  }
  const result = manifestSchema.safeParse(input);
  if (!result.success) throw new Error(`${manifestPath}: ${result.error.message}`);

  const domainRoot = path.dirname(manifestPath);
  const names = new Set<string>();
  const sync: ResolvedSyncEntry[] = [];

  for (const entry of result.data.sync) {
    if (names.has(entry.name)) {
      throw new Error(`${manifestPath}: duplicate sync name "${entry.name}"`);
    }
    names.add(entry.name);
    const source = path.resolve(domainRoot, entry.source);
    assertContained(root, source, manifestPath, `path: ${entry.source}`);
    sync.push({ name: `${namespace}/${entry.name}`, source, target: entry.target });
  }

  return sync;
}

function assertContained(root: string, resolved: string, configPath: string, label: string): void {
  const relative = path.relative(root, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${configPath}: ${label} escapes its root`);
  }
}
