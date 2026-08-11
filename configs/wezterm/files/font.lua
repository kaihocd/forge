local wezterm = require('wezterm')

local M = {}
local act = wezterm.action
local xdg_state_home = os.getenv('XDG_STATE_HOME')
if not xdg_state_home or xdg_state_home == '' or xdg_state_home:sub(1, 1) ~= '/' then
  xdg_state_home = wezterm.home_dir .. '/.local/state'
end
local state_directory = xdg_state_home .. '/wezterm'
local state_path = state_directory .. '/font.json'
local default_state = {
  main = 'fira-code',
  comment = 'jetbrains-mono',
}
local fonts = {
  {
    id = 'fira-code',
    label = 'FiraCode Nerd Font',
    family = 'FiraCode Nerd Font',
  },
  {
    id = 'jetbrains-mono',
    label = 'JetBrainsMono Nerd Font',
    family = 'JetBrainsMono Nerd Font',
  },
}

local function font_by_id(id)
  for _, font in ipairs(fonts) do
    if font.id == id then
      return font
    end
  end
end

local function validate_state(state)
  if type(state) ~= 'table' then
    error('Font state must be a JSON object: ' .. state_path)
  end

  for key in pairs(state) do
    if key ~= 'main' and key ~= 'comment' then
      error('Unknown field in font state: ' .. tostring(key))
    end
  end

  for _, role in ipairs({ 'main', 'comment' }) do
    if type(state[role]) ~= 'string' or not font_by_id(state[role]) then
      error('Invalid ' .. role .. ' font ID in state: ' .. tostring(state[role]))
    end
  end

  return state
end

local function read_state()
  local file, open_error, error_code = io.open(state_path, 'r')
  if not file then
    if error_code == 2 then
      return {
        main = default_state.main,
        comment = default_state.comment,
      },
        false
    end
    error('Failed to read font state: ' .. state_path .. ': ' .. tostring(open_error))
  end

  local contents = file:read('*a')
  file:close()

  local ok, state = pcall(wezterm.json_parse, contents)
  if not ok then
    error('Invalid JSON in font state: ' .. state_path .. ': ' .. tostring(state))
  end

  return validate_state(state), true
end

local function create_state_directory()
  local args
  if wezterm.target_triple:find('windows') then
    args = {
      'powershell.exe',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'New-Item -ItemType Directory -Force -LiteralPath $args[0] | Out-Null',
      state_directory,
    }
  else
    args = { '/bin/mkdir', '-p', state_directory }
  end

  local success, _, stderr = wezterm.run_child_process(args)
  if not success then
    error('Failed to create font state directory: ' .. stderr)
  end
end

local function write_state(state, window)
  validate_state(state)
  create_state_directory()

  local temporary_path = state_path .. '.' .. tostring(window:window_id()) .. '.tmp'
  os.remove(temporary_path)

  local file, open_error = io.open(temporary_path, 'w')
  if not file then
    error('Failed to open temporary font state: ' .. tostring(open_error))
  end

  local ok, write_error = file:write(wezterm.json_encode(state), '\n')
  local close_ok, close_error = file:close()
  if not ok or not close_ok then
    os.remove(temporary_path)
    error('Failed to write font state: ' .. tostring(write_error or close_error))
  end

  local renamed, rename_error = os.rename(temporary_path, state_path)
  if not renamed and wezterm.target_triple:find('windows') then
    os.remove(state_path)
    renamed, rename_error = os.rename(temporary_path, state_path)
  end
  if not renamed then
    os.remove(temporary_path)
    error('Failed to replace font state: ' .. tostring(rename_error))
  end
end

local function platform_settings()
  if wezterm.target_triple:find('apple%-darwin$') then
    return 12, { 'PingFang SC', 'Apple Color Emoji', 'Symbols Nerd Font Mono' }
  end
  if wezterm.target_triple:find('windows') then
    return 10, { 'Microsoft YaHei', 'Segoe UI Emoji', 'Symbols Nerd Font Mono' }
  end
  return 12, { 'WenQuanYi Micro Hei', 'Symbols Nerd Font Mono' }
end

local function font_with_fallback(font, fallback, weight, italic)
  local candidates = {
    {
      family = font.family,
      weight = weight,
      italic = italic,
    },
  }
  for _, family in ipairs(fallback) do
    table.insert(candidates, family)
  end
  return wezterm.font_with_fallback(candidates)
end

local function apply_fonts(config, state)
  local font_size, fallback = platform_settings()
  local main = font_by_id(state.main)
  local comment = font_by_id(state.comment)

  config.font = font_with_fallback(main, fallback, 'Regular', false)
  config.font_size = font_size
  config.line_height = 1.35
  config.font_rules = {
    {
      intensity = 'Bold',
      italic = false,
      font = font_with_fallback(main, fallback, 'Bold', false),
    },
    {
      intensity = 'Normal',
      italic = true,
      font = font_with_fallback(comment, fallback, 'Regular', true),
    },
    {
      intensity = 'Bold',
      italic = true,
      font = font_with_fallback(comment, fallback, 'Bold', true),
    },
    {
      intensity = 'Half',
      italic = false,
      font = font_with_fallback(main, fallback, 'Regular', false),
    },
    {
      intensity = 'Half',
      italic = true,
      font = font_with_fallback(comment, fallback, 'Regular', true),
    },
  }
end

local function report_error(window, message)
  wezterm.log_error(message)
  window:toast_notification('WezTerm font configuration', message, nil, 5000)
end

local function select_font(role, current_state)
  local choices = {}
  for _, font in ipairs(fonts) do
    local marker = font.id == current_state[role] and '[current] ' or ''
    table.insert(choices, {
      id = font.id,
      label = marker .. font.label,
    })
  end

  return act.InputSelector({
    title = 'Select ' .. role .. ' font',
    description = 'Enter = select, Esc = cancel',
    choices = choices,
    action = wezterm.action_callback(function(window, _, id)
      if not id then
        return
      end

      local ok, changed_or_error = pcall(function()
        local state, exists = read_state()
        if exists and state[role] == id then
          return false
        end
        state[role] = id
        write_state(state, window)
        return true
      end)

      if not ok then
        report_error(window, tostring(changed_or_error))
      elseif changed_or_error then
        wezterm.reload_configuration()
      end
    end),
  })
end

local function configure_fonts(state)
  local main = font_by_id(state.main)
  local comment = font_by_id(state.comment)

  return act.InputSelector({
    title = 'Configure fonts',
    description = 'Choose a font role, Esc = cancel',
    choices = {
      { id = 'main', label = 'Main     ' .. main.label },
      { id = 'comment', label = 'Comment  ' .. comment.label },
    },
    action = wezterm.action_callback(function(window, pane, role)
      if role then
        window:perform_action(select_font(role, state), pane)
      end
    end),
  })
end

function M.setup(config)
  local state = read_state()
  apply_fonts(config, state)

  config.keys = config.keys or {}
  table.insert(config.keys, {
    key = 'F',
    mods = 'LEADER|SHIFT',
    action = configure_fonts(state),
  })
end

return M
