# Keybindings
export KEYTIMEOUT=1
bindkey -v

bindkey -M viins '^?' backward-delete-char
bindkey -M viins '^H' backward-delete-char
bindkey -M viins '^U' backward-kill-line
bindkey -M viins '^W' backward-kill-word

bindkey -M viins '^[[A' history-substring-search-up
bindkey -M viins '^[[B' history-substring-search-down

bindkey -M vicmd 'j' undefined-key
bindkey -M vicmd 'k' undefined-key
bindkey -M vicmd '^N' down-history
bindkey -M vicmd '^P' up-history
