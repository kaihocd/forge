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
- `sync` lets packages expose built artifacts in standard user locations, then
  applies links from enabled configuration modules.

Enabled configuration modules are explicitly registered in
`forge.config.yaml#modules`. Unregistered manifests have no effect. Packages own
their build, sync, and runtime state independently.

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
configs/zsh/files/zshenv.zsh -> ~/.zshenv
configs/zsh/files/zshrc.zsh  -> ~/.config/zsh/.zshrc
configs/zsh/files/keys.zsh   -> ~/.config/zsh/keys.zsh
configs/zsh/files/tools.zsh  -> ~/.config/zsh/tools.zsh
configs/zsh/files/fzf.zsh    -> ~/.config/zsh/fzf.zsh
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
Its catalog is the sole Theme data source. Persistent state stores only the
selected Theme ID at:

```text
${XDG_STATE_HOME:-$HOME/.local/state}/swatch/current.json
```

`current` and `current --json` initialize the catalog default only when state is
missing. `current --path` never creates state. Invalid or dangling state fails
and can only be repaired by an explicit valid `swatch use` selection.

Swatch may own thin runtime adapters that expose its current Palette through a
consumer's APIs. Consumers remain responsible for mapping and applying that
Palette to their appearance configuration.

Swatch syncs its command to `${XDG_BIN_HOME:-$HOME/.local/bin}`, its Zsh
completion to `${XDG_DATA_HOME:-$HOME/.local/share}/zsh/site-functions`, and its
Kitty and WezTerm adapters below
`${XDG_DATA_HOME:-$HOME/.local/share}/swatch`.

WezTerm stores its font selection at
`${XDG_STATE_HOME:-$HOME/.local/state}/wezterm/font.json`.

## Kitty

Forge links the Kitty configuration to `~/.config/kitty`. It maps the current
Swatch Base24 Palette to Kitty colors during configuration evaluation. Each
Kitty process watches the Swatch selection and reloads itself when `swatch use`
atomically replaces the state file; remote control remains disabled.

Regular and bold text use the main font role, while italic and bold italic text
use the comment role. `Shift+Space`, then `Shift+F` opens the font selector. Its
selection is stored at:

```text
${XDG_STATE_HOME:-$HOME/.local/state}/kitty/font.json
```

The same watcher reloads other running Kitty processes after that state changes.
Core `Shift+Space` sequences cover scrollback, search, splits, pane navigation
and resizing, tabs, and direct access to the first 20 tabs.

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
