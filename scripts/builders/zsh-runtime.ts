import { constants } from 'node:fs';
import { access, lstat, mkdir, readFile, readlink, rm, stat, symlink } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

import { errTag, okTag, red, skipTag } from '../lib/colors.js';
import { expandHome, repoRoot } from '../lib/paths.js';
import {
  GENERATED_MARKER,
  validateGeneratedFile,
  validateNoSymlinkAncestors,
  writeGeneratedFile,
  type Builder,
} from './shared.js';

const runtimeEntrySchema = z
  .object({
    name: z.string().min(1),
    source: z.string().min(1),
    output: z.string().min(1),
  })
  .strict();

const optsSchema = z
  .object({
    executables: z.array(runtimeEntrySchema).default([]),
    completions: z.array(runtimeEntrySchema).default([]),
    sources: z.array(z.string().min(1)).default([]),
  })
  .strict();

type RuntimeEntry = z.infer<typeof runtimeEntrySchema>;

type PlannedRuntimeLink = RuntimeEntry & {
  kind: 'completion' | 'executable';
  source: string;
  output: string;
  linkTarget: string;
  status: 'create' | 'skip';
};

export const zshRuntimeBuilder: Builder = {
  async build(task) {
    await buildZshRuntime(task, repoRoot);
  },
};

export async function buildZshRuntime(
  task: { source: string; output: string; opts: unknown },
  root: string,
): Promise<void> {
  const opts = optsSchema.parse(task.opts);
  const templatePath = resolvePath(root, task.source);
  const outputPath = resolvePath(root, task.output);
  const template = await readRequiredFile(templatePath, 'zsh runtime template');
  const sources = await Promise.all(
    opts.sources.map((source) =>
      readRequiredFile(resolvePath(root, source), 'zsh runtime config source'),
    ),
  );
  const entries = [...opts.executables, ...opts.completions];
  const linkOutputs = entries.map(({ output }) => resolvePath(root, output));
  const inputPaths = [
    templatePath,
    ...opts.sources.map((source) => resolvePath(root, source)),
    ...entries.map(({ source }) => resolvePath(root, source)),
  ];
  validatePathPlan([...linkOutputs, outputPath], inputPaths);
  await Promise.all(linkOutputs.map((output) => validateNoSymlinkAncestors(output, root)));

  const plan = await Promise.all([
    ...opts.executables.map((entry) => planRuntimeLink(entry, root, 'executable')),
    ...opts.completions.map((entry) => planRuntimeLink(entry, root, 'completion')),
  ]);
  const executableDirectories = uniqueDirectories(opts.executables, root);
  const completionDirectories = uniqueDirectories(opts.completions, root);
  const mainSource = renderTemplate(template, {
    executable_dirs: renderDirectories(executableDirectories),
    completion_dirs: renderDirectories(completionDirectories),
  });
  const body = [mainSource, ...sources].map((content) => content.trim()).join('\n\n');
  const content = `# ${GENERATED_MARKER}. Edit the sources in the repo and run \`pnpm build\`.\n\n${body}\n`;

  await validateGeneratedFile('zsh runtime config', task.output, root);
  const createdLinks: PlannedRuntimeLink[] = [];

  try {
    for (const link of plan) {
      if (link.status === 'skip') {
        console.log(`${skipTag()} zsh runtime ${link.kind} "${link.name}": link already correct`);
        continue;
      }

      await mkdir(path.dirname(link.output), { recursive: true });
      await symlink(link.linkTarget, link.output, 'file');
      createdLinks.push(link);
      console.log(`${okTag()} build zsh runtime ${link.kind} "${link.name}": ${link.output}`);
    }

    await writeGeneratedFile('zsh runtime config', task.output, content, root);
  } catch (error) {
    await Promise.all(createdLinks.map(removePlannedLink));
    throw error;
  }
}

async function planRuntimeLink(
  entry: RuntimeEntry,
  root: string,
  kind: PlannedRuntimeLink['kind'],
): Promise<PlannedRuntimeLink> {
  const source = resolvePath(root, entry.source);
  const output = resolvePath(root, entry.output);

  let sourceStat;
  try {
    sourceStat = await stat(source);
  } catch (error) {
    if (isMissing(error)) {
      throw new Error(`missing zsh runtime ${entry.name}: source does not exist: ${source}`);
    }
    throw error;
  }
  if (!sourceStat.isFile())
    throw new Error(`invalid zsh runtime ${entry.name}: not a file: ${source}`);
  await access(source, kind === 'executable' ? constants.R_OK | constants.X_OK : constants.R_OK);

  const linkTarget = path.relative(path.dirname(output), source);
  const outputStat = await maybeLstat(output);

  if (!outputStat) return { ...entry, kind, source, output, linkTarget, status: 'create' };
  if (!outputStat.isSymbolicLink()) {
    throw new Error(`conflict zsh runtime ${entry.name}: ${output} exists and is not a symlink`);
  }

  const currentTarget = path.resolve(path.dirname(output), await readlink(output));
  if (currentTarget !== source) {
    throw new Error(
      `conflict zsh runtime ${entry.name}: ${output} points to ${currentTarget}, expected ${source}`,
    );
  }

  return { ...entry, kind, source, output, linkTarget, status: 'skip' };
}

function uniqueDirectories(entries: RuntimeEntry[], root: string): string[] {
  return [...new Set(entries.map(({ output }) => path.dirname(resolvePath(root, output))))];
}

function renderDirectories(directories: string[]): string {
  return directories.map((directory) => `  ${quoteForZsh(directory)}`).join('\n');
}

function renderTemplate(template: string, tokens: Record<string, string>): string {
  for (const token of Object.keys(tokens)) {
    const matches = template.match(new RegExp(`\\{\\{\\s*${token}\\s*\\}\\}`, 'g')) ?? [];
    if (matches.length !== 1) {
      throw new Error(`zsh runtime template must contain exactly one {{ ${token} }} token`);
    }
  }

  const rendered = template.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_, token: string) => {
    const value = tokens[token];
    if (value === undefined) {
      throw new Error(`${errTag()} ${red(`unknown zsh runtime: unknown token {{ ${token} }}`)}`);
    }
    return value;
  });

  if (rendered.includes('{{') || rendered.includes('}}')) {
    throw new Error('zsh runtime template contains a malformed token');
  }
  return rendered;
}

function quoteForZsh(input: string): string {
  return `'${input.replaceAll("'", "'\\''")}'`;
}

function resolvePath(root: string, input: string): string {
  const expanded = expandHome(input);
  return path.isAbsolute(expanded) ? expanded : path.resolve(root, expanded);
}

function validatePathPlan(outputs: string[], inputs: string[]): void {
  for (let index = 0; index < outputs.length; index += 1) {
    for (const other of outputs.slice(index + 1)) {
      if (pathsOverlap(outputs[index], other)) {
        throw new Error(`conflicting zsh runtime outputs: ${outputs[index]} and ${other}`);
      }
    }
    for (const input of inputs) {
      if (pathsOverlap(outputs[index], input)) {
        throw new Error(`zsh runtime output overlaps input: ${outputs[index]} and ${input}`);
      }
    }
  }
}

function pathsOverlap(first: string, second: string): boolean {
  return containsPath(first, second) || containsPath(second, first);
}

function containsPath(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}

async function readRequiredFile(filePath: string, label: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (isMissing(error)) throw new Error(`missing ${label}: ${filePath}`);
    throw error;
  }
}

async function maybeLstat(filePath: string) {
  try {
    return await lstat(filePath);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

async function removePlannedLink(link: PlannedRuntimeLink): Promise<void> {
  try {
    const currentTarget = path.resolve(path.dirname(link.output), await readlink(link.output));
    if (currentTarget === link.source) await rm(link.output);
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}
