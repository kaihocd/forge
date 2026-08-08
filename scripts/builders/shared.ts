import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import { errTag, okTag, red, skipTag } from '../lib/colors.js';
import { expandHome, repoRoot } from '../lib/paths.js';

// The marker is the ownership proof for generated files: writeGeneratedFile
// refuses to overwrite any target that does not contain it. Never bypass.
export const GENERATED_MARKER = 'GENERATED_BY_FORGE';

export interface Builder {
  build(task: { source: string; output: string; opts: unknown }): Promise<void>;
}

function resolveOutputPath(output: string, root = repoRoot) {
  const expanded = expandHome(output);
  if (path.isAbsolute(expanded)) return expanded;

  return path.resolve(root, expanded);
}

export async function validateGeneratedFile(label: string, output: string, root = repoRoot) {
  const target = resolveOutputPath(output, root);
  await validateNoSymlinkAncestors(target, trustedPathRoot(target, root));
  let targetStat;

  try {
    targetStat = await lstat(target);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return;
    throw error;
  }

  // Generated outputs must be regular files. Following a symlink here could
  // turn the ownership marker into permission to overwrite an unrelated file.
  if (!targetStat.isFile()) throw generatedFileConflict(label, target);

  const existing = await readFile(target, 'utf8');
  if (!existing.includes(GENERATED_MARKER)) throw generatedFileConflict(label, target);
}

export async function validateNoSymlinkAncestors(
  target: string,
  trustedRoot: string,
): Promise<void> {
  const relative = path.relative(trustedRoot, path.dirname(target));
  if (relative === '') return;
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`path is outside its trusted root: ${target}`);
  }

  let current = trustedRoot;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    try {
      const currentStat = await lstat(current);
      if (currentStat.isSymbolicLink()) {
        throw new Error(`path has a symlink ancestor: ${target} via ${current}`);
      }
      if (!currentStat.isDirectory()) {
        throw new Error(`path has a non-directory ancestor: ${target} via ${current}`);
      }
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return;
      throw error;
    }
  }
}

export async function writeGeneratedFile(
  label: string,
  output: string,
  content: string,
  root = repoRoot,
) {
  const target = resolveOutputPath(output, root);
  await validateGeneratedFile(label, output, root);
  let existing: string | null = null;

  try {
    existing = await readFile(target, 'utf8');
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) {
      throw error;
    }
  }

  if (existing !== null) {
    if (!existing.includes(GENERATED_MARKER)) throw generatedFileConflict(label, target);

    if (existing === content) {
      console.log(`${skipTag()} ${label}: unchanged`);
      return;
    }
  }

  await mkdir(path.dirname(target), { recursive: true });
  const temporary = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${randomUUID()}.tmp`,
  );

  try {
    await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' });
    // Renaming a regular temporary file replaces the directory entry without
    // following a symlink that appears after the ownership preflight.
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
  console.log(`${okTag()} build ${label}: ${target}`);
}

function generatedFileConflict(label: string, target: string): Error {
  return new Error(
    `${errTag()} ${red(`conflict ${label}: ${target} exists and is not a Forge-generated regular file; back it up or remove it manually`)}`,
  );
}

function trustedPathRoot(target: string, root: string): string {
  if (isWithin(root, target)) return root;

  const home = homedir();
  if (isWithin(home, target)) return home;

  return path.dirname(target);
}

function isWithin(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..');
}
