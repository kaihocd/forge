import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';

import { repoRoot } from './paths.js';

export { loadManifestSyncEntries, type ResolvedSyncEntry } from '@forge/shared';

const brewSchema = z
  .object({
    taps: z.array(z.string().min(1)).default([]),
    formulas: z.array(z.string().min(1)).default([]),
    casks: z.array(z.string().min(1)).default([]),
  })
  .default({ taps: [], formulas: [], casks: [] });

const packageModuleSchema = z
  .object({
    name: z.string().min(1),
    type: z.literal('package'),
  })
  .strict();

const configSchema = z
  .object({
    brew: brewSchema,
    modules: z.array(packageModuleSchema).default([]),
  })
  .strict();

export type ForgeConfig = z.infer<typeof configSchema>;
export type ModuleConfig = z.infer<typeof packageModuleSchema>;

export async function loadConfig(root = repoRoot) {
  const configPath = path.join(root, 'forge.config.yaml');
  const result = configSchema.safeParse(parse(await readFile(configPath, 'utf8')));
  if (!result.success) throw new Error(`${configPath}: ${result.error.message}`);
  assertUniqueModuleNames(result.data.modules, configPath);
  return result.data;
}

function assertUniqueModuleNames(modules: ModuleConfig[], configPath: string): void {
  const names = new Set<string>();
  for (const module of modules) {
    if (names.has(module.name)) {
      throw new Error(`${configPath}: duplicate module name "${module.name}"`);
    }
    names.add(module.name);
  }
}
