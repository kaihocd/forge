#!/usr/bin/env node

// Provides the runtime entrypoint for the built Swatch CLI.

import { runCli } from './cliRunner.js';

process.exitCode = await runCli(process.argv.slice(2));
