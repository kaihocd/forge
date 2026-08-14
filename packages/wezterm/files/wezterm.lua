local font = require('font')
local keymapping = require('keymaps')
local swatch = require('swatch')
local tab = require('tab')
local theme = require('theme')
local wezterm = require('wezterm')

local config = wezterm.config_builder()

font.setup(config)
keymapping.apply(config)
local palette = swatch.current_palette()
if palette then
  theme.apply(config, palette)
end
tab.setup(config)

config.front_end = 'WebGpu'
config.automatically_reload_config = true
config.status_update_interval = 1000
config.adjust_window_size_when_changing_font_size = false
config.show_close_tab_button_in_tabs = true
config.window_decorations = 'INTEGRATED_BUTTONS|RESIZE'
config.window_content_alignment = {
  horizontal = 'Center',
  vertical = 'Center',
}
config.window_padding = {
  left = '0.5cell',
  right = '0.5cell',
  top = 0,
  bottom = 0,
}

return config
