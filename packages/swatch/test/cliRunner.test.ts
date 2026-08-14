// Verifies CLI dispatch, JSON output, help, and error stream behavior.

import { describe, expect, it, vi } from 'vitest';

import { helpText, runCli } from '../src/cliRunner.js';
import { CatalogError } from '../src/catalog.js';
import type { CatalogManifest, Theme } from '../src/schema.js';

const manifest: CatalogManifest = {
  revision: 'a'.repeat(40),
  defaultTheme: 'one-dark',
  themes: ['one-dark'],
};
const theme = {
  id: 'one-dark',
  name: 'One Dark',
  variant: 'dark',
  palette: Object.fromEntries(
    [
      '00',
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
      '07',
      '08',
      '09',
      '0A',
      '0B',
      '0C',
      '0D',
      '0E',
      '0F',
      '10',
      '11',
      '12',
      '13',
      '14',
      '15',
      '16',
      '17',
    ].map((suffix) => [`base${suffix}`, '#abcdef']),
  ),
} as Theme;

describe('runCli', () => {
  it('writes one theme ID per line only to stdout', async () => {
    const output = captureOutput();

    await expect(runCli(['list'], options(output))).resolves.toBe(0);
    expect(output.stdout).toEqual(['one-dark\n']);
    expect(output.stderr).toEqual([]);
  });

  it('writes the catalog manifest as JSON when requested', async () => {
    const output = captureOutput();

    await expect(runCli(['list', '--json'], options(output))).resolves.toBe(0);
    expect(output.stdout).toEqual([`${JSON.stringify(manifest, null, 2)}\n`]);
    expect(output.stderr).toEqual([]);
  });

  it('reads one requested theme and writes it as JSON', async () => {
    const output = captureOutput();
    let requestedThemeId: string | undefined;
    const catalog = {
      readManifest: async () => manifest,
      readTheme: async (themeId: string) => {
        requestedThemeId = themeId;
        return theme;
      },
    };

    await expect(runCli(['get', 'one-dark'], { io: output.io, catalog })).resolves.toBe(0);
    expect(requestedThemeId).toBe('one-dark');
    expect(output.stdout).toEqual([`${JSON.stringify(theme, null, 2)}\n`]);
    expect(output.stderr).toEqual([]);
  });

  it('writes global and command help only to stderr', async () => {
    for (const args of [
      ['--help'],
      ['list', '--help'],
      ['get', '-h'],
      ['current', '--help'],
      ['use', '-h'],
    ]) {
      const output = captureOutput();

      await expect(runCli(args, options(output))).resolves.toBe(0);
      expect(output.stdout).toEqual([]);
      expect(output.stderr.join('')).toContain('Usage:');
    }
  });

  it('reports missing, unknown, and invalid command arguments as usage errors', async () => {
    for (const args of [
      [],
      ['unknown'],
      ['list', 'extra'],
      ['list', '--json', '--json'],
      ['get'],
      ['get', 'one', 'two'],
      ['current', '--json', '--path'],
      ['current', '--unknown'],
      ['use'],
      ['use', 'one', 'two'],
    ]) {
      const output = captureOutput();

      await expect(runCli(args, options(output))).resolves.toBe(1);
      expect(output.stdout).toEqual([]);
      expect(output.stderr.join('')).toContain('Error:');
      expect(output.stderr.join('')).toContain(helpText());
    }
  });

  it('reports catalog failures only to stderr', async () => {
    const output = captureOutput();
    const catalog = {
      readManifest: async () => {
        throw new CatalogError('Missing catalog manifest');
      },
      readTheme: async () => theme,
    };

    await expect(runCli(['list'], { io: output.io, catalog })).resolves.toBe(1);
    expect(output.stdout).toEqual([]);
    expect(output.stderr).toEqual(['Error: Missing catalog manifest\n']);
  });

  it('does not read or write current state when the catalog is unavailable', async () => {
    const output = captureOutput();
    const currentOptions = options(output);
    currentOptions.catalog.readManifest.mockRejectedValue(
      new CatalogError('Missing catalog manifest. Run `pnpm build` first'),
    );

    await expect(runCli(['current'], currentOptions)).resolves.toBe(1);

    expect(currentOptions.state.readCurrentTheme).not.toHaveBeenCalled();
    expect(currentOptions.state.selectCurrentTheme).not.toHaveBeenCalled();
    expect(output.stdout).toEqual([]);
    expect(output.stderr).toEqual(['Error: Missing catalog manifest. Run `pnpm build` first\n']);
  });

  it('reads the current ID and resolved Theme', async () => {
    const output = captureOutput();
    const currentOptions = options(output);

    await expect(runCli(['current'], currentOptions)).resolves.toBe(0);
    await expect(runCli(['current', '--json'], currentOptions)).resolves.toBe(0);

    expect(output.stdout).toEqual(['one-dark\n', `${JSON.stringify(theme, null, 2)}\n`]);
    expect(currentOptions.state.readCurrentTheme).toHaveBeenCalledTimes(2);
  });

  it('validates and selects a requested theme', async () => {
    const output = captureOutput();
    const currentOptions = options(output);

    await expect(runCli(['use', 'one-dark'], currentOptions)).resolves.toBe(0);

    expect(currentOptions.catalog.readTheme).toHaveBeenCalledWith('one-dark');
    expect(currentOptions.state.selectCurrentTheme).toHaveBeenCalledWith(
      'one-dark',
      manifest,
      currentOptions.catalog.readTheme,
    );
    expect(output.stdout).toEqual(['one-dark\n']);
  });
});

function options(output: ReturnType<typeof captureOutput>) {
  return {
    io: output.io,
    catalog: {
      readManifest: vi.fn(async () => manifest),
      readTheme: vi.fn(async () => theme),
    },
    state: {
      readCurrentTheme: vi.fn(async () => theme),
      selectCurrentTheme: vi.fn(async (themeId, manifest, readTheme) => {
        await readTheme(themeId);
      }),
    },
  };
}

function captureOutput() {
  const stdout: string[] = [];
  const stderr: string[] = [];

  return {
    stdout,
    stderr,
    io: {
      stdout: (value: string) => stdout.push(value),
      stderr: (value: string) => stderr.push(value),
    },
  };
}
