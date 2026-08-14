import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../scripts/lib/config.js';

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('loadConfig', () => {
  it('loads enabled package modules', async () => {
    const root = await temporaryDirectory();
    await writeConfig(root, [packageModule('@forge/zsh'), packageModule('@forge/wezterm')]);
    await expect(loadConfig(root)).resolves.toEqual({
      brew: { taps: [], formulas: [], casks: [] },
      modules: [
        { name: '@forge/zsh', type: 'package' },
        { name: '@forge/wezterm', type: 'package' },
      ],
    });
  });

  it('rejects duplicate module names', async () => {
    const root = await temporaryDirectory();
    await writeConfig(root, [packageModule('@forge/same'), packageModule('@forge/same')]);
    await expect(loadConfig(root)).rejects.toThrow(/duplicate module name/);
  });
});

function packageModule(name: string) {
  return { name, type: 'package' };
}

async function writeConfig(root: string, modules: object[]) {
  await writeFile(
    path.join(root, 'forge.config.yaml'),
    `${JSON.stringify({ brew: {}, modules }, undefined, 2)}\n`,
  );
}

async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), 'forge-config-'));
  temporaryDirectories.push(directory);
  return directory;
}
