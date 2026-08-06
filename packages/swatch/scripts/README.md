# Scripts

This directory contains only command entrypoints and their internal modules.

- `build.ts`, `ensure.ts`, `schemes-fetch.ts`, and `schemes-check.ts` are thin
  command entrypoints.
- `lib/build.ts` compiles the CLI and generates and validates the complete
  temporary distribution before replacing `dist/`. A rerun discards temporary
  state left by an interrupted build.
- `lib/completion.ts` generates and validates the static Zsh completion.
- `lib/schemes.ts` owns the upstream Base16 contract and repository cache.
- `lib/themes.ts` transforms Base16 schemes into normalized Base24 themes.
- `../src/schema.ts` owns the generated catalog contract shared with the runtime
  CLI.

These scripts are not part of the runtime CLI and must not write to user
directories.
