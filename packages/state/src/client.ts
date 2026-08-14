import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import type { Socket } from 'node:net';
import { setTimeout } from 'node:timers/promises';

import {
  type EventMessage,
  type RequestMessage,
  type ResponseMessage,
  type SnapshotEvent,
} from './protocol.js';
import { defaultForgeStateDirectory, defaultSocketPath } from './persistence.js';

export type ClientOptions = {
  socketPath?: string;
  connectTimeout?: number;
};

export type WatchHandler = (snapshot: SnapshotEvent) => void;

export class StateClient {
  private socketPath: string;
  private connectTimeout: number;

  constructor(options: ClientOptions = {}) {
    this.socketPath = options.socketPath ?? defaultSocketPath();
    this.connectTimeout = options.connectTimeout ?? 5000;
  }

  async get(keys: string[]): Promise<Record<string, unknown>> {
    const response = await this.request({ id: nextId(), method: 'get', keys });
    if (!response.ok) throw new Error(response.error);
    return response.values ?? {};
  }

  async set(key: string, value: unknown): Promise<number> {
    const response = await this.request({ id: nextId(), method: 'set', key, value });
    if (!response.ok) throw new Error(response.error);
    return response.revision;
  }

  async health(): Promise<number> {
    const response = await this.request({ id: nextId(), method: 'health' });
    if (!response.ok) throw new Error(response.error);
    return response.revision;
  }

  async watch(keys: string[], handler: WatchHandler): Promise<() => void> {
    const socket = await this.connectSocket();
    return new Promise((resolve, reject) => {
      const requestId = nextId();
      let buffer = '';
      const errorHandler = (error: Error) => reject(error);

      socket.write(`${JSON.stringify({ id: requestId, method: 'watch', keys })}
`);
      socket.on('data', (data) => {
        buffer += data.toString('utf8');
        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (line.length === 0) continue;

          const parsed = JSON.parse(line) as EventMessage | ResponseMessage;
          if ('ok' in parsed) {
            if (parsed.ok) {
              socket.removeListener('error', errorHandler);
              socket.on('error', () => {
                // Watch is established; later socket errors are not fatal to the
                // caller because the teardown function can still be used.
              });
              resolve(() => socket.end());
            } else {
              reject(new Error(parsed.error));
            }
            continue;
          }

          if (parsed.event === 'snapshot') {
            handler(parsed);
          }
        }
      });
      socket.on('error', errorHandler);
    });
  }

  private async request(message: RequestMessage): Promise<ResponseMessage> {
    const socket = await this.connectSocket();
    return new Promise((resolve, reject) => {
      let buffer = '';
      socket.setTimeout(this.connectTimeout);
      socket.write(`${JSON.stringify(message)}
`);
      socket.on('data', (data) => {
        buffer += data.toString('utf8');
        const newlineIndex = buffer.indexOf('\n');
        if (newlineIndex < 0) return;
        const line = buffer.slice(0, newlineIndex);
        socket.setTimeout(0);
        socket.end();
        try {
          const response = JSON.parse(line) as ResponseMessage;
          resolve(response);
        } catch (error) {
          reject(error);
        }
      });
      socket.on('error', reject);
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('request timed out'));
      });
    });
  }

  private async connectSocket(): Promise<Socket> {
    const startTime = Date.now();
    let daemonAttempted = false;

    while (Date.now() - startTime < this.connectTimeout) {
      try {
        return await tryConnect(this.socketPath);
      } catch {
        if (!daemonAttempted && this.socketPath === defaultSocketPath()) {
          daemonAttempted = true;
          await startDaemon();
        }
        await setTimeout(100);
      }
    }
    throw new Error(`could not connect to State Hub at ${this.socketPath}`);
  }
}

function tryConnect(socketPath: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect(socketPath);
    socket.on('connect', () => resolve(socket));
    socket.on('error', reject);
  });
}

async function startDaemon(): Promise<void> {
  try {
    const stateDirectory = defaultForgeStateDirectory();
    await import('node:fs/promises').then(({ mkdir }) =>
      mkdir(stateDirectory, { recursive: true, mode: 0o700 }),
    );

    const daemon = spawn('forge-state', ['serve'], {
      detached: true,
      stdio: 'ignore',
    });
    daemon.unref();
    daemon.on('error', () => undefined);
  } catch {
    // If daemon start fails, the connection loop will eventually time out.
  }
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return String(idCounter);
}
