local wezterm = require('wezterm')

local M = {}
local act = wezterm.action
local direction_keys = {
  { key = 'h', direction = 'Left' },
  { key = 'j', direction = 'Down' },
  { key = 'k', direction = 'Up' },
  { key = 'l', direction = 'Right' },
}

local function map(keys, key, mods, action)
  table.insert(keys, {
    key = key,
    mods = mods,
    action = action,
  })
end

-- Let macOS Command+direction trigger Neovim's portable Alt+direction mappings.
local function apply_macos_key_adapters(keys)
  if wezterm.target_triple:find('apple%-darwin$') then
    for _, binding in ipairs(direction_keys) do
      map(keys, binding.key, 'SUPER', act.SendKey({ key = binding.key, mods = 'ALT' }))
    end
  end
end

-- Bind the shared direction keys to pane focus and continuous pane resizing.
local function apply_pane_keys(keys)
  for _, binding in ipairs(direction_keys) do
    map(keys, binding.key, 'LEADER', act.ActivatePaneDirection(binding.direction))
    map(
      keys,
      binding.key:upper(),
      'LEADER|SHIFT',
      act.Multiple({
        act.AdjustPaneSize({ binding.direction, 3 }),
        act.ActivateKeyTable({
          name = 'resize_pane',
          one_shot = false,
          timeout_milliseconds = 1000,
          until_unknown = true,
        }),
      })
    )
  end
end

-- Build the temporary key table used for repeated pane resizing.
local function resize_pane_key_table()
  local keys = {}

  for _, binding in ipairs(direction_keys) do
    map(keys, binding.key:upper(), 'SHIFT', act.AdjustPaneSize({ binding.direction, 3 }))
  end

  map(keys, 'Escape', nil, act.PopKeyTable)
  return keys
end

function M.apply(config)
  config.leader = {
    key = ' ',
    mods = 'SHIFT',
    timeout_milliseconds = 1500,
  }

  config.keys = config.keys or {}
  config.key_tables = config.key_tables or {}
  config.key_tables.resize_pane = resize_pane_key_table()

  -- stylua: ignore start
  map(config.keys, 'y', 'LEADER', act.ActivateCopyMode)
  map(config.keys, 'f', 'LEADER', act.Search({ CaseSensitiveString = '' }))
  map(config.keys, 'c', 'LEADER', act.CloseCurrentPane({ confirm = true }))
  map(config.keys, 'v', 'LEADER', act.SplitPane({ direction = 'Right', size = { Percent = 50 } }))
  map(config.keys, 's', 'LEADER', act.SplitPane({ direction = 'Down', size = { Percent = 50 } }))
  map(config.keys, 'z', 'LEADER', act.TogglePaneZoomState)
  -- stylua: ignore end

  apply_macos_key_adapters(config.keys)
  apply_pane_keys(config.keys)
end

return M
