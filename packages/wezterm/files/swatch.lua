local theme = require('theme')
local wezterm = require('wezterm')

local M = {}

local unpack = table.unpack or unpack

local function xdg_or_home(env_name, relative)
  local xdg = os.getenv(env_name)
  if xdg and xdg ~= '' and xdg:sub(1, 1) == '/' then
    return xdg
  end
  return wezterm.home_dir .. relative
end

local sentinel_path = xdg_or_home('XDG_STATE_HOME', '/.local/state') .. '/forge/.changed'
local forge_state_path = xdg_or_home('XDG_BIN_HOME', '/.local/bin') .. '/forge-state'

local last_revision = ''
local last_palette = nil

-- Runs forge-state directly. If that fails (typically because WezTerm was
-- launched from the GUI and has no PATH to node), fall back to a login shell
-- which loads .zshenv/.zshrc and restores nvm / ~/.local/bin.
local function run_forge_state(...)
  local args = { ... }

  local direct = { forge_state_path, unpack(args) }
  local success, output, error_output = wezterm.run_child_process(direct)
  if success then
    if not output or output == '' then
      return nil
    end
    return output
  end

  -- Use zsh's "$@" to forward arguments without shell quoting gymnastics.
  local shell = {
    '/bin/zsh',
    '-ilc',
    'exec "$@"',
    'forge-state-runner',
    forge_state_path,
    unpack(args),
  }
  success, output, error_output = wezterm.run_child_process(shell)
  if not success then
    wezterm.log_error('forge-state failed: ' .. (error_output or 'unknown error'))
    return nil
  end
  if not output or output == '' then
    return nil
  end
  return output
end

local function read_current_palette()
  local output = run_forge_state('get', 'swatch.theme')
  if not output then
    return nil
  end
  local ok, parsed = pcall(wezterm.json_parse, output)
  if not ok or type(parsed) ~= 'table' then
    return nil
  end
  local current_theme = parsed['swatch.theme']
  if type(current_theme) ~= 'table' or type(current_theme.palette) ~= 'table' then
    return nil
  end
  return current_theme.palette
end

function M.current_palette()
  if last_palette then
    return last_palette
  end
  last_palette = read_current_palette()
  return last_palette
end

local function apply_palette_to_window(window, palette)
  local overrides = {}
  theme.apply(overrides, palette)
  window:set_config_overrides(overrides)
end

local function read_sentinel_revision()
  local ok, contents = pcall(wezterm.read_file, sentinel_path)
  if ok and contents then
    return contents:gsub('%s+$', '')
  end
  return ''
end

wezterm.on('update-status', function(window, _pane)
  local revision = read_sentinel_revision()
  if revision == '' or revision == last_revision then
    return
  end
  last_revision = revision

  local palette = read_current_palette()
  if not palette then
    return
  end
  last_palette = palette
  apply_palette_to_window(window, palette)
end)

return M
