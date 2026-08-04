# Zinit plugins
source "$HOMEBREW_PREFIX/opt/zinit/zinit.zsh"

HISTORY_SUBSTRING_SEARCH_PREFIXED=1
HISTORY_SUBSTRING_SEARCH_GLOBBING_FLAGS=''
HISTORY_SUBSTRING_SEARCH_ENSURE_UNIQUE=1
HISTORY_SUBSTRING_SEARCH_HIGHLIGHT_FOUND='fg=magenta,bold'
HISTORY_SUBSTRING_SEARCH_HIGHLIGHT_NOT_FOUND='fg=red,bold'
zinit light zsh-users/zsh-history-substring-search

zinit light zsh-users/zsh-autosuggestions

zinit light zsh-users/zsh-syntax-highlighting
