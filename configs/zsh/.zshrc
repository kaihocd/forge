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

for zsh_source in completion aliases keymaps extra fzf zinit; do
  source "$ZDOTDIR/$zsh_source.zsh"
done
unset zsh_source zsh_state_dir
