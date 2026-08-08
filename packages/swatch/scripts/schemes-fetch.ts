// Fetches the upstream schemes repository into Swatch's local cache.

import path from 'node:path';

import { refreshSchemesCache, schemesCacheDirectory } from './lib/schemes.js';

const result = await refreshSchemesCache();
const destination = path.relative(process.cwd(), schemesCacheDirectory) || '.';

process.stdout.write(
  `Fetched ${result.schemes.length} Base16 schemes to ${destination} at ${result.revision}.\n`,
);
