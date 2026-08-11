# NVM
export NVM_DIR="$HOME/.nvm"
export NVM_SYMLINK_CURRENT=true
path=(
  "$NVM_DIR/current/bin"
  $path
)
[[ -s "$HOMEBREW_PREFIX/opt/nvm/nvm.sh" ]] && source "$HOMEBREW_PREFIX/opt/nvm/nvm.sh" --no-use

# Smart directory navigation
eval "$(zoxide init zsh --cmd cd)"

# Prompt
eval "$(starship init zsh)"
