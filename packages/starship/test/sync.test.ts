import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'starship-sync-'));
  temporaryDirectories.push(directory);
  return directory;
}

function runSync(planDirectory: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['exec', 'tsx', 'scripts/sync.ts', `--plan-dir=${planDirectory}`], {
      cwd: packageRoot,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`sync exited with code ${code}`));
      }
    });
  });
}

describe('starship sync', () => {
  it('writes a plan linking the Starship config to the user directory', async () => {
    const planDirectory = await temporaryDirectory();
    await runSync(planDirectory);
    const entries = JSON.parse(
      await readFile(path.join(planDirectory, 'starship.json'), 'utf8'),
    ) as Array<{ name: string; source: string; target: string }>;

    expect(entries).toEqual([
      {
        name: 'starship/main',
        source: path.join(packageRoot, 'files', 'starship.toml'),
        target: path.join(homedir(), '.config', 'starship.toml'),
      },
    ]);
  });
});
