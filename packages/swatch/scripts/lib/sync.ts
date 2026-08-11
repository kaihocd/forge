import { lstat, mkdir, readlink, symlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export type SyncPaths = {
  home: string;
  binHome?: string;
  dataHome?: string;
};

export type PackageSyncEntry = { name: string; source: string; target: string };

export function createPackageSyncEntries(
  paths: SyncPaths = {
    home: homedir(),
    binHome: process.env.XDG_BIN_HOME,
    dataHome: process.env.XDG_DATA_HOME,
  },
  root = packageRoot,
): PackageSyncEntry[] {
  const binHome = absolutePath(paths.binHome) ?? path.join(paths.home, '.local', 'bin');
  const dataHome = absolutePath(paths.dataHome) ?? path.join(paths.home, '.local', 'share');
  return [
    {
      name: 'swatch/command',
      source: path.join(root, 'dist', 'cli.js'),
      target: path.join(binHome, 'swatch'),
    },
    {
      name: 'swatch/completion',
      source: path.join(root, 'dist', 'completions', '_swatch'),
      target: path.join(dataHome, 'zsh', 'site-functions', '_swatch'),
    },
    {
      name: 'swatch/Kitty integration',
      source: path.join(root, 'dist', 'integrations', 'kitty.py'),
      target: path.join(dataHome, 'swatch', 'integrations', 'kitty.py'),
    },
    {
      name: 'swatch/WezTerm integration',
      source: path.join(root, 'dist', 'integrations', 'wezterm.lua'),
      target: path.join(dataHome, 'swatch', 'integrations', 'wezterm.lua'),
    },
  ];
}

export async function syncPackage(
  paths: SyncPaths = {
    home: homedir(),
    binHome: process.env.XDG_BIN_HOME,
    dataHome: process.env.XDG_DATA_HOME,
  },
  root = packageRoot,
  preview = false,
): Promise<void> {
  const links = createPackageSyncEntries(paths, root);

  const plan = await Promise.all(
    links.map(async (link) => {
      const sourceStat = await maybeLstat(link.source);
      if (!sourceStat?.isFile()) throw new Error(`missing ${link.name}: ${link.source}`);
      const targetStat = await maybeLstat(link.target);
      if (!targetStat) return { ...link, status: 'create' as const };
      if (!targetStat.isSymbolicLink()) {
        throw new Error(`conflict ${link.name}: ${link.target} exists and is not a symlink`);
      }
      const current = path.resolve(path.dirname(link.target), await readlink(link.target));
      if (current !== link.source) {
        throw new Error(`conflict ${link.name}: ${link.target} points to ${current}`);
      }
      return { ...link, status: 'skip' as const };
    }),
  );

  for (const link of plan) {
    if (link.status === 'skip') {
      console.log(`skip ${link.name}: already linked`);
      continue;
    }
    if (preview) {
      console.log(`preview ${link.name}: ${link.source} -> ${link.target}`);
      continue;
    }
    await mkdir(path.dirname(link.target), { recursive: true });
    await symlink(path.relative(path.dirname(link.target), link.source), link.target, 'file');
    console.log(`sync ${link.name}: ${link.source} -> ${link.target}`);
  }
}

function absolutePath(value: string | undefined): string | undefined {
  return value && path.isAbsolute(value) ? value : undefined;
}

async function maybeLstat(filePath: string) {
  try {
    return await lstat(filePath);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}
