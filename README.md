# Forge

Forge is my development-environment workspace. It keeps editable configuration
and workspace packages in one checkout, builds generated runtime files, and
links configuration into the paths used by local applications.

## Model

Forge has three setup stages:

```text
pnpm start -> brew -> build -> sync
```

- `brew` converges Homebrew taps, formulae, and casks from `forge.config.yaml`.
- `build` ensures missing external inputs and generates package artifacts inside
  the repository. Domains without generated artifacts do not need a build step.
- `sync` lets enabled packages expose their artifacts and configuration sources in
  standard user locations. Forge aggregates each package's `sync` plan and applies
  the combined installation plan.

Enabled packages are explicitly registered in
`forge.config.yaml#modules`. Unregistered packages have no effect. Each package
owns its build, sync, and runtime state independently.

## Setup

Install dependencies and run the complete setup:

```sh
pnpm install
pnpm start
```

Preview links without writing them:

```sh
pnpm sync:preview
```

The linker skips correct symlinks and fails on regular files, directories,
incorrect symlinks, missing sources, or duplicate targets. It plans every link
before applying any change.

## Zsh

Forge links the editable Zsh configuration into standard locations:

```text
packages/zsh/files/zshenv.zsh -> ~/.zshenv
packages/zsh/files/zshrc.zsh  -> ~/.config/zsh/.zshrc
packages/zsh/files/keys.zsh   -> ~/.config/zsh/keys.zsh
packages/zsh/files/tools.zsh  -> ~/.config/zsh/tools.zsh
packages/zsh/files/fzf.zsh    -> ~/.config/zsh/fzf.zsh
```

`~/.zshenv` sets `ZDOTDIR` to `${XDG_CONFIG_HOME:-$HOME/.config}/zsh` and sources
`${XDG_CONFIG_HOME:-$HOME/.config}/zsh-local/env.zsh` when present. `.zshrc`
contains the core interactive configuration, including completion, and loads focused key, tool,
and fzf configuration files.

History lives under `${XDG_STATE_HOME:-$HOME/.local/state}/zsh`; completion cache
lives under `${XDG_CACHE_HOME:-$HOME/.cache}/zsh`. NVM is initialized with its
official `--no-use` option and the stable `~/.nvm/current/bin` path, keeping Node
available without version resolution during every shell startup.

## Swatch

`packages/swatch` builds a normalized Base24 Theme catalog and a JSON-first CLI.
Its catalog is the sole Theme data source. The selected theme is stored in the
Forge State Hub under the `swatch.theme` key; `swatch.selection` retains only
the Theme ID for recovery.

`current` and `current --json` initialize the catalog default only when state is
missing. Invalid or dangling state fails and can only be repaired by an explicit
valid `swatch use` selection.

Swatch consumers read theme data directly from the Forge State Hub. Each
consumer owns its own mapping from the shared Theme Palette to its appearance
configuration.

Swatch syncs its command to `${XDG_BIN_HOME:-$HOME/.local/bin}` and its Zsh
completion to `${XDG_DATA_HOME:-$HOME/.local/share}/zsh/site-functions`. The
WezTerm package consumes `swatch.theme` through the Forge State Hub and applies
it in its own configuration.

WezTerm stores its font selection at
`${XDG_STATE_HOME:-$HOME/.local/state}/wezterm/font.json`.

## Commands

```sh
pnpm start
pnpm brew
pnpm ensure
pnpm build
pnpm sync:preview
pnpm sync
pnpm test
pnpm check
pnpm fix
```

Package-specific maintenance stays scoped to its workspace, for example:

```sh
pnpm --filter @forge/swatch schemes:check
```

`check` performs non-mutating lint, type, and formatting verification. `fix`
applies safe lint and formatting changes and then runs `check`.

## Tooling

- `pnpm@10.29.3` for workspace management
- TypeScript and tsx for Forge automation
- Vitest for tests
- Oxlint, Prettier, and StyLua for code quality
- Husky, lint-staged, and Commitlint for commit checks

## Contributions

Changes enter `main` through pull requests and squash merging. Pull request
titles use the Conventional Commit rules in `.commitlintrc.json`; GitHub checks
the title again whenever it changes. In this personal repository, the pull
request author must also be the repository owner. Development branch commits
may be temporary because only the squashed pull request is part of the main
history.

Configure GitHub to use the pull request title as the default squash commit
title. After each push to `main`, the history audit validates every new commit
message as a final safeguard. The audit is intentionally post-merge and cannot
undo an invalid commit, so the pull request title is the required pre-merge
contract.
