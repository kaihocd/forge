# Forge

Forge is my frontend-native development environment workspace.

It is a personal repository for managing editor configuration, terminal setup,
shell environment, machine bootstrap tasks, and workflow tooling as maintainable
software.

## Why

I am a frontend developer, so I want my development environment to be shaped with
the same habits I use in application work:

- package-managed tooling
- scriptable workflows
- formatting and commit checks
- modular structure when it earns its place
- typed automation when shell scripts become too implicit

Forge is not meant to be a pile of copied dotfiles. It is meant to grow into a
small, reproducible system for building and maintaining my own development
environment.

## Current Status

Forge is intentionally early-stage.

The repository currently contains the automation engine, Homebrew bootstrap
support, the first Zsh and Starship config sources, and the initial
Swatch workspace package. More config sources and package functionality will be
added only as real migration needs appear.

## Current Tooling

- `pnpm@10.29.3` for workspace dependency management
- Husky for Git hooks
- Commitlint for commit message validation
- lint-staged for formatting staged files during pre-commit
- Prettier for JS, TypeScript, JSON, Markdown, and YAML formatting
- oxlint for TypeScript source, script, and test linting, configured by
  `.oxlintrc.json`
- StyLua for Lua formatting
- TypeScript and tsx for local automation scripts

## Repository Shape

Current structure:

```text
forge/
├── packages/
│   └── swatch/
│       ├── scripts/
│       ├── src/
│       ├── test/
│       ├── package.json
│       ├── tsconfig.build.json
│       ├── tsconfig.json
│       └── README.md
├── scripts/
│   ├── builders/
│   │   ├── shared.ts
│   │   ├── zsh-runtime.ts
│   │   ├── zshenv.ts
│   ├── lib/
│   │   ├── colors.ts
│   │   ├── config.ts
│   │   └── paths.ts
│   ├── start.ts
│   ├── brew.ts
│   ├── build.ts
│   └── sync.ts
├── test/
│   ├── sync.test.ts
│   └── zsh-runtime.test.ts
├── configs/
│   ├── starship/
│   └── zsh/
├── forge.config.yaml
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
└── README.md
```

`forge.config.yaml` declares what gets installed as `brew` packages, `links`
(symlink as-is), and `build` tasks (generated outputs and declared runtime
links). The repository root owns environment orchestration and workspace-wide
tooling; packages under `packages/` own their domain logic, runtime dependencies,
tests, and build outputs.

`packages/swatch` is a theme catalog CLI package. Its offline build processes a
previously fetched scheme cache and assembles a complete application under
`packages/swatch/dist/`. Its catalog is the sole source of normalized Theme data;
the `current` and `use` commands manage a selected Theme ID under
`~/.forge/swatch/current.json`, initializing the built catalog's `default-dark`
default only when that state file is missing. Invalid JSON, an invalid shape, or
a Theme ID absent from the catalog fails without changing the state and must be
repaired with an explicit valid `swatch use`. Consumers remain responsible for
transforming and applying the resulting palettes. Package-specific cache
maintenance commands remain scoped to the Swatch workspace. Forge installs its
CLI and generated Zsh completion through explicit links in `forge.config.yaml`.

## Setup Workflow

Run the full local setup:

```sh
pnpm start
```

`pnpm start` runs `brew`, `build`, then `sync`. The build step first ensures
workspace package inputs, compiles the packages, and then runs the tasks declared
under `build:` in `forge.config.yaml`. Install local dependencies with
`pnpm install` before running the TypeScript entrypoint.

Run only the Homebrew bootstrap step:

```sh
pnpm brew
```

`pnpm brew` reads `brew.taps`, `brew.formulas`, and `brew.casks` from
`forge.config.yaml`, checks what is already installed, and installs only missing
entries.

## Build vs Sync

Forge installs config in three ways, declared in `forge.config.yaml`:

- `brew` installs Homebrew taps, formulae, and casks idempotently.
- `sync` symlinks repo files that are usable as-is, so edits in the repo take
  effect immediately. Example: `configs/starship/starship.toml` ->
  `~/.config/starship.toml`.
- `build` runs explicit builders that generate managed files and expose declared
  runtime artifacts. Example: `configs/zsh/zshenv.zsh` -> `~/.zshenv`, with
  `ZDOTDIR` resolved at build time.

`build` may write generated files under `dist/`. That directory is gitignored
and rebuilt on demand.

### Build

`pnpm build` first runs each workspace package's optional `ensure` script, then
runs package builds and dispatches the Forge tasks registered in
`scripts/build.ts`. An `ensure` script may obtain a missing external build input,
but must validate and preserve any input that already exists. Each Forge task
declares:

- `builder`: which builder handles it (`zsh-runtime` and `zshenv` are currently
  available)
- `source`: the input, interpreted by the builder (a template file here)
- `output`: where the built file lands
- `opts`: builder-specific data. The `zshenv` builder takes `zdotdir` and
  `localenv`; the `zsh-runtime` builder takes runtime entries and an ordered
  `sources` list.

The `zsh-runtime` builder explicitly maps package-owned executables and
completions into root runtime outputs. Newly created links use relative targets
such as those stored by `dist/bin/swatch` and `dist/completions/_swatch`. The
builder derives their parent directories, injects the resolved absolute `PATH`
and `fpath` entries into the main Zsh source, and directly assembles the final
`.zshrc`. To expose another already-built CLI, declare its executable and
optional completion outputs in `forge.config.yaml`; its package must produce
those artifacts before the Forge builders run.

Forge-generated regular files carry a `GENERATED_BY_FORGE` marker and may only
replace an existing regular file containing that marker. Runtime links use a
separate conservative rule: an existing output is accepted only when it is a
symlink that resolves to the declared source.

The `zshenv` builder also initializes its configured `localenv` file with mode
`0600` when it is missing. This machine-local file is loaded by `~/.zshenv` and
is suitable for proxy settings, SDK paths, and other environment preferences.
Forge never overwrites or deletes it after creation.

Zsh source is split across explicitly ordered files under `configs/zsh/`; the
main source receives runtime discovery paths derived from the declared CLI
outputs. Their assembly order is explicit in `forge.config.yaml`. The built
`dist/zsh/.zshrc` is Forge-owned and disposable. Persistent history and the
rebuildable completion dump both live under `~/.forge/zsh/`; Apple Terminal
sessions are disabled so they cannot write state into `dist/zsh/`.

```sh
pnpm build
```

### Sync

Preview symlink changes before applying them:

```sh
pnpm sync:preview
```

Apply the configured symlinks:

```sh
pnpm sync
```

The linker is intentionally conservative: preview reports conflicts without
changing anything, apply skips links that are already correct, and apply fails
on any existing non-Forge target instead of overwriting files. Apply plans and
validates every configured link before writing, so one conflict cannot leave a
partially synchronized environment.

## Planned Areas

Forge will grow only as real needs appear. Likely areas include:

- editor configuration, especially Neovim
- terminal configuration, including WezTerm and tmux
- more builders for configs that need compilation
- Git and global developer defaults
- a doctor/validation command for the local environment
- migration tooling for adopting existing hand-written configs

## Design Principles

- Prefer executable configuration over documentation-only intent.
- Keep the structure small until repeated work justifies a new abstraction.
- Prefer TypeScript for growing automation logic; keep shell for thin glue.
- Make setup reproducible across machines instead of relying on manual edits.
- Treat personal environment configuration as software that can be reviewed,
  formatted, and evolved.

## Commands

### Daily Workflows

```sh
pnpm install
pnpm start
pnpm ensure
pnpm build
pnpm check
pnpm fix
pnpm test
```

`pnpm start` is the single full-environment setup entrypoint. `pnpm ensure`
aggregates workspace build prerequisites and normally skips valid existing
inputs. `pnpm check` runs linting, type checking, and format checks without
modifying files. `pnpm fix` applies safe lint fixes and repository-wide
formatting; it cannot fix type errors or every lint error. `ensure`, `build`, and
`test` invoke matching package scripts recursively. `check` and `fix` cover
packages through aggregated lint and typecheck steps plus repository-wide
formatting. Root tests cover synchronization and the Zsh runtime builder;
workspace aggregation also runs Swatch's catalog, CLI, completion, state, cache,
scheme, and theme tests.

### Focused Maintenance

```sh
pnpm brew
pnpm sync:preview
pnpm sync

pnpm lint:check
pnpm lint:fix
pnpm typecheck
pnpm format:check
pnpm format:fix
```

The focused quality commands are the individual steps composed by `check` and
`fix`; use them when diagnosing or repairing one class of issue.

Package-specific commands stay in their package instead of receiving root
aliases. Invoke them with a workspace filter, for example:

```sh
pnpm --filter @forge/swatch schemes:fetch
pnpm --filter @forge/swatch schemes:check
```

Pre-commit formatting is handled by lint-staged, which only formats staged
files and re-stages the result.

## Roadmap

- Migrate the real `~/.config/nvim` content into the repo.
- Add a focused validation command for the local environment.
