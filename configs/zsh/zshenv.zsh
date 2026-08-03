# ZDOTDIR entry point: redirect zsh to the built config directory.
export ZDOTDIR="{{ zdotdir }}"

# Homebrew shellenv
eval "$(/opt/homebrew/bin/brew shellenv)"

# Machine-local environment
[[ -r {{ localenv }} ]] && source {{ localenv }}
