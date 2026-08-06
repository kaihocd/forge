import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';

import { repoRoot } from './paths.js';

const linkSchema = z.object({
  name: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
});

// Config-level schema validates only the base task shape; each builder
// validates its own opts with its own schema. New builders must not require
// changes here.
const buildTaskSchema = z.object({
  builder: z.string().min(1),
  source: z.string().min(1),
  output: z.string().min(1),
  opts: z.record(z.string(), z.unknown()).default({}),
});

const brewSchema = z
  .object({
    taps: z.array(z.string().min(1)).default([]),
    formulas: z.array(z.string().min(1)).default([]),
    casks: z.array(z.string().min(1)).default([]),
  })
  .default({ taps: [], formulas: [], casks: [] });

const configSchema = z.object({
  links: z.array(linkSchema).default([]),
  build: z.array(buildTaskSchema).default([]),
  brew: brewSchema,
});

export type ForgeConfig = z.infer<typeof configSchema>;
export type LinkEntry = ForgeConfig['links'][number];
export type BuildTask = ForgeConfig['build'][number];

export async function loadConfig() {
  const configPath = path.join(repoRoot, 'forge.config.yaml');
  const configFile = await readFile(configPath, 'utf8');
  const parsedConfig = parse(configFile);

  return configSchema.parse(parsedConfig);
}
