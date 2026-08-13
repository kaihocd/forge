# Agent Notes

## Repository Shape

- This repo is an early-stage personal development-environment workspace, not a
  traditional app. Current real content is repo tooling, `forge.config.yaml`,
  TypeScript automation under `scripts/`, and the first zsh and Starship config
  sources under `configs/`, plus workspace packages under `packages/`.
- The repository root owns environment orchestration, shared development
  tooling, and workspace-wide command aggregation. Each package owns its domain
  logic, runtime dependencies, tests, and build outputs.
- Root package scripts are the repository's public command surface. Keep them
  limited to repository-wide workflows and Forge-owned domains; do not add root
  aliases that only forward to one package's domain-specific command.
- Workspace packages expose `ensure`, `build`, and `sync` when applicable. Root
  lifecycle commands aggregate those package-owned scripts. `ensure`
  prepares missing external build inputs without refreshing valid existing
  input. Package-specific maintenance commands remain in that package and are invoked with
  `pnpm --filter <package> <command>`.
- Packages own syncing of their runtime artifacts into community-standard user
  directories. `forge.config.yaml#modules` explicitly registers enabled
  configuration manifests. Domain-relative sources resolve from the manifest
  directory; Forge aggregates and applies their installation plans.
- Swatch's built catalog is the sole Theme data source. Its persistent state
  `${XDG_STATE_HOME:-$HOME/.local/state}/swatch/current.json` stores only the
  selected Theme ID. `current` and `current --json` initialize the catalog
  default only when that state is missing; `current --path` never creates it,
  and `use` writes only an explicitly validated selection. Invalid or dangling
  state must fail and can only be repaired by an explicit valid selection.
- Swatch integrations consume Theme data through the public `swatch current
--json` interface and use `current --path` only to register state watchers.
  They must not duplicate catalog/state validation. Runtime discovery must start
  from the current shell startup files, discard inherited shell-derived paths,
  and never cache discovered paths across consumer configuration reloads.
- Workspace packages that produce CLIs are build-first: runtime commands use
  their complete `dist/` output and must not execute TypeScript sources
  directly.
- `.github/workflows/code-checks.yml` runs the repository checks in CI.
- `forge.config.yaml` owns repository-wide Homebrew requirements and the explicit
  config module registry. Config manifests own generic `sync` entries; packages
  do not expose Forge-specific manifests.

## Scripts Layout

- `scripts/` root holds only CLI entrypoints. Entrypoints are thin: parse args,
  call into lib/ or a domain folder, handle exit code. No business logic.
- Commands map 1:1 to entrypoint files (`pnpm start` -> `scripts/start.ts`).
- Shared infrastructure goes in `scripts/lib/` (config loading, path helpers).
- Domain logic goes in a domain folder (`builders/`, future `doctor/`, etc.).

## Commands

- Use `pnpm install` if dependencies need refresh; the repo pins `pnpm@10.29.3`
  via `packageManager`.
- Use `pnpm start` for full local setup after dependencies are installed. It runs
  `brew`, `build`, then `sync`, stopping at the first failed stage.
- Use `pnpm sync:preview` for a read-only link plan.
- Do not use `pnpm setup`; that is pnpm's built-in global setup command, not
  this repo's flow.
- Run `pnpm test` to run Forge tests and tests in workspace packages that define
  a `test` script.
- Run `pnpm check` for full non-mutating verification: repository-wide linting,
  type checking, and formatting checks.
- Run `pnpm fix` to apply safe Oxlint fixes and repository-wide formatting, then
  run `check`; `fix` cannot repair type errors or non-fixable lint errors.
- Use `lint:check`, `lint:fix`, `typecheck`, `format:check`, and `format:fix` only
  when a focused quality step is useful; `check` and `fix` are the default
  repository-wide entrypoints.
- Run package-specific commands through their workspace scope, for example
  `pnpm --filter @forge/swatch schemes:check`; do not add a root forwarding
  alias for them.

## Convergence

- TypeScript scripts are run with `tsx`; do not add a build step just to
  execute them.
- Modules are enabled only through `forge.config.yaml#modules`; never scan
  directories for manifests or infer module identity and type from a path.
- Module names and normalized manifest paths must be globally unique. Modules
  use repository-relative manifest paths and load in declaration order, but
  conflicting outputs always fail rather than allowing later modules to override
  earlier ones.
- `sync` is always an array. Entry names must be unique within a domain and final
  targets globally unique. Forge merges every domain's entries into one plan
  before writing anything.
- The linker is intentionally conservative: already-correct symlinks are
  skipped, conflicting symlinks or real files/directories fail, and nothing is
  overwritten.
- Forge plans every configured link before writing. If any target conflicts,
  `pnpm start` must fail without creating any links from that plan.
- Build only generates artifacts inside the repository; domains without
  generated artifacts do not define a build step. Sync is the only lifecycle
  that exposes repository content in user directories.
- Packages that produce CLIs sync commands and integrations through their own
  lifecycle without root knowledge of package layouts. Root sync runs package
  sync scripts before applying links from registered config manifests.
- Zsh uses `~/.zshenv` to set `ZDOTDIR` to
  `${XDG_CONFIG_HOME:-$HOME/.config}/zsh`. History lives under XDG state and
  completion data under XDG cache. User commands and completions use standard
  XDG bin/data locations.
- Keep `pnpm sync:preview` in the verification path when changing link targets.

## Formatting And Hooks

- Prettier covers `**/*.{js,mjs,ts,json,jsonc,md,yaml,yml}`; `pnpm-lock.yaml` is
  intentionally ignored by Prettier.
- StyLua runs over the whole repo with Lua 5.2 syntax, 2-space indentation,
  Unix line endings, and sorted `require`s.
- `.editorconfig` says Lua and shell files use 2-space indentation, but
  `.stylua.toml` is the executable source for Lua formatting.

## Commits

- Husky `pre-commit` runs `pnpm exec lint-staged`; staged JS/TS/JSON/Markdown/
  YAML files are formatted with Prettier and staged Lua files with StyLua.
- Husky `commit-msg` runs `pnpm exec commitlint --edit "$1"`.
- Commit messages must use conventional types from `.commitlintrc.json` and a
  non-empty scope. Allowed scopes are `repo`, `nvim`, `wezterm`, `tmux`,
  `clrs`, `swatch`, `scripts`, `shared`, and `global`.
- Pull request titles follow the same rules and are the source of squash commit
  titles. Pull requests must come from the personal repository owner, and GitHub
  audits every commit added to `main` after merging.
