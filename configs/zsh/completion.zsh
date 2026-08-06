# Completion
autoload -Uz compinit
compinit -d "$FORGE_ZSH_DATA_DIR/zcompdump"

zstyle ':completion:*' menu select
zstyle ':completion:*' matcher-list 'm:{a-zA-Z}={A-Za-z}'
