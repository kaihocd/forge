import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildZshRuntime } from '../scripts/builders/zsh-runtime.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('zsh runtime builder', () => {
  it('links declared runtime files and derives discovery directories from their outputs', async () => {
    const root = await temporaryDirectory();
    await writeRuntimeSources(root);
    await writeTemplate(root);

    await buildZshRuntime(runtimeTask(), root);

    expect(await readlink(path.join(root, 'dist/bin/swatch'))).toBe(
      '../../packages/swatch/dist/cli.js',
    );
    expect(await readlink(path.join(root, 'dist/completions/_swatch'))).toBe(
      '../../packages/swatch/dist/completions/_swatch',
    );
    const zshrc = await readFile(path.join(root, 'dist/zsh/.zshrc'), 'utf8');
    expect(zshrc).toContain(`'${path.join(root, 'dist/bin')}'`);
    expect(zshrc).toContain(`'${path.join(root, 'dist/completions')}'`);
    expect(zshrc.indexOf('autoload -Uz compinit')).toBeLessThan(zshrc.indexOf('# Aliases'));
  });

  it('validates every source before creating runtime links', async () => {
    const root = await temporaryDirectory();
    await writeRuntimeSources(root);
    await rm(path.join(root, 'packages/swatch/dist/completions/_swatch'));
    await writeTemplate(root);

    await expect(buildZshRuntime(runtimeTask(), root)).rejects.toThrow(
      /missing zsh runtime swatch completion/,
    );
    await expect(lstat(path.join(root, 'dist/bin/swatch'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('validates every config source before creating runtime links', async () => {
    const root = await temporaryDirectory();
    await writeRuntimeSources(root);
    await writeTemplate(root);
    const task = runtimeTask();
    task.opts.sources.push('./configs/zsh/missing.zsh');

    await expect(buildZshRuntime(task, root)).rejects.toThrow(/missing zsh runtime config source/);
    await expect(lstat(path.join(root, 'dist/bin/swatch'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('rejects an unmanaged runtime config before creating links', async () => {
    const root = await temporaryDirectory();
    await writeRuntimeSources(root);
    await writeTemplate(root);
    await mkdir(path.join(root, 'dist/zsh'), { recursive: true });
    await writeFile(path.join(root, 'dist/zsh/.zshrc'), 'unmanaged');

    await expect(buildZshRuntime(runtimeTask(), root)).rejects.toThrow(
      /not a Forge-generated regular file/,
    );
    await expect(lstat(path.join(root, 'dist/bin/swatch'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('rejects a zshrc that shares a link output', async () => {
    const root = await temporaryDirectory();
    await writeRuntimeSources(root);
    await writeTemplate(root);
    const task = runtimeTask();
    task.output = './dist/bin/swatch';

    await expect(buildZshRuntime(task, root)).rejects.toThrow(/conflicting zsh runtime outputs/);
    await expect(lstat(path.join(root, 'dist/bin/swatch'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('rejects nested outputs before creating links', async () => {
    const root = await temporaryDirectory();
    await writeRuntimeSources(root);
    await writeTemplate(root);
    const task = runtimeTask();
    task.opts.executables[0].output = './dist/bin';
    task.opts.completions[0].output = './dist/bin/swatch';

    await expect(buildZshRuntime(task, root)).rejects.toThrow(/conflicting zsh runtime outputs/);
    await expect(lstat(path.join(root, 'dist/bin'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects outputs that overlap inputs before creating links', async () => {
    const root = await temporaryDirectory();
    await writeRuntimeSources(root);
    await writeTemplate(root);
    const task = runtimeTask();
    task.output = './configs/zsh';

    await expect(buildZshRuntime(task, root)).rejects.toThrow(/zsh runtime output overlaps input/);
    await expect(lstat(path.join(root, 'dist/bin/swatch'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('rejects templates without every required token before creating links', async () => {
    const root = await temporaryDirectory();
    await writeRuntimeSources(root);
    await writeTemplate(root);
    await writeSource(root, 'configs/zsh/zshrc.zsh', '{{ executable_dirs }}\n');

    await expect(buildZshRuntime(runtimeTask(), root)).rejects.toThrow(
      /exactly one \{\{ completion_dirs \}\}/,
    );
    await expect(lstat(path.join(root, 'dist/bin/swatch'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('rejects a generated output symlink before creating runtime links', async () => {
    const root = await temporaryDirectory();
    await writeRuntimeSources(root);
    await writeTemplate(root);
    await mkdir(path.join(root, 'dist/zsh'), { recursive: true });
    await writeSource(root, 'other-zshrc', '# GENERATED_BY_FORGE\n');
    await symlink('../../other-zshrc', path.join(root, 'dist/zsh/.zshrc'));

    await expect(buildZshRuntime(runtimeTask(), root)).rejects.toThrow(
      /not a Forge-generated regular file/,
    );
    await expect(lstat(path.join(root, 'dist/bin/swatch'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('rejects a runtime output whose ancestor is a symlink', async () => {
    const root = await temporaryDirectory();
    await writeRuntimeSources(root);
    await writeTemplate(root);
    await mkdir(path.join(root, 'external-bin'));
    await mkdir(path.join(root, 'dist'));
    await symlink('../external-bin', path.join(root, 'dist/bin'));

    await expect(buildZshRuntime(runtimeTask(), root)).rejects.toThrow(/symlink ancestor/);
    await expect(lstat(path.join(root, 'external-bin/swatch'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('rejects a generated output whose ancestor is a symlink', async () => {
    const root = await temporaryDirectory();
    await writeRuntimeSources(root);
    await writeTemplate(root);
    await mkdir(path.join(root, 'external-zsh'));
    await mkdir(path.join(root, 'dist'));
    await symlink('../external-zsh', path.join(root, 'dist/zsh'));

    await expect(buildZshRuntime(runtimeTask(), root)).rejects.toThrow(/symlink ancestor/);
    await expect(lstat(path.join(root, 'dist/bin/swatch'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(lstat(path.join(root, 'external-zsh/.zshrc'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('rejects a non-executable CLI before creating links', async () => {
    const root = await temporaryDirectory();
    await writeRuntimeSources(root);
    await chmod(path.join(root, 'packages/swatch/dist/cli.js'), 0o644);
    await writeTemplate(root);

    await expect(buildZshRuntime(runtimeTask(), root)).rejects.toMatchObject({ code: 'EACCES' });
    await expect(lstat(path.join(root, 'dist/bin/swatch'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});

function runtimeTask() {
  return {
    source: './configs/zsh/zshrc.zsh',
    output: './dist/zsh/.zshrc',
    opts: {
      executables: [
        {
          name: 'swatch',
          source: './packages/swatch/dist/cli.js',
          output: './dist/bin/swatch',
        },
      ],
      completions: [
        {
          name: 'swatch completion',
          source: './packages/swatch/dist/completions/_swatch',
          output: './dist/completions/_swatch',
        },
      ],
      sources: ['./configs/zsh/completion.zsh', './configs/zsh/aliases.zsh'],
    },
  };
}

async function writeTemplate(root: string): Promise<void> {
  await writeSource(
    root,
    'configs/zsh/zshrc.zsh',
    'path=(\n{{ executable_dirs }}\n  $path\n)\nfpath=(\n{{ completion_dirs }}\n  $fpath\n)\n',
  );
  await writeSource(root, 'configs/zsh/completion.zsh', 'autoload -Uz compinit\ncompinit\n');
  await writeSource(root, 'configs/zsh/aliases.zsh', '# Aliases\nalias ll="ls -l"\n');
}

async function writeSource(root: string, relativePath: string, content = 'source'): Promise<void> {
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

async function writeRuntimeSources(root: string): Promise<void> {
  await writeSource(root, 'packages/swatch/dist/cli.js');
  await chmod(path.join(root, 'packages/swatch/dist/cli.js'), 0o755);
  await writeSource(root, 'packages/swatch/dist/completions/_swatch');
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'forge-zsh-runtime-'));
  temporaryDirectories.push(directory);
  return directory;
}
