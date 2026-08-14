// Dispatches Swatch commands independently from the process entrypoint.

import { CatalogError, readManifest, readTheme } from './catalog.js';
import { cliContract, type CliCommandName } from './commands.js';
import type { CatalogManifest, Theme } from './schema.js';
import { StateError, readCurrentTheme, selectCurrentTheme } from './state.js';

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
  readCurrentTheme: (
    manifest: CatalogManifest,
    readTheme: (themeId: string) => Promise<Theme>,
  ) => Promise<Theme>;
  selectCurrentTheme: (
    themeId: string,
    manifest: CatalogManifest,
    readTheme: (themeId: string) => Promise<Theme>,
  ) => Promise<void>;
}

const defaultIo: CliIo = {
  stdout: (output) => process.stdout.write(output),
  stderr: (output) => process.stderr.write(output),
};
const defaultCatalog: CatalogReader = { readManifest, readTheme };
const defaultState: StateStore = {
  readCurrentTheme,
  selectCurrentTheme,
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
    if (commandArgs.length > 1 || (commandArgs[0] && commandArgs[0] !== '--json')) {
      return usageError(io, 'The current command only accepts --json.');
    }

    return runRuntimeCommand(io, async () => {
      const manifest = await catalog.readManifest();
      const theme = await state.readCurrentTheme(manifest, catalog.readTheme);
      if (commandArgs[0] === '--json') {
        return `${JSON.stringify(theme, null, 2)}\n`;
      }
      return `${theme.id}\n`;
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
      await state.selectCurrentTheme(themeId, manifest, catalog.readTheme);
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
