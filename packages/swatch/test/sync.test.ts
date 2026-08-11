import { mkdir, mkdtemp, readlink, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createPackageSyncEntries, syncPackage } from '../scripts/lib/sync.js';

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('package sync', () => {
  it('exposes absolute entries for root sync planning', async () => {
    const root = await fixture();
    const home = await temporaryDirectory();
    expect(createPackageSyncEntries({ home }, root).map(({ name }) => name)).toEqual([
      'swatch/command',
      'swatch/completion',
      'swatch/WezTerm integration',
    ]);
    expect(
      createPackageSyncEntries({ home }, root).every(({ source, target }) => {
        return path.isAbsolute(source) && path.isAbsolute(target);
      }),
    ).toBe(true);
  });

  it('links package artifacts into standard user directories', async () => {
    const root = await fixture();
    const home = await temporaryDirectory();
    await syncPackage({ home }, root);
    expect(await readlink(path.join(home, '.local/bin/swatch'))).toBe(
      path.relative(path.join(home, '.local/bin'), path.join(root, 'dist/cli.js')),
    );
    expect(await readlink(path.join(home, '.local/share/zsh/site-functions/_swatch'))).toBe(
      path.relative(
        path.join(home, '.local/share/zsh/site-functions'),
        path.join(root, 'dist/completions/_swatch'),
      ),
    );
    expect(await readlink(path.join(home, '.local/share/swatch/integrations/wezterm.lua'))).toBe(
      path.relative(
        path.join(home, '.local/share/swatch/integrations'),
        path.join(root, 'dist/integrations/wezterm.lua'),
      ),
    );
  });

  it('respects absolute XDG sync directories', async () => {
    const root = await fixture();
    const home = await temporaryDirectory();
    const binHome = path.join(home, 'commands');
    const dataHome = path.join(home, 'data');
    await syncPackage({ home, binHome, dataHome }, root);
    await expect(readlink(path.join(binHome, 'swatch'))).resolves.toBe(
      path.relative(binHome, path.join(root, 'dist/cli.js')),
    );
    await expect(readlink(path.join(dataHome, 'zsh/site-functions/_swatch'))).resolves.toBe(
      path.relative(
        path.join(dataHome, 'zsh/site-functions'),
        path.join(root, 'dist/completions/_swatch'),
      ),
    );
  });

  it('plans every artifact before writing and refuses conflicts', async () => {
    const root = await fixture();
    const home = await temporaryDirectory();
    const conflict = path.join(home, '.local/share/zsh/site-functions/_swatch');
    await mkdir(path.dirname(conflict), { recursive: true });
    await writeFile(conflict, 'unmanaged');
    await expect(syncPackage({ home }, root)).rejects.toThrow(/conflict swatch\/completion/);
    await expect(readlink(path.join(home, '.local/bin/swatch'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('previews missing links without writing them', async () => {
    const root = await fixture();
    const home = await temporaryDirectory();
    await syncPackage({ home }, root, true);
    await expect(readlink(path.join(home, '.local/bin/swatch'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});

async function fixture(): Promise<string> {
  const root = await temporaryDirectory();
  for (const relative of [
    'dist/cli.js',
    'dist/completions/_swatch',
    'dist/integrations/wezterm.lua',
  ]) {
    const filePath = path.join(root, relative);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, relative);
  }
  return root;
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'swatch-sync-'));
  temporaryDirectories.push(directory);
  return directory;
}
