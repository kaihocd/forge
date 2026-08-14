import { spawnSync } from 'node:child_process';

import { loadConfig } from './lib/config.js';
import { errTag, okTag, red, skipTag } from './lib/colors.js';
import { applySyncPlan, createSyncPlan } from './sync/linker.js';
import { collectPackageSyncEntries } from './sync/packages.js';

const args = new Set(process.argv.slice(2));
const isPreview = args.has('--preview');
const unknownArgs = [...args].filter((arg) => arg !== '--preview');
if (unknownArgs.length > 0) {
  console.error(`${errTag()} ${red(`unknown argument: ${unknownArgs.join(', ')}`)}`);
  process.exit(1);
}

try {
  const config = await loadConfig();
  const enabledPackages = config.modules.map((module) => module.name);

  const packageEntries = await collectPackageSyncEntries((planDirectory) => {
    if (enabledPackages.length === 0) return;

    const packageArgs = [
      ...enabledPackages.flatMap((name) => ['--filter', name]),
      'run',
      'sync',
      `--plan-dir=${planDirectory}`,
    ];
    const packageResult = spawnSync('pnpm', packageArgs, { stdio: 'inherit' });
    if (packageResult.error) throw packageResult.error;
    if (packageResult.status !== 0) {
      throw new Error(`package sync planning failed with exit code ${packageResult.status ?? 1}`);
    }
  });

  if (packageEntries.length === 0) {
    console.log(`${skipTag()} no links configured`);
    process.exit(0);
  }
  const plan = await createSyncPlan(packageEntries);
  for (const action of plan) {
    if (action.status === 'skip') console.log(`${skipTag()} ${action.name}: already linked`);
    else if (action.status === 'conflict')
      console.log(`${errTag()} ${red(`conflict ${action.name}: ${action.reason}`)}`);
    else
      console.log(
        `${okTag()} ${isPreview ? 'preview' : 'sync'} ${action.name}: ${action.source} -> ${action.target}`,
      );
  }
  if (!isPreview) await applySyncPlan(plan);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${errTag()} ${red(message)}`);
  process.exit(1);
}
