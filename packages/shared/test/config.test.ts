import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadManifestSyncEntries } from '../src/config.js';

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('loadManifestSyncEntries', () => {
  it('loads generic config links and prefixes with namespace', async () => {
    const root = await temporaryDirectory();
    await writeManifest(
      root,
      'forge.yaml',
      'sync:\n  - name: main\n    source: ./files\n    target: ~/.config/alpha\n',
    );
    const manifestPath = path.join(root, 'forge.yaml');
    await expect(loadManifestSyncEntries(manifestPath, root, 'alpha')).resolves.toEqual([
      {
        name: 'alpha/main',
        source: path.join(root, 'files'),
        target: '~/.config/alpha',
      },
    ]);
  });

  it('loads zsh config links in declaration order', async () => {
    const root = await temporaryDirectory();
    await writeManifest(
      root,
      'forge.yaml',
      'sync:\n' +
        '  - name: environment\n    source: ./files/zshenv.zsh\n    target: ~/.zshenv\n' +
        '  - name: interactive\n    source: ./files/zshrc.zsh\n    target: ~/.config/zsh/.zshrc\n' +
        '  - name: keys\n    source: ./files/keys.zsh\n    target: ~/.config/zsh/keys.zsh\n' +
        '  - name: tools\n    source: ./files/tools.zsh\n    target: ~/.config/zsh/tools.zsh\n' +
        '  - name: fzf\n    source: ./files/fzf.zsh\n    target: ~/.config/zsh/fzf.zsh\n',
    );
    const manifestPath = path.join(root, 'forge.yaml');
    await expect(loadManifestSyncEntries(manifestPath, root, 'zsh')).resolves.toEqual([
      {
        name: 'zsh/environment',
        source: path.join(root, 'files', 'zshenv.zsh'),
        target: '~/.zshenv',
      },
      {
        name: 'zsh/interactive',
        source: path.join(root, 'files', 'zshrc.zsh'),
        target: '~/.config/zsh/.zshrc',
      },
      {
        name: 'zsh/keys',
        source: path.join(root, 'files', 'keys.zsh'),
        target: '~/.config/zsh/keys.zsh',
      },
      {
        name: 'zsh/tools',
        source: path.join(root, 'files', 'tools.zsh'),
        target: '~/.config/zsh/tools.zsh',
      },
      {
        name: 'zsh/fzf',
        source: path.join(root, 'files', 'fzf.zsh'),
        target: '~/.config/zsh/fzf.zsh',
      },
    ]);
  });

  it('rejects duplicate sync names', async () => {
    const root = await temporaryDirectory();
    await writeManifest(
      root,
      'forge.yaml',
      'sync:\n  - { name: main, source: ./one, target: ~/one }\n  - { name: main, source: ./two, target: ~/two }\n',
    );
    const manifestPath = path.join(root, 'forge.yaml');
    await expect(loadManifestSyncEntries(manifestPath, root, 'a')).rejects.toThrow(
      /duplicate sync name/,
    );
  });

  it('rejects sync sources outside their module', async () => {
    const root = await temporaryDirectory();
    await writeManifest(
      root,
      'forge.yaml',
      'sync:\n  - { name: main, source: ../outside, target: ~/one }\n',
    );
    const manifestPath = path.join(root, 'forge.yaml');
    await expect(loadManifestSyncEntries(manifestPath, root, 'a')).rejects.toThrow(
      /escapes its root/,
    );
  });
});

async function writeManifest(root: string, relativePath: string, contents: string) {
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents);
}

async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), 'forge-shared-'));
  temporaryDirectories.push(directory);
  return directory;
}
