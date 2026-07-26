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
support, and the first zsh and Starship config sources. More config sources will
be added only as real migration needs appear.

## Current Tooling

- `pnpm@10.29.3` for dependency management
- Husky for Git hooks
- Commitlint for commit message validation
- lint-staged for formatting staged files during pre-commit
- Prettier for JS, JSON, Markdown, and YAML formatting
- oxlint for TypeScript script linting, configured by `.oxlintrc.json`
- StyLua for Lua formatting
- TypeScript and tsx for local automation scripts

## Repository Shape

Current structure:

```text
forge/
├── scripts/
│   ├── builders/
│   │   ├── shared.ts
│   │   ├── zshenv.ts
│   │   └── zshrc.ts
│   ├── lib/
│   │   ├── colors.ts
│   │   ├── config.ts
│   │   └── paths.ts
│   ├── start.js
│   ├── brew.ts
│   ├── build.ts
│   └── sync.ts
├── configs/
│   ├── starship/
│   └── zsh/
├── forge.config.yaml
├── package.json
├── pnpm-lock.yaml
└── README.md
```

`forge.config.yaml` declares what gets installed as `brew` packages, `links`
(symlink as-is), and `build` tasks (compile a template). There is no workspace
or multi-package structure by design.

## Setup Workflow

Run the full local setup:

```sh
pnpm start
```

`pnpm start` runs `brew`, `build`, then `sync`. It expects local dependencies to
already be installed; if `node_modules` is missing, it will ask you to run
`pnpm install` first.

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
- `build` compiles templates that need transformation, then writes the result
  directly to its target. Example: `configs/zsh/.zshenv` -> `~/.zshenv`, with
  `ZDOTDIR` resolved at build time.

`build` may write generated files under `dist/`. That directory is gitignored
and rebuilt on demand.

### Build

Build tasks are dispatched to builders registered in `scripts/build.ts`. Each
task declares:

- `builder`: which builder handles it (`zshenv` and `zshrc` are currently
  available)
- `source`: the input, interpreted by the builder (a template file here)
- `output`: where the built file lands
- `opts`: builder-specific data. The `zshenv` builder takes `zdotdir`; the
  `zshrc` builder takes an `aliases` map and injects it at the `{{ aliases }}`
  placeholder.

Built files carry a `GENERATED_BY_FORGE` marker. The build refuses to overwrite
any target that does not contain this marker, so hand-written files are never
clobbered.

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
on any existing non-Forge target instead of overwriting files.

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

## Available Commands

```sh
pnpm install
pnpm start
pnpm brew
pnpm build
pnpm sync:preview
pnpm sync
pnpm lint
pnpm typecheck
pnpm check
pnpm format-check
pnpm format
```

`pnpm check` runs linting, type checking, and format checks without modifying
files. Pre-commit formatting is handled by lint-staged, which only formats
staged files and re-stages the result.

## Roadmap

- Migrate the real `~/.zshrc` and `~/.config/nvim` content into the repo.
- Add a focused validation command for the local environment.
