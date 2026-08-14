#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { StateClient, type ClientOptions } from './client.js';
import {
  defaultForgeStateDirectory,
  defaultSentinelPath,
  defaultSocketPath,
} from './persistence.js';
import { StateServer } from './server.js';

const args = process.argv.slice(2);
const command = args[0];
const commandArgs = args.slice(1);

async function main(): Promise<number> {
  if (command === 'serve') {
    return runServe();
  }

  if (command === 'get') {
    return runGet(commandArgs);
  }

  if (command === 'set') {
    return runSet(commandArgs);
  }

  if (command === 'watch') {
    return runWatch(commandArgs);
  }

  if (command === 'path') {
    console.log(defaultSocketPath());
    return 0;
  }

  if (command === 'sentinel') {
    console.log(defaultSentinelPath());
    return 0;
  }

  if (command === 'doctor') {
    return runDoctor();
  }

  printUsage();
  return 1;
}

async function runServe(): Promise<number> {
  const stateDirectory = defaultForgeStateDirectory();
  await mkdir(stateDirectory, { recursive: true, mode: 0o700 });
  const server = new StateServer();
  await server.start();
  console.log(`State Hub listening on ${defaultSocketPath()}`);

  process.on('SIGINT', async () => {
    await server.stop();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await server.stop();
    process.exit(0);
  });

  // Keep the process alive until a signal arrives.
  await new Promise(() => undefined);
  return 0;
}

async function runGet(keys: string[]): Promise<number> {
  if (keys.length === 0) {
    console.error('Usage: forge-state get <key>...');
    return 1;
  }
  await ensureDaemon();
  const client = new StateClient();
  const values = await client.get(keys);
  console.log(JSON.stringify(values, null, 2));
  return 0;
}

async function runSet(commandArgs: string[]): Promise<number> {
  if (commandArgs.length !== 2) {
    console.error('Usage: forge-state set <key> <json>');
    return 1;
  }
  const [key, rawValue] = commandArgs;
  let value: unknown;
  try {
    value = JSON.parse(rawValue!) as unknown;
  } catch (error) {
    console.error(`invalid JSON value: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
  await ensureDaemon();
  const client = new StateClient();
  const revision = await client.set(key!, value);
  console.log(revision);
  return 0;
}

async function runWatch(keys: string[]): Promise<number> {
  if (keys.length === 0) {
    console.error('Usage: forge-state watch <key>...');
    return 1;
  }
  await ensureDaemon();
  const client = new StateClient();
  const stop = await client.watch(keys, (snapshot) => {
    console.log(JSON.stringify(snapshot));
  });

  process.on('SIGINT', () => {
    stop();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    stop();
    process.exit(0);
  });

  await new Promise(() => undefined);
  return 0;
}

async function runDoctor(): Promise<number> {
  try {
    const client = new StateClient({ connectTimeout: 1000 });
    const revision = await client.health();
    console.log(`State Hub is healthy (revision ${revision})`);
    return 0;
  } catch (error) {
    console.error(
      `State Hub is unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }
}

type SpawnFn = typeof spawn;

async function ensureDaemon(
  spawner: SpawnFn = spawn,
  createClient: (options?: ClientOptions) => StateClient = (options) => new StateClient(options),
  scriptPath: string = fileURLToPath(import.meta.url),
): Promise<void> {
  try {
    const client = createClient({ connectTimeout: 100 });
    await client.health();
    return;
  } catch {
    // Daemon is not running; start it in the background.
  }

  const server = spawner(process.execPath, [scriptPath, 'serve'], {
    detached: true,
    stdio: 'ignore',
  });
  server.unref();
  server.on('error', () => undefined);

  // Wait for the socket to appear.
  const socketPath = defaultSocketPath();
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const client = createClient({ connectTimeout: 100 });
      await client.health();
      return;
    } catch {
      await delay(100);
    }
  }
  throw new Error(`failed to start State Hub at ${socketPath}`);
}

function printUsage(): void {
  console.log(`Forge State Hub

Usage:
  forge-state serve                Start the daemon
  forge-state get <key>...         Read one or more state keys
  forge-state set <key> <json>     Write a state key
  forge-state watch <key>...       Watch keys and print snapshots
  forge-state path                 Print the daemon socket path
  forge-state sentinel             Print the sentinel file path
  forge-state doctor               Check daemon health
`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { ensureDaemon };

function isMainModule(): boolean {
  try {
    return fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '');
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    },
  );
}
