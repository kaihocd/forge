// Verifies the stable public command, output, and runtime contract.

import { describe, expect, it } from 'vitest';

import { cliContract } from '../src/commands.js';

describe('cliContract', () => {
  it('defines explicit catalog and current-theme subcommands', () => {
    expect(cliContract.commands.map(({ name }) => name)).toEqual(['list', 'get', 'current', 'use']);
    expect(cliContract.commands.find(({ name }) => name === 'get')).toMatchObject({
      usage: 'swatch get <theme-id>',
      arguments: [{ name: 'theme-id', required: true }],
    });
    expect(cliContract.commands.find(({ name }) => name === 'list')).toMatchObject({
      usage: 'swatch list [--json]',
      options: [{ name: '--json' }],
    });
    expect(cliContract.commands.find(({ name }) => name === 'current')).toMatchObject({
      usage: 'swatch current [--json | --path]',
      options: [{ name: '--json' }, { name: '--path' }],
    });
    expect(cliContract.commands.find(({ name }) => name === 'use')).toMatchObject({
      usage: 'swatch use <theme-id>',
      arguments: [{ name: 'theme-id', required: true }],
    });
  });

  it('reserves standard help flags', () => {
    expect(cliContract.helpFlags).toEqual(['-h', '--help']);
  });

  it('keeps machine output separate from help and errors', () => {
    expect(cliContract.output).toEqual({
      success: 'stdout',
      help: 'stderr',
      error: 'stderr',
      formats: {
        list: 'lines',
        listJson: 'json',
        get: 'json',
        current: 'lines',
        currentJson: 'json',
        currentPath: 'lines',
        use: 'lines',
      },
    });
  });

  it('uses zero only for successful commands', () => {
    expect(cliContract.exitCodes).toEqual({
      success: 0,
      usageError: 1,
      catalogError: 1,
      stateError: 1,
    });
  });

  it('forbids runtime network and source-cache access', () => {
    expect(cliContract.runtime).toEqual({ network: false, cache: false });
  });
});
