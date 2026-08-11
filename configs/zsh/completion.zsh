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

# Keep Tab available to fzf while adding reverse and spatial menu navigation.
bindkey -M viins "$terminfo[kcbt]" reverse-menu-complete
bindkey -M menuselect '^I' menu-complete
bindkey -M menuselect "$terminfo[kcbt]" reverse-menu-complete
bindkey -M menuselect 'h' backward-char
bindkey -M menuselect 'j' down-line-or-history
bindkey -M menuselect 'k' up-line-or-history
bindkey -M menuselect 'l' forward-char
