import { createServer, type Server, type Socket } from 'node:net';
import { rm } from 'node:fs/promises';

import {
  type ChangedEvent,
  type RequestMessage,
  type ResponseMessage,
  type SnapshotEvent,
  parseRequestLine,
} from './protocol.js';
import { StateStore, defaultSocketPath } from './persistence.js';

type Subscriber = {
  socket: Socket;
  keys: Set<string>;
};

export type ServerOptions = {
  store?: StateStore;
  socketPath?: string;
};

export class StateServer {
  private store: StateStore;
  private socketPath: string;
  private server?: Server;
  private subscribers = new Map<Socket, Subscriber>();

  constructor(options: ServerOptions = {}) {
    this.store = options.store ?? new StateStore();
    this.socketPath = options.socketPath ?? defaultSocketPath();
  }

  async start(): Promise<void> {
    await this.store.initialize();

    // Remove a stale socket from a previous unclean shutdown.
    try {
      await rm(this.socketPath, { force: true });
    } catch {
      // Ignore.
    }

    return new Promise((resolve, reject) => {
      this.server = createServer((socket) => this.handleConnection(socket));
      this.server.on('error', reject);
      this.server.listen(this.socketPath, () => {
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    for (const { socket } of this.subscribers.values()) {
      socket.destroy();
    }
    this.subscribers.clear();
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => resolve());
    });
  }

  private handleConnection(socket: Socket): void {
    let buffer = '';
    socket.on('data', (data) => {
      buffer += data.toString('utf8');
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (line.length > 0) {
          this.handleRequest(socket, line).catch((error) => {
            this.sendError(socket, 'internal', error);
          });
        }
      }
    });
    socket.on('close', () => {
      this.subscribers.delete(socket);
    });
    socket.on('error', () => {
      this.subscribers.delete(socket);
    });
  }

  private async handleRequest(socket: Socket, line: string): Promise<void> {
    let request: RequestMessage;
    try {
      request = parseRequestLine(line);
    } catch (error) {
      this.sendError(socket, 'parse', error);
      return;
    }

    if (request.method === 'health') {
      this.sendSuccess(socket, request.id, await this.store.getRevision());
      return;
    }

    if (request.method === 'get') {
      const entries = await this.store.getMany(request.keys);
      const revision = await this.store.getRevision();
      const values = mapValues(entries, (entry) => entry.value);
      this.sendSuccess(socket, request.id, revision, values);
      return;
    }

    if (request.method === 'set') {
      const revision = await this.store.set(request.key, request.value);
      this.sendSuccess(socket, request.id, revision);
      await this.notifySubscribers([request.key], revision);
      return;
    }

    if (request.method === 'watch') {
      this.subscribers.set(socket, { socket, keys: new Set(request.keys) });
      const entries = await this.store.getMany(request.keys);
      const revision = await this.store.getRevision();
      const values = mapValues(entries, (entry) => entry.value);
      this.sendSuccess(socket, request.id, revision);
      this.sendSnapshot(socket, revision, values);
      return;
    }

    if (request.method === 'unwatch') {
      this.subscribers.delete(socket);
      this.sendSuccess(socket, request.id, await this.store.getRevision());
      return;
    }
  }

  private async notifySubscribers(changedKeys: string[], revision: number): Promise<void> {
    const interested: Subscriber[] = [];
    for (const subscriber of this.subscribers.values()) {
      if (changedKeys.some((key) => subscriber.keys.has(key))) {
        interested.push(subscriber);
      }
    }
    if (interested.length === 0) return;

    const allKeys = new Set<string>();
    for (const subscriber of interested) {
      for (const key of subscriber.keys) allKeys.add(key);
    }
    const entries = await this.store.getMany([...allKeys]);
    const values = mapValues(entries, (entry) => entry.value);

    const changedEvent: ChangedEvent = { event: 'changed', keys: changedKeys, revision };
    const changedLine = `${JSON.stringify(changedEvent)}\n`;

    for (const subscriber of interested) {
      subscriber.socket.write(changedLine);
      const snapshot: SnapshotEvent = {
        event: 'snapshot',
        revision,
        values: pickValues(values, [...subscriber.keys]),
      };
      subscriber.socket.write(`${JSON.stringify(snapshot)}\n`);
    }
  }

  private sendSuccess(
    socket: Socket,
    id: string,
    revision: number,
    values?: Record<string, unknown>,
  ): void {
    const response: ResponseMessage = { id, ok: true, revision, values };
    socket.write(`${JSON.stringify(response)}\n`);
  }

  private sendError(socket: Socket, id: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const response: ResponseMessage = { id, ok: false, error: message };
    socket.write(`${JSON.stringify(response)}\n`);
  }

  private sendSnapshot(socket: Socket, revision: number, values: Record<string, unknown>): void {
    const event: SnapshotEvent = { event: 'snapshot', revision, values };
    socket.write(`${JSON.stringify(event)}\n`);
  }
}

function mapValues<T, U>(
  record: Record<string, T>,
  fn: (value: T, key: string) => U,
): Record<string, U> {
  const result: Record<string, U> = {};
  for (const [key, value] of Object.entries(record)) {
    result[key] = fn(value, key);
  }
  return result;
}

function pickValues(values: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      result[key] = values[key];
    }
  }
  return result;
}
