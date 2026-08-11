import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadDomainConfig } from '../scripts/lib/config.js';

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('module configuration', () => {
  it('loads generic config links in declaration order', async () => {
    const root = await temporaryDirectory();
    await writeManifest(
      root,
      'configs/wezterm/forge.yaml',
      'sync:\n  - name: main\n    source: ./main\n    target: ~/.config/wezterm\n',
    );
    await writeManifest(
      root,
      'configs/zsh/forge.yaml',
      'sync:\n  - name: config\n    source: .\n    target: ~/.config/zsh\n',
    );
    await writeConfig(root, [
      configModule('wezterm', './configs/wezterm/forge.yaml'),
      configModule('zsh', './configs/zsh/forge.yaml'),
    ]);
    await expect(loadDomainConfig(root)).resolves.toEqual({
      sync: [
        {
          name: 'wezterm/main',
          source: path.join(root, 'configs/wezterm/main'),
          target: '~/.config/wezterm',
        },
        {
          name: 'zsh/config',
          source: path.join(root, 'configs/zsh'),
          target: '~/.config/zsh',
        },
      ],
    });
  });
  it('ignores unregistered manifests', async () => {
    const root = await temporaryDirectory();
    await writeConfig(root, []);
    await expect(loadDomainConfig(root)).resolves.toEqual({ sync: [] });
  });
  it('rejects duplicate module names', async () => {
    const root = await temporaryDirectory();
    await writeConfig(root, [
      configModule('same', './one.yaml'),
      configModule('same', './two.yaml'),
    ]);
    await expect(loadDomainConfig(root)).rejects.toThrow(/duplicate module name/);
  });
  it('rejects duplicate sync names', async () => {
    const root = await temporaryDirectory();
    await writeManifest(
      root,
      'configs/a/forge.yaml',
      'sync:\n  - { name: main, source: ./one, target: ~/one }\n  - { name: main, source: ./two, target: ~/two }\n',
    );
    await writeConfig(root, [configModule('a', './configs/a/forge.yaml')]);
    await expect(loadDomainConfig(root)).rejects.toThrow(/duplicate sync name/);
  });
  it('rejects sync sources outside their module', async () => {
    const root = await temporaryDirectory();
    await writeManifest(
      root,
      'configs/a/forge.yaml',
      'sync:\n  - { name: main, source: ../outside, target: ~/one }\n',
    );
    await writeConfig(root, [configModule('a', './configs/a/forge.yaml')]);
    await expect(loadDomainConfig(root)).rejects.toThrow(/escapes its root/);
  });
});
function configModule(name: string, manifest: string) {
  return { name, type: 'config', manifest };
}
async function writeConfig(root: string, modules: object[]) {
  await writeFile(
    path.join(root, 'forge.config.yaml'),
    `${JSON.stringify({ brew: {}, modules }, undefined, 2)}\n`,
  );
}
async function writeManifest(root: string, relativePath: string, contents: string) {
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents);
}
async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), 'forge-config-'));
  temporaryDirectories.push(directory);
  return directory;
}
