import path from 'node:path';
import { fileURLToPath } from 'node:url';

export { expandHome } from '@forge/shared';

// scripts/lib/ is two levels below the repo root.
export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function resolveRepoPath(input: string) {
  return path.resolve(repoRoot, input);
}
