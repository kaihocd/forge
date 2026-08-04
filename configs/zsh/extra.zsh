# NVM
export NVM_DIR="$HOME/.nvm"
[[ -s "$HOMEBREW_PREFIX/opt/nvm/nvm.sh" ]] && source "$HOMEBREW_PREFIX/opt/nvm/nvm.sh"

# Smart directory navigation
eval "$(zoxide init zsh --cmd cd)"

# Prompt
eval "$(starship init zsh)"
