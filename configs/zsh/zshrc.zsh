# History
HISTFILE="$FORGE_ZSH_DATA_DIR/history"
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

# Forge-built command and completion discovery paths.
typeset -U path fpath

path=(
{{ executable_dirs }}
  $path
)

fpath=(
{{ completion_dirs }}
  $fpath
)
