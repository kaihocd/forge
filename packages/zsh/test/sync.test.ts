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
  const directory = await mkdtemp(path.join(tmpdir(), 'zsh-sync-'));
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

describe('zsh sync', () => {
  it('writes a plan linking all Zsh configuration files', async () => {
    const planDirectory = await temporaryDirectory();
    await runSync(planDirectory);
    const entries = JSON.parse(
      await readFile(path.join(planDirectory, 'zsh.json'), 'utf8'),
    ) as Array<{ name: string; source: string; target: string }>;

    expect(entries).toEqual([
      {
        name: 'zsh/environment',
        source: path.join(packageRoot, 'files', 'zshenv.zsh'),
        target: path.join(homedir(), '.zshenv'),
      },
      {
        name: 'zsh/interactive',
        source: path.join(packageRoot, 'files', 'zshrc.zsh'),
        target: path.join(homedir(), '.config', 'zsh', '.zshrc'),
      },
      {
        name: 'zsh/keys',
        source: path.join(packageRoot, 'files', 'keys.zsh'),
        target: path.join(homedir(), '.config', 'zsh', 'keys.zsh'),
      },
      {
        name: 'zsh/tools',
        source: path.join(packageRoot, 'files', 'tools.zsh'),
        target: path.join(homedir(), '.config', 'zsh', 'tools.zsh'),
      },
      {
        name: 'zsh/fzf',
        source: path.join(packageRoot, 'files', 'fzf.zsh'),
        target: path.join(homedir(), '.config', 'zsh', 'fzf.zsh'),
      },
    ]);
  });
});
