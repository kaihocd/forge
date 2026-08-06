import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// scripts/lib/ is two levels below the repo root.
export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function expandHome(input: string) {
  if (input === '~') return homedir();
  if (input.startsWith('~/')) return path.join(homedir(), input.slice(2));

  return input;
}

export function resolveRepoPath(input: string) {
  return path.resolve(repoRoot, input);
}
