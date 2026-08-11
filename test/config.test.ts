import { constants } from 'node:fs';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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
  it('keeps Kitty generated config executable', async () => {
    const generatedConfig = path.join(import.meta.dirname, '../configs/kitty/files/dynamic.py');
    await expect(access(generatedConfig, constants.X_OK)).resolves.toBeUndefined();
  });

  it('loads generic config links in declaration order', async () => {
    const root = await temporaryDirectory();
    await writeManifest(
      root,
      'configs/kitty/forge.yaml',
      'sync:\n  - name: main\n    source: ./files\n    target: ~/.config/kitty\n',
    );
    await writeManifest(
      root,
      'configs/wezterm/forge.yaml',
      'sync:\n  - name: main\n    source: ./files\n    target: ~/.config/wezterm\n',
    );
    await writeManifest(
      root,
      'configs/zsh/forge.yaml',
      'sync:\n  - name: environment\n    source: ./files/zshenv.zsh\n    target: ~/.zshenv\n  - name: interactive\n    source: ./files/zshrc.zsh\n    target: ~/.config/zsh/.zshrc\n  - name: keys\n    source: ./files/keys.zsh\n    target: ~/.config/zsh/keys.zsh\n  - name: tools\n    source: ./files/tools.zsh\n    target: ~/.config/zsh/tools.zsh\n  - name: fzf\n    source: ./files/fzf.zsh\n    target: ~/.config/zsh/fzf.zsh\n',
    );
    await writeConfig(root, [
      configModule('kitty', './configs/kitty/forge.yaml'),
      configModule('wezterm', './configs/wezterm/forge.yaml'),
      configModule('zsh', './configs/zsh/forge.yaml'),
    ]);
    await expect(loadDomainConfig(root)).resolves.toEqual({
      sync: [
        {
          name: 'kitty/main',
          source: path.join(root, 'configs/kitty/files'),
          target: '~/.config/kitty',
        },
        {
          name: 'wezterm/main',
          source: path.join(root, 'configs/wezterm/files'),
          target: '~/.config/wezterm',
        },
        {
          name: 'zsh/environment',
          source: path.join(root, 'configs/zsh/files/zshenv.zsh'),
          target: '~/.zshenv',
        },
        {
          name: 'zsh/interactive',
          source: path.join(root, 'configs/zsh/files/zshrc.zsh'),
          target: '~/.config/zsh/.zshrc',
        },
        {
          name: 'zsh/keys',
          source: path.join(root, 'configs/zsh/files/keys.zsh'),
          target: '~/.config/zsh/keys.zsh',
        },
        {
          name: 'zsh/tools',
          source: path.join(root, 'configs/zsh/files/tools.zsh'),
          target: '~/.config/zsh/tools.zsh',
        },
        {
          name: 'zsh/fzf',
          source: path.join(root, 'configs/zsh/files/fzf.zsh'),
          target: '~/.config/zsh/fzf.zsh',
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
