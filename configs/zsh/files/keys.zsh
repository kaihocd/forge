# Editing mode
export KEYTIMEOUT=1
bindkey -v

# Insert mode
bindkey -M viins '^?' backward-delete-char
bindkey -M viins '^H' backward-delete-char
bindkey -M viins '^U' backward-kill-line
bindkey -M viins '^W' backward-kill-word

bindkey -M viins '^[[A' history-substring-search-up
bindkey -M viins '^[[B' history-substring-search-down

# Command mode
bindkey -M vicmd 'j' undefined-key
bindkey -M vicmd 'k' undefined-key
bindkey -M vicmd '^N' down-history
bindkey -M vicmd '^P' up-history

# Completion menu
# Keep Tab available to fzf while adding reverse and spatial menu navigation.
bindkey -M viins "$terminfo[kcbt]" reverse-menu-complete
bindkey -M menuselect '^I' menu-complete
bindkey -M menuselect "$terminfo[kcbt]" reverse-menu-complete
bindkey -M menuselect 'h' backward-char
bindkey -M menuselect 'j' down-line-or-history
bindkey -M menuselect 'k' up-line-or-history
bindkey -M menuselect 'l' forward-char
