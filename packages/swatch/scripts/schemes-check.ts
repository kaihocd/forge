// Validates every Base16 scheme in Swatch's local repository cache.

import { readSchemesCache } from './lib/schemes.js';

const result = await readSchemesCache().catch((error: NodeJS.ErrnoException) => {
  if (error.code === 'ENOENT') {
    throw new Error(
      'Scheme cache is missing. Run `pnpm --filter @forge/swatch schemes:fetch` first.',
      { cause: error },
    );
  }
  throw error;
});

process.stdout.write(
  `Validated ${result.schemes.length} cached Base16 schemes at ${result.revision}.\n`,
);
