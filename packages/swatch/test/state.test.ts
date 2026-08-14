// Verifies current-theme selection through the Forge State Hub.

import { StateClient } from '@forge/state';

import { describe, expect, it } from 'vitest';

import type { CatalogManifest, Theme } from '../src/schema.js';
import { readCurrentTheme, selectCurrentTheme, StateError } from '../src/state.js';

const manifest: CatalogManifest = {
  revision: 'a'.repeat(40),
  defaultTheme: 'default-dark',
  themes: ['default-dark', 'one-dark'],
};

function themeOf(id: string): Theme {
  return {
    id,
    name: id,
    variant: 'dark',
    palette: {
      base00: '#000000',
      base01: '#000000',
      base02: '#000000',
      base03: '#000000',
      base04: '#000000',
      base05: '#000000',
      base06: '#000000',
      base07: '#000000',
      base08: '#000000',
      base09: '#000000',
      base0A: '#000000',
      base0B: '#000000',
      base0C: '#000000',
      base0D: '#000000',
      base0E: '#000000',
      base0F: '#000000',
      base10: '#000000',
      base11: '#000000',
      base12: '#000000',
      base13: '#000000',
      base14: '#000000',
      base15: '#000000',
      base16: '#000000',
      base17: '#000000',
    },
  };
}

function fakeReadTheme(id: string): Promise<Theme> {
  return Promise.resolve(themeOf(id));
}

describe('readCurrentTheme', () => {
  it('returns the persisted theme when available', async () => {
    const client = new FakeStateClient({ 'swatch.theme': themeOf('one-dark') });

    await expect(readCurrentTheme(manifest, fakeReadTheme, client)).resolves.toEqual(
      themeOf('one-dark'),
    );
  });

  it('initializes the catalog default and writes both keys when state is missing', async () => {
    const client = new FakeStateClient({});

    await expect(readCurrentTheme(manifest, fakeReadTheme, client)).resolves.toEqual(
      themeOf('default-dark'),
    );
    expect(client.values['swatch.selection']).toEqual({ id: 'default-dark' });
    expect(client.values['swatch.theme']).toEqual(themeOf('default-dark'));
  });

  it('rejects a dangling selection without a matching theme', async () => {
    const client = new FakeStateClient({ 'swatch.selection': { id: 'missing' } });

    await expect(readCurrentTheme(manifest, fakeReadTheme, client)).rejects.toThrow(StateError);
  });
});

describe('selectCurrentTheme', () => {
  it('writes the selection and projected theme', async () => {
    const client = new FakeStateClient({});

    await selectCurrentTheme('one-dark', manifest, fakeReadTheme, client);

    expect(client.values['swatch.selection']).toEqual({ id: 'one-dark' });
    expect(client.values['swatch.theme']).toEqual(themeOf('one-dark'));
  });

  it('rejects an unknown theme id without writing', async () => {
    const client = new FakeStateClient({});

    await expect(selectCurrentTheme('missing', manifest, fakeReadTheme, client)).rejects.toThrow(
      StateError,
    );
    expect(Object.keys(client.values)).toHaveLength(0);
  });
});

class FakeStateClient extends StateClient {
  values: Record<string, unknown> = {};

  constructor(initial: Record<string, unknown> = {}) {
    super({ socketPath: '/unused' });
    this.values = { ...initial };
  }

  override async get(keys: string[]): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(this.values, key)) {
        result[key] = this.values[key];
      }
    }
    return result;
  }

  override async set(key: string, value: unknown): Promise<number> {
    this.values[key] = value;
    return 1;
  }
}
