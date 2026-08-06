import { spawnSync } from 'node:child_process';

// Build must finish before sync can link generated outputs, so setup runs in a
// fixed order and stops before later steps can observe incomplete state.
const setupSteps = ['brew', 'build', 'sync'] as const;

for (const step of setupSteps) {
  const result = spawnSync('pnpm', [step], { stdio: 'inherit' });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
