import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function planDirectory(): string {
  const argument = process.argv.find((arg) => arg.startsWith('--plan-dir='));
  if (!argument) throw new Error('missing --plan-dir');
  const directory = argument.slice('--plan-dir='.length);
  if (!path.isAbsolute(directory)) throw new Error('--plan-dir must be absolute');
  return directory;
}

try {
  const binHome = process.env.XDG_BIN_HOME ?? path.join(homedir(), '.local', 'bin');
  const directory = planDirectory();
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, 'state.json'),
    `${JSON.stringify([
      {
        name: 'state/command',
        source: path.join(packageRoot, 'dist', 'cli.js'),
        target: path.join(binHome, 'forge-state'),
      },
    ])}\n`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
