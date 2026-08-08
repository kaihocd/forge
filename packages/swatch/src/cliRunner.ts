// Dispatches Swatch commands independently from the process entrypoint.

import { CatalogError, readManifest, readTheme } from './catalog.js';
import { cliContract, type CliCommandName } from './commands.js';
import type { CatalogManifest, Theme } from './schema.js';
import {
  currentStatePath,
  readOrInitializeCurrentThemeId,
  selectCurrentTheme,
  StateError,
} from './state.js';

interface CliIo {
  stdout: (output: string) => void;
  stderr: (output: string) => void;
}

interface CatalogReader {
  readManifest: () => Promise<CatalogManifest>;
  readTheme: (themeId: string) => Promise<Theme>;
}

interface RunCliOptions {
  io?: CliIo;
  catalog?: CatalogReader;
  state?: StateStore;
}

interface StateStore {
  path: () => string;
  readOrInitialize: (
    manifest: CatalogManifest,
    validateTheme: (themeId: string) => Promise<unknown>,
  ) => Promise<string>;
  select: (themeId: string, manifest: CatalogManifest) => Promise<void>;
}

const defaultIo: CliIo = {
  stdout: (output) => process.stdout.write(output),
  stderr: (output) => process.stderr.write(output),
};
const defaultCatalog: CatalogReader = { readManifest, readTheme };
const defaultState: StateStore = {
  path: currentStatePath,
  readOrInitialize: readOrInitializeCurrentThemeId,
  select: selectCurrentTheme,
};

export async function runCli(args: string[], options: RunCliOptions = {}): Promise<number> {
  const io = options.io ?? defaultIo;
  const catalog = options.catalog ?? defaultCatalog;
  const state = options.state ?? defaultState;
  const [command, ...commandArgs] = args;

  if (command && cliContract.helpFlags.includes(command as '-h' | '--help')) {
    if (commandArgs.length > 0) return usageError(io, 'Help does not accept arguments.');
    io.stderr(helpText());
    return cliContract.exitCodes.success;
  }

  if (!command) {
    return usageError(io, 'Missing command.');
  }

  if (command === 'list') {
    if (isHelpRequest(commandArgs)) {
      io.stderr(commandHelpText('list'));
      return cliContract.exitCodes.success;
    }
    if (commandArgs.length > 1 || (commandArgs.length === 1 && commandArgs[0] !== '--json')) {
      return usageError(io, 'The list command only accepts --json.');
    }

    return runCatalogCommand(
      io,
      async () => catalog.readManifest(),
      (manifest) =>
        commandArgs[0] === '--json'
          ? `${JSON.stringify(manifest, null, 2)}\n`
          : formatThemeIds(manifest.themes),
    );
  }

  if (command === 'get') {
    if (isHelpRequest(commandArgs)) {
      io.stderr(commandHelpText('get'));
      return cliContract.exitCodes.success;
    }
    if (commandArgs.length !== 1) {
      return usageError(io, 'The get command requires exactly one <theme-id>.');
    }

    return runCatalogCommand(io, async () => catalog.readTheme(commandArgs[0]!));
  }

  if (command === 'current') {
    if (isHelpRequest(commandArgs)) {
      io.stderr(commandHelpText('current'));
      return cliContract.exitCodes.success;
    }
    if (
      commandArgs.length > 1 ||
      (commandArgs[0] && !['--json', '--path'].includes(commandArgs[0]))
    ) {
      return usageError(io, 'The current command only accepts --json or --path.');
    }

    return runRuntimeCommand(io, async () => {
      const manifest = await catalog.readManifest();
      if (commandArgs[0] === '--path') return `${state.path()}\n`;
      const themeId = await state.readOrInitialize(manifest, catalog.readTheme);
      if (commandArgs[0] === '--json') {
        return `${JSON.stringify(await catalog.readTheme(themeId), null, 2)}\n`;
      }
      return `${themeId}\n`;
    });
  }

  if (command === 'use') {
    if (isHelpRequest(commandArgs)) {
      io.stderr(commandHelpText('use'));
      return cliContract.exitCodes.success;
    }
    if (commandArgs.length !== 1) {
      return usageError(io, 'The use command requires exactly one <theme-id>.');
    }

    return runRuntimeCommand(io, async () => {
      const themeId = commandArgs[0]!;
      const manifest = await catalog.readManifest();
      await catalog.readTheme(themeId);
      await state.select(themeId, manifest);
      return `${themeId}\n`;
    });
  }

  return usageError(io, `Unknown command: ${command}`);
}

export function helpText(): string {
  const commands = cliContract.commands
    .map(({ usage, description }) => `  ${usage.padEnd(30)} ${description}`)
    .join('\n');

  return `${cliContract.description}\n\nUsage:\n  swatch <command>\n\nCommands:\n${commands}\n\nOptions:\n  -h, --help                    Show help.\n`;
}

function commandHelpText(commandName: CliCommandName): string {
  const command = cliContract.commands.find(({ name }) => name === commandName)!;
  const options = command.options
    .map(({ name, description }) => `  ${name.padEnd(30)} ${description}`)
    .join('\n');
  return `${command.description}\n\nUsage:\n  ${command.usage}\n${options ? `\nOptions:\n${options}\n` : ''}`;
}

function isHelpRequest(args: string[]): boolean {
  return args.length === 1 && cliContract.helpFlags.includes(args[0] as '-h' | '--help');
}

async function runCatalogCommand<Result extends CatalogManifest | Theme>(
  io: CliIo,
  command: () => Promise<Result>,
  format: (result: Result) => string = (result) => `${JSON.stringify(result, null, 2)}\n`,
): Promise<number> {
  return runRuntimeCommand(io, async () => format(await command()));
}

async function runRuntimeCommand(io: CliIo, command: () => Promise<string>): Promise<number> {
  try {
    io.stdout(await command());
    return cliContract.exitCodes.success;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr(`Error: ${message}\n`);
    if (error instanceof CatalogError) return cliContract.exitCodes.catalogError;
    if (error instanceof StateError) return cliContract.exitCodes.stateError;
    return cliContract.exitCodes.usageError;
  }
}

function formatThemeIds(themeIds: string[]): string {
  return themeIds.length === 0 ? '' : `${themeIds.join('\n')}\n`;
}

function usageError(io: CliIo, message: string): number {
  io.stderr(`Error: ${message}\n\n${helpText()}`);
  return cliContract.exitCodes.usageError;
}
