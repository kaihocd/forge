# ZDOTDIR entry point: redirect zsh to the built config directory.
export ZDOTDIR="{{ zdotdir }}"

# Keep machine-local Zsh data outside disposable Forge build output.
export FORGE_ZSH_DATA_DIR="$HOME/.forge/zsh"
export SHELL_SESSIONS_DISABLE=1
mkdir -p "$FORGE_ZSH_DATA_DIR"

# Homebrew shellenv
eval "$(/opt/homebrew/bin/brew shellenv)"

# Machine-local environment
[[ -r {{ localenv }} ]] && source {{ localenv }}
