// JSON request/response/event protocol for the Forge State Hub.

export type StateValue = unknown;

export type RequestMessage =
  GetRequest | SetRequest | WatchRequest | UnwatchRequest | HealthRequest;

export type ResponseMessage = SuccessResponse | ErrorResponse;

export type EventMessage = ChangedEvent | SnapshotEvent;

export interface GetRequest {
  id: string;
  method: 'get';
  keys: string[];
}

export interface SetRequest {
  id: string;
  method: 'set';
  key: string;
  value: StateValue;
}

export interface WatchRequest {
  id: string;
  method: 'watch';
  keys: string[];
}

export interface UnwatchRequest {
  id: string;
  method: 'unwatch';
}

export interface HealthRequest {
  id: string;
  method: 'health';
}

export interface SuccessResponse {
  id: string;
  ok: true;
  revision: number;
  values?: Record<string, StateValue>;
}

export interface ErrorResponse {
  id: string;
  ok: false;
  error: string;
}

export interface ChangedEvent {
  event: 'changed';
  keys: string[];
  revision: number;
}

export interface SnapshotEvent {
  event: 'snapshot';
  revision: number;
  values: Record<string, StateValue>;
}

export function parseRequestLine(line: string): RequestMessage {
  let input: unknown;
  try {
    input = JSON.parse(line);
  } catch (error) {
    throw new Error(`invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(input)) throw new Error('request must be a JSON object');
  if (typeof input.id !== 'string') throw new Error('request must have an id string');

  const method = input.method;
  if (method === 'get') return parseGetRequest(input);
  if (method === 'set') return parseSetRequest(input);
  if (method === 'watch') return parseWatchRequest(input);
  if (method === 'unwatch') return { id: input.id, method: 'unwatch' };
  if (method === 'health') return { id: input.id, method: 'health' };

  throw new Error(`unknown method: ${String(method)}`);
}

function parseGetRequest(input: Record<string, unknown>): GetRequest {
  const keys = input.keys;
  if (!isStringArray(keys)) throw new Error('get request requires a keys array of strings');
  return { id: input.id as string, method: 'get', keys };
}

function parseSetRequest(input: Record<string, unknown>): SetRequest {
  if (typeof input.key !== 'string') throw new Error('set request requires a key string');
  return { id: input.id as string, method: 'set', key: input.key, value: input.value };
}

function parseWatchRequest(input: Record<string, unknown>): WatchRequest {
  const keys = input.keys;
  if (!isStringArray(keys)) throw new Error('watch request requires a keys array of strings');
  return { id: input.id as string, method: 'watch', keys };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
