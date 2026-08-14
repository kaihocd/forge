export SHELL_SESSIONS_DISABLE=1

export ZDOTDIR="${XDG_CONFIG_HOME:-$HOME/.config}/zsh"

# Homebrew shellenv
eval "$(/opt/homebrew/bin/brew shellenv)"

# Machine-local environment
typeset zsh_local_env="${XDG_CONFIG_HOME:-$HOME/.config}/zsh-local/env.zsh"
[[ -r "$zsh_local_env" ]] && source "$zsh_local_env"
unset zsh_local_env
