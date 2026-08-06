import { spawnSync } from 'node:child_process';

import { loadConfig } from './lib/config.js';
import { errTag, okTag, red, skipTag } from './lib/colors.js';

function runBrew(args: string[], stdio: 'inherit' | 'pipe' = 'inherit') {
  return spawnSync('brew', args, { stdio });
}

function ensureBrew() {
  const result = runBrew(['--version'], 'pipe');

  if (result.error) {
    throw new Error(`${errTag()} ${red('missing brew: command not found')}`);
  }

  if (result.status !== 0) {
    throw new Error(`${errTag()} ${red('missing brew: failed to run brew')}`);
  }
}

function isTapped(tap: string) {
  const result = runBrew(['tap'], 'pipe');

  if (result.status !== 0) {
    throw new Error(`${errTag()} ${red('brew tap: failed to list taps')}`);
  }

  return result.stdout.toString('utf8').split('\n').includes(tap);
}

function isTrusted(tap: string) {
  const result = runBrew(['trust', '--json=v1'], 'pipe');

  if (result.status !== 0) {
    throw new Error(`${errTag()} ${red('brew trust: failed to list trusted taps')}`);
  }

  const trusted = JSON.parse(result.stdout.toString('utf8')) as {
    taps?: unknown;
  };
  return Array.isArray(trusted.taps) && trusted.taps.includes(tap);
}

function isInstalled(kind: 'formula' | 'cask', name: string) {
  const result = runBrew(['list', `--${kind}`, name], 'pipe');
  return result.status === 0;
}

function install(args: string[], label: string) {
  const result = runBrew(args);

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${errTag()} ${red(`${label}: command failed`)}`);
  }
}

try {
  const config = await loadConfig();
  const { taps, formulas, casks } = config.brew;

  if (taps.length === 0 && formulas.length === 0 && casks.length === 0) {
    console.log(`${skipTag()} no brew packages configured`);
    process.exit(0);
  }

  ensureBrew();

  for (const tap of taps) {
    if (isTapped(tap)) {
      console.log(`${skipTag()} tap ${tap}: already tapped`);
    } else {
      console.log(`${okTag()} tap ${tap}: installing`);
      install(['tap', tap], `tap ${tap}`);
    }

    if (isTrusted(tap)) {
      console.log(`${skipTag()} tap ${tap}: already trusted`);
    } else {
      console.log(`${okTag()} tap ${tap}: trusting`);
      install(['trust', '--tap', tap], `trust ${tap}`);
    }
  }

  for (const cask of casks) {
    if (isInstalled('cask', cask)) {
      console.log(`${skipTag()} cask ${cask}: already installed`);
      continue;
    }

    console.log(`${okTag()} cask ${cask}: installing`);
    install(['install', '--cask', cask], `cask ${cask}`);
  }

  for (const formula of formulas) {
    if (isInstalled('formula', formula)) {
      console.log(`${skipTag()} brew ${formula}: already installed`);
      continue;
    }

    console.log(`${okTag()} brew ${formula}: installing`);
    install(['install', formula], `brew ${formula}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
