// Ensures Swatch's external build input exists without refreshing valid input.

import path from 'node:path';

import { ensureSchemesCache, schemesCacheDirectory } from './lib/schemes.js';

const { initialized, result } = await ensureSchemesCache();
const destination = path.relative(process.cwd(), schemesCacheDirectory) || '.';
const action = initialized ? 'Fetched' : 'Validated';

process.stdout.write(
  `${action} ${result.schemes.length} Base16 schemes in ${destination} at ${result.revision}.\n`,
);
