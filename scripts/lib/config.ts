import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';

import { repoRoot } from './paths.js';

const brewSchema = z
  .object({
    taps: z.array(z.string().min(1)).default([]),
    formulas: z.array(z.string().min(1)).default([]),
    casks: z.array(z.string().min(1)).default([]),
  })
  .default({ taps: [], formulas: [], casks: [] });
const moduleNameSchema = z
  .string()
  .min(1)
  .refine((name) => name !== '.' && name !== '..' && path.basename(name) === name, {
    message: 'must be a single path segment',
  });
const moduleSchema = z
  .object({
    name: moduleNameSchema,
    type: z.literal('config'),
    manifest: z.string().min(1),
  })
  .strict();
const configSchema = z
  .object({ brew: brewSchema, modules: z.array(moduleSchema).default([]) })
  .strict();
const syncSchema = z
  .object({ name: z.string().min(1), source: z.string().min(1), target: z.string().min(1) })
  .strict();
const domainSchema = z.object({ sync: z.array(syncSchema).default([]) }).strict();

export type ForgeConfig = z.infer<typeof configSchema>;
export type ResolvedSyncEntry = { name: string; source: string; target: string };
export type DomainConfig = { sync: ResolvedSyncEntry[] };

export async function loadConfig(root = repoRoot) {
  const configPath = path.join(root, 'forge.config.yaml');
  const result = configSchema.safeParse(parse(await readFile(configPath, 'utf8')));
  if (!result.success) throw new Error(`${configPath}: ${result.error.message}`);
  return result.data;
}

export async function loadDomainConfig(root = repoRoot): Promise<DomainConfig> {
  const configPath = path.join(root, 'forge.config.yaml');
  const config = await loadConfig(root);
  const names = new Set<string>();
  const manifests = new Set<string>();
  const sync: ResolvedSyncEntry[] = [];

  for (const module of config.modules) {
    if (names.has(module.name)) {
      throw new Error(`${configPath}: duplicate module name "${module.name}"`);
    }
    names.add(module.name);
    if (path.isAbsolute(module.manifest)) {
      throw new Error(`${configPath}: module "${module.name}" manifest must be relative`);
    }
    const manifestPath = path.resolve(root, module.manifest);
    assertContained(root, manifestPath, configPath, `module manifest: ${module.manifest}`);
    if (manifests.has(manifestPath)) {
      throw new Error(`${configPath}: duplicate module manifest "${module.manifest}"`);
    }
    manifests.add(manifestPath);
  }

  for (const module of config.modules) {
    const manifestPath = path.resolve(root, module.manifest);
    let input: unknown;
    try {
      input = parse(await readFile(manifestPath, 'utf8'));
    } catch (error) {
      throw new Error(`${manifestPath}: failed to read module "${module.name}" manifest`, {
        cause: error,
      });
    }
    const result = domainSchema.safeParse(input);
    if (!result.success) throw new Error(`${manifestPath}: ${result.error.message}`);
    const domainRoot = path.dirname(manifestPath);
    const domainNames = new Set<string>();
    for (const entry of result.data.sync) {
      if (domainNames.has(entry.name)) {
        throw new Error(`${manifestPath}: duplicate sync name "${entry.name}"`);
      }
      domainNames.add(entry.name);
      const source = path.resolve(domainRoot, entry.source);
      assertContained(domainRoot, source, manifestPath, `path: ${entry.source}`);
      sync.push({ name: `${module.name}/${entry.name}`, source, target: entry.target });
    }
  }

  return { sync };
}

function assertContained(root: string, resolved: string, configPath: string, label: string): void {
  const relative = path.relative(root, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${configPath}: ${label} escapes its root`);
  }
}
