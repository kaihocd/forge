# Swatch

Swatch is a versioned theme palette catalog and current-theme selector with a
JSON-first CLI.

It ships normalized theme data and provides commands for listing themes, reading
them, and selecting the current Theme ID. Consumers remain responsible for
transforming and applying themes to tools such as Neovim and tmux.

Swatch does not write consumer configuration, reload applications, or provide
consumer-specific export formats.

The package must be built before use. A build compiles the CLI and transforms
cached Base16 schemes into a normalized Base24 catalog under `dist/`.

## Package Shape

- `src/` contains the runtime CLI.
- `src/catalog.ts` reads and validates the built manifest and themes without
  depending on the current working directory.
- `src/state.ts` stores only the selected Theme ID in
  `~/.forge/swatch/current.json`.
- `scripts/` assembles the package and fetches, validates, and processes themes.
- `test/` contains local upstream fixtures and catalog, CLI, completion, state,
  cache publication, scheme, and theme contract tests.
- `.cache/schemes/` is the complete unprocessed shallow clone of the upstream
  schemes repository, including its Git metadata. It is generated locally and
  not tracked.
- `.build/` is disposable staging output, while `.dist-backup/` is used to
  recover interrupted publication. Neither is tracked.
- `dist/` is the complete runnable application, including generated JavaScript,
  the processed catalog, and shell completions. It is not tracked.

## Commands

Run package commands from the repository root through the workspace scope:

```sh
pnpm --filter @forge/swatch start -- list
pnpm --filter @forge/swatch ensure
pnpm --filter @forge/swatch build

pnpm --filter @forge/swatch schemes:fetch
pnpm --filter @forge/swatch schemes:check

pnpm --filter @forge/swatch test
pnpm --filter @forge/swatch lint:check
pnpm --filter @forge/swatch lint:fix
pnpm --filter @forge/swatch typecheck
pnpm --filter @forge/swatch format:check
pnpm --filter @forge/swatch format:fix
```

The package `start` script runs the existing `dist/cli.js`; it does not build
from source. `ensure` validates the scheme cache and downloads the current
upstream `spec-0.11` branch only when the cache is completely missing. It never
refreshes or overwrites existing input implicitly. `schemes:fetch` explicitly
downloads that branch, validates every Base16 YAML file and generated Theme in a
temporary directory, and safely replaces `.cache/schemes/` while preserving the
last known-good cache if publication fails. `schemes:check` validates the cached
clone without accessing the network. The default test suite also remains offline
and verifies both input and generated-theme schema contracts with local fixtures.

The package `build` script does not access the network. It revalidates the local
scheme cache, normalizes neutral colors and foreground contrast in OKLab/OKLCH,
derives the Base24 background and bright ANSI colors, and safely publishes one
JSON file per theme plus `dist/catalog/manifest.json`. Every Theme includes its
`dark` or `light` variant. The manifest records the source revision, the stable
theme ID list, and the validated `default-dark` default.

## CLI Contract

The runtime interface uses explicit subcommands:

```sh
swatch list
swatch list --json
swatch get <theme-id>
swatch current
swatch current --json
swatch current --path
swatch use <theme-id>
```

`swatch list` writes one Theme ID per line for direct use with shell pipelines.
`swatch list --json` writes the complete catalog manifest, while `swatch get`
writes one Theme as JSON. `swatch current` writes the selected ID, `--json`
resolves that ID to the complete Theme in the catalog, and `--path` writes the
absolute state path without creating it. `swatch use` validates and selects a
catalog Theme. Successful output uses stdout; help and errors use stderr, and
usage, catalog, and state failures exit non-zero. Runtime commands never access
the network or `.cache/` source data.

The catalog is the only source of Theme data and must be built before any state
command can run. The first `swatch current` or `swatch current --json` creates
`~/.forge/swatch/current.json` with this minimal state:

```json
{
  "id": "default-dark"
}
```

Only a missing state file triggers default initialization. Invalid JSON, an
invalid shape, or an ID absent from the current catalog is reported immediately
and never silently reset. An explicit `swatch use <valid-theme-id>` atomically
replaces invalid content and is the supported repair mechanism. Re-selecting the
current ID does not rewrite the file, avoiding unnecessary watcher events.

List available Theme IDs:

```sh
swatch list
swatch list | rg catppuccin
swatch list | fzf
swatch get "$(swatch list | fzf)"
```

Read the catalog revision and Theme IDs as JSON:

```sh
swatch list --json
```

Read one normalized Base24 Theme:

```sh
swatch get catppuccin-mocha
```

Read or change the current Theme:

```sh
swatch current
swatch current --json
swatch use catppuccin-mocha
```

Show global or command-specific help:

```sh
swatch --help
swatch get --help
```

## Zsh Completion

The package build generates a static Zsh completion at
`dist/completions/_swatch`. It includes the public subcommands and every Theme ID
from the same validated manifest, so completion does not start Node or access
the network.

Swatch writes only its current selection under the Forge-owned
`~/.forge/swatch/` data directory.
