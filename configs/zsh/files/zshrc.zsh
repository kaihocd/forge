# History
typeset zsh_state_dir="${XDG_STATE_HOME:-$HOME/.local/state}/zsh"
mkdir -p "$zsh_state_dir"

HISTFILE="$zsh_state_dir/history"
HISTSIZE=100000
SAVEHIST=100000

setopt APPEND_HISTORY
setopt SHARE_HISTORY
setopt HIST_FCNTL_LOCK
setopt HIST_IGNORE_ALL_DUPS
setopt HIST_IGNORE_SPACE
setopt HIST_EXPIRE_DUPS_FIRST
setopt HIST_FIND_NO_DUPS
setopt HIST_SAVE_NO_DUPS

# Options
setopt AUTOCD
setopt NOBEEP
setopt NUMERIC_GLOB_SORT

# Standard user command and completion paths.
typeset -U path fpath
path=(
  "${XDG_BIN_HOME:-$HOME/.local/bin}"
  $path
)
fpath=(
  "${XDG_DATA_HOME:-$HOME/.local/share}/zsh/site-functions"
  $fpath
)

# Completion
autoload -Uz compinit
zmodload zsh/complist
zmodload zsh/terminfo
typeset zsh_cache_dir="${XDG_CACHE_HOME:-$HOME/.cache}/zsh"
mkdir -p "$zsh_cache_dir"
compinit -d "$zsh_cache_dir/zcompdump-$ZSH_VERSION"
unset zsh_cache_dir

zstyle ':completion:*' menu select
zstyle ':completion:*' matcher-list 'm:{a-zA-Z}={A-Za-z}'

# Aliases
alias ls='ls -G'
alias ll='ls -lG'

source "$ZDOTDIR/keys.zsh"
source "$ZDOTDIR/tools.zsh"

unset zsh_state_dir
