import { rm } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StateClient } from '../src/client.js';
import { StateServer } from '../src/server.js';
import { StateStore } from '../src/persistence.js';

describe('State Hub', () => {
  let directory: string;
  let server: StateServer;
  let client: StateClient;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'forge-state-'));
    const store = new StateStore(directory);
    const socketPath = path.join(directory, 'state.sock');
    server = new StateServer({ store, socketPath });
    await server.start();
    client = new StateClient({ socketPath, connectTimeout: 1000 });
  });

  afterEach(async () => {
    await server.stop();
    await rm(directory, { recursive: true, force: true });
  });

  it('reads and writes state', async () => {
    await client.set('swatch.selection', { id: 'nord' });
    const values = await client.get(['swatch.selection']);
    expect(values).toEqual({ 'swatch.selection': { id: 'nord' } });
  });

  it('returns only requested keys', async () => {
    await client.set('a', 1);
    await client.set('b', 2);
    const values = await client.get(['a']);
    expect(values).toEqual({ a: 1 });
  });

  it('reports health revision', async () => {
    await client.set('x', 1);
    await client.set('x', 2);
    const revision = await client.health();
    expect(revision).toBe(2);
  });

  it('emits snapshots when watched keys change', async () => {
    const snapshots: unknown[] = [];
    const stop = await client.watch(['swatch.selection'], (snapshot) => {
      snapshots.push(snapshot);
    });

    await client.set('swatch.selection', { id: 'nord' });
    await client.set('swatch.selection', { id: 'catppuccin-mocha' });

    await delay(100);
    stop();

    expect(snapshots.length).toBeGreaterThanOrEqual(1);
    expect(snapshots.at(-1)).toMatchObject({
      event: 'snapshot',
      values: { 'swatch.selection': { id: 'catppuccin-mocha' } },
    });
  });
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
