import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type StateEntry = { revision: number; value: unknown };

export function defaultStateHome(): string {
  const stateHome = process.env.XDG_STATE_HOME;
  if (stateHome && path.isAbsolute(stateHome)) return stateHome;
  return path.join(homedir(), '.local', 'state');
}

export function defaultForgeStateDirectory(): string {
  return path.join(defaultStateHome(), 'forge');
}

export function defaultSocketPath(): string {
  return path.join(defaultForgeStateDirectory(), 'state.sock');
}

export function defaultSentinelPath(): string {
  return path.join(defaultForgeStateDirectory(), '.changed');
}

export class StateStore {
  private statesDirectory: string;
  private revisionFile: string;
  private sentinelFile: string;

  constructor(directory = defaultForgeStateDirectory()) {
    this.statesDirectory = path.join(directory, 'states');
    this.revisionFile = path.join(directory, 'revision');
    this.sentinelFile = path.join(directory, '.changed');
  }

  async initialize(): Promise<void> {
    await mkdir(this.statesDirectory, { recursive: true, mode: 0o700 });
  }

  async getRevision(): Promise<number> {
    try {
      const contents = await readFile(this.revisionFile, 'utf8');
      const parsed = Number.parseInt(contents.trim(), 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    } catch (error) {
      if (isFileNotFound(error)) return 0;
      throw error;
    }
  }

  async incrementRevision(): Promise<number> {
    const revision = (await this.getRevision()) + 1;
    await this.writeAtomic(this.revisionFile, `${revision}\n`);
    return revision;
  }

  async get(key: string): Promise<StateEntry | undefined> {
    const filePath = this.filePathFor(key);
    try {
      const contents = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(contents) as StateEntry;
      return { revision: parsed.revision, value: parsed.value };
    } catch (error) {
      if (isFileNotFound(error)) return undefined;
      throw error;
    }
  }

  async getMany(keys: string[]): Promise<Record<string, StateEntry>> {
    const entries: Record<string, StateEntry> = {};
    await Promise.all(
      keys.map(async (key) => {
        const entry = await this.get(key);
        if (entry) entries[key] = entry;
      }),
    );
    return entries;
  }

  async set(key: string, value: unknown): Promise<number> {
    const revision = await this.incrementRevision();
    await this.writeAtomic(
      this.filePathFor(key),
      `${JSON.stringify({ revision, value })}
`,
    );
    await this.updateSentinel(revision);
    return revision;
  }

  sentinelPath(): string {
    return this.sentinelFile;
  }

  private async updateSentinel(revision: number): Promise<void> {
    try {
      await writeFile(
        this.sentinelFile,
        `${revision}
`,
      );
    } catch {
      // Sentinel is best-effort; consumers can fall back to polling or manual reload.
    }
  }

  async keys(): Promise<string[]> {
    try {
      const files = await readdir(this.statesDirectory);
      return files
        .filter((file) => file.endsWith('.json'))
        .map((file) => decodeKey(file.slice(0, -5)))
        .sort();
    } catch (error) {
      if (isFileNotFound(error)) return [];
      throw error;
    }
  }

  private filePathFor(key: string): string {
    return path.join(this.statesDirectory, `${encodeKey(key)}.json`);
  }

  private async writeAtomic(filePath: string, contents: string): Promise<void> {
    const directory = path.dirname(filePath);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporaryPath = path.join(directory, `.${path.basename(filePath)}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporaryPath, contents, { flag: 'wx', mode: 0o600 });
      await rename(temporaryPath, filePath);
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }
}

function encodeKey(key: string): string {
  return key.replace(
    /[^a-zA-Z0-9]/g,
    (char) => `_${char.charCodeAt(0).toString(16).padStart(2, '0')}`,
  );
}

function decodeKey(encoded: string): string {
  return encoded.replace(/_([0-9a-f]{2})/g, (_, hex) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

function isFileNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}
