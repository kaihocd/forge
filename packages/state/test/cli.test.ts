import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, type ChildProcess } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StateClient } from '../src/client.js';
import { StateServer } from '../src/server.js';
import { StateStore } from '../src/persistence.js';
import { ensureDaemon } from '../src/cli.js';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'state-cli-'));
  temporaryDirectories.push(directory);
  return directory;
}

function runCli(
  args: string[],
  extraEnv: Record<string, string>,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['exec', 'tsx', 'src/cli.ts', ...args], {
      cwd: packageRoot,
      env: { ...process.env, ...extraEnv },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString('utf8');
    });
    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

describe('state cli', () => {
  it('path prints the daemon socket path', async () => {
    const stateHome = await temporaryDirectory();
    const result = await runCli(['path'], { XDG_STATE_HOME: stateHome });

    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(path.join(stateHome, 'forge', 'state.sock'));
  });

  it('sentinel prints the sentinel file path', async () => {
    const stateHome = await temporaryDirectory();
    const result = await runCli(['sentinel'], { XDG_STATE_HOME: stateHome });

    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(path.join(stateHome, 'forge', '.changed'));
  });

  describe('with a running server', () => {
    let stateHome: string;
    let server: StateServer;

    beforeEach(async () => {
      stateHome = await temporaryDirectory();
      const forgeDirectory = path.join(stateHome, 'forge');
      server = new StateServer({
        store: new StateStore(forgeDirectory),
        socketPath: path.join(forgeDirectory, 'state.sock'),
      });
      await server.start();
    });

    afterEach(async () => {
      await server.stop();
    });

    it('doctor reports healthy', async () => {
      const result = await runCli(['doctor'], { XDG_STATE_HOME: stateHome });

      expect(result.code).toBe(0);
      expect(result.stdout).toMatch(/State Hub is healthy/);
    });

    it('get returns an empty object for unknown keys', async () => {
      const result = await runCli(['get', 'unknown.key'], { XDG_STATE_HOME: stateHome });

      expect(result.code).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({});
    });

    it('set writes a key and get reads it back', async () => {
      const setResult = await runCli(['set', 'test.key', JSON.stringify({ value: 42 })], {
        XDG_STATE_HOME: stateHome,
      });
      expect(setResult.code).toBe(0);
      expect(Number(setResult.stdout.trim())).toBeGreaterThan(0);

      const getResult = await runCli(['get', 'test.key'], { XDG_STATE_HOME: stateHome });
      expect(getResult.code).toBe(0);
      expect(JSON.parse(getResult.stdout)).toEqual({
        'test.key': { value: 42 },
      });
    });
  });
});

describe.sequential('ensureDaemon', () => {
  let originalXdg: string | undefined;
  const servers: StateServer[] = [];

  beforeEach(() => {
    originalXdg = process.env.XDG_STATE_HOME;
  });

  afterEach(async () => {
    process.env.XDG_STATE_HOME = originalXdg;
    await Promise.all(servers.splice(0).map((server) => server.stop()));
  });

  async function startServer(stateHome: string): Promise<StateServer> {
    const forgeDirectory = path.join(stateHome, 'forge');
    const server = new StateServer({
      store: new StateStore(forgeDirectory),
      socketPath: path.join(forgeDirectory, 'state.sock'),
    });
    await server.start();
    servers.push(server);
    return server;
  }

  it('does not spawn when the daemon is already healthy', async () => {
    const stateHome = await temporaryDirectory();
    process.env.XDG_STATE_HOME = stateHome;
    await startServer(stateHome);

    const spawnMock = vi.fn(() => ({ unref: vi.fn(), on: vi.fn() }) as unknown as ChildProcess);
    await ensureDaemon(spawnMock as unknown as typeof spawn);

    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('spawns the daemon when it is not running and waits for it to become healthy', async () => {
    const stateHome = await temporaryDirectory();
    process.env.XDG_STATE_HOME = stateHome;

    const spawnMock = vi.fn(() => {
      void startServer(stateHome);
      return { unref: vi.fn(), on: vi.fn() } as unknown as ChildProcess;
    });

    await ensureDaemon(spawnMock as unknown as typeof spawn);

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const scriptArgument = (spawnMock.mock.calls[0] as unknown[][])[1];
    expect((scriptArgument as string[])[0]).toMatch(/cli\.(js|ts)$/);
  });

  it('throws when the daemon never becomes healthy', async () => {
    const stateHome = await temporaryDirectory();
    process.env.XDG_STATE_HOME = stateHome;

    const createClient = () =>
      ({
        health: vi.fn().mockRejectedValue(new Error('still down')),
      }) as unknown as StateClient;
    const spawnMock = vi.fn(() => ({ unref: vi.fn(), on: vi.fn() }) as unknown as ChildProcess);

    await expect(ensureDaemon(spawnMock as unknown as typeof spawn, createClient)).rejects.toThrow(
      /failed to start State Hub/,
    );
  }, 7000);
});
