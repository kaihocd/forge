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
- Workspace packages expose the shared `ensure`, `build`, `lint:check`,
  `lint:fix`, `typecheck`, and `test` scripts when applicable so root aggregation
  discovers them automatically. `ensure` prepares missing external build inputs
  without refreshing valid existing input. Package-specific maintenance commands
  remain in that package and are invoked with
  `pnpm --filter <package> <command>`.
- Packages must not install configuration directly into user directories.
  Installation targets remain explicit in `forge.config.yaml`; do not auto-scan
  `packages/`. Package-owned persistent runtime state lives under `~/.forge/`.
- Swatch's built catalog is the sole Theme data source. Its persistent state
  `~/.forge/swatch/current.json` stores only the selected Theme ID. `current` and
  `current --json` initialize the catalog default only when that state is
  missing; `current --path` never creates it, and `use` writes only an explicitly
  validated selection. Invalid or dangling state must fail and can only be
  repaired by an explicit valid selection.
- Workspace packages that produce CLIs are build-first: runtime commands use
  their complete `dist/` output and must not execute TypeScript sources
  directly.
- There is no CI workflow yet. Add one only when a real need appears.
- `forge.config.yaml` is the single source of truth for `brew`, `links`, and
  `build` tasks. Do not hard-code new targets inside scripts. Config sources
  live under `configs/`.

## Scripts Layout

- `scripts/` root holds only CLI entrypoints. Entrypoints are thin: parse args,
  call into lib/ or a domain folder, handle exit code. No business logic.
- Commands map 1:1 to entrypoint files (`pnpm sync` -> `scripts/sync.ts`).
- Shared infrastructure goes in `scripts/lib/` (config loading, path helpers).
- Domain logic goes in a domain folder (`builders/`, future `doctor/`, etc.).

## Commands

- Use `pnpm install` if dependencies need refresh; the repo pins `pnpm@10.29.3`
  via `packageManager`.
- Use `pnpm start` for full local setup after dependencies are installed. It
  runs `brew`, `build`, then `sync` and stops at the first failed step.
- Use `pnpm brew` to install Homebrew taps, formulae, and casks declared under
  `brew:` in `forge.config.yaml`. The command is idempotent and skips already
  installed entries.
- Do not use `pnpm setup`; that is pnpm's built-in global setup command, not
  this repo's flow.
- Use `pnpm ensure` to prepare and validate workspace build prerequisites.
- Use `pnpm build` to ensure prerequisites, build workspace packages, and then
  run the builders declared under `build:` in `forge.config.yaml`.
- Use `pnpm sync:preview` to preview configured symlinks before applying them
  with `pnpm sync`; do not use `pnpm link`, which is pnpm's built-in package
  linking command.
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

## Build System

- `scripts/build.ts` is a dispatcher: it looks up builders by name in an
  explicit registry and calls them. Adding a builder means adding a file under
  `scripts/builders/` and registering it in the registry. Builders with options
  validate them with their own zod `optsSchema`.
- Config-level schema only validates base task shape (`builder`/`source`/
  `output`); each builder validates its own `opts`.
- Forge-generated regular files carry a `GENERATED_BY_FORGE` marker, and
  `writeGeneratedFile` in `scripts/builders/shared.ts` only replaces regular
  files that contain it. Never remove the marker or bypass this check.
- Unknown `{{ token }}` placeholders fail loudly; each templating builder
  defines its own token set.
- The `zshenv` builder may initialize the configured machine-local environment
  file when missing, but it must never overwrite or delete an existing one.
- The `zsh-runtime` builder explicitly links package-owned CLI and completion
  artifacts into root runtime outputs. It derives `PATH` and `fpath` directories
  from each declared output and writes the final `.zshrc` from explicitly
  ordered sources; it must not scan workspace packages or assume fixed runtime
  folders.
- Newly created runtime links use relative targets. An existing symlink is kept
  when it resolves to the declared source, even if its stored target is absolute.
  The generated runtime fragment contains build-time-resolved absolute discovery
  paths and must be rebuilt after moving the repository.
- Zsh sources are split into explicitly ordered files under `configs/zsh/`.
  The `zsh-runtime` builder assembles them into the Forge-owned
  `dist/zsh/.zshrc`; it must not auto-scan the source directory. Persistent Zsh
  data and completion dumps live together under `~/.forge/zsh`, leaving
  `dist/zsh` disposable.

## Sync Script

- TypeScript scripts are run with `tsx`; do not add a build step just to
  execute them.
- Do not auto-scan `configs/` unless the repo gains a concrete convention for
  targets.
- The linker is intentionally conservative: already-correct symlinks are
  skipped, conflicting symlinks or real files/directories fail, and nothing is
  overwritten.
- Sync plans every configured link before writing. If any target conflicts,
  `pnpm sync` must fail without creating any links from that plan.
- `pnpm sync:preview` reports conflicts without failing because local machines
  may already have unmanaged dotfiles; `pnpm sync` is the command that must
  fail on conflicts.
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
