local font = require('font')
local keymapping = require('keymaps')
local swatch = require('swatch')
local tab = require('tab')
local theme = require('theme')
local wezterm = require('wezterm')

local config = wezterm.config_builder()

font.setup(config)
keymapping.apply(config)
theme.apply(config, swatch.current_palette())
tab.setup(config)

config.automatically_reload_config = true
config.adjust_window_size_when_changing_font_size = false
config.integrated_title_button_alignment = 'Left'
config.integrated_title_button_style = 'MacOsNative'
config.show_close_tab_button_in_tabs = true
config.window_content_alignment = {
  horizontal = 'Center',
  vertical = 'Center',
}
config.window_decorations = 'INTEGRATED_BUTTONS|RESIZE'
config.window_padding = {
  left = '0.5cell',
  right = '0.5cell',
  top = 0,
  bottom = 0,
}

return config
