---@class WezTermColors
---@field foreground string
---@field background string
---@field cursor_bg string
---@field cursor_fg string
---@field cursor_border string
---@field selection_bg string
---@field selection_fg string
---@field ansi string[]
---@field brights string[]
---@field tab_bar WezTermTabBarColors

---@class WezTermTabStyle
---@field bg_color string
---@field fg_color string

---@class WezTermTabBarColors
---@field background string
---@field active_tab WezTermTabStyle
---@field inactive_tab WezTermTabStyle
---@field inactive_tab_hover WezTermTabStyle
---@field new_tab WezTermTabStyle
---@field new_tab_hover WezTermTabStyle
---@field inactive_tab_edge string

---@class WezTermWindowFrame
---@field active_titlebar_bg string
---@field inactive_titlebar_bg string
---@field active_titlebar_fg string
---@field inactive_titlebar_fg string
---@field active_titlebar_border_bottom string
---@field inactive_titlebar_border_bottom string
---@field button_bg string
---@field button_fg string
---@field button_hover_bg string
---@field button_hover_fg string

---@class WezTermTheme
---@field apply fun(config: table, palette: Base24Palette)
local M = {}

---创建标签栏各个交互状态的颜色。
---@param palette Base24Palette
---@return WezTermTabBarColors
local function create_tab_bar_colors(palette)
  return {
    background = palette.base01,
    active_tab = {
      bg_color = palette.base00,
      fg_color = palette.base05,
    },
    inactive_tab = {
      bg_color = palette.base01,
      fg_color = palette.base04,
    },
    inactive_tab_hover = {
      bg_color = palette.base00,
      fg_color = palette.base05,
    },
    new_tab = {
      bg_color = palette.base01,
      fg_color = palette.base04,
    },
    new_tab_hover = {
      bg_color = palette.base01,
      fg_color = palette.base05,
    },
    inactive_tab_edge = palette.base03,
  }
end

---创建 WezTerm 的终端和标签栏颜色。
---@param palette Base24Palette
---@return WezTermColors
local function create_colors(palette)
  return {
    foreground = palette.base05,
    background = palette.base00,
    cursor_bg = palette.base05,
    cursor_fg = palette.base00,
    cursor_border = palette.base05,
    selection_bg = palette.base02,
    selection_fg = palette.base05,
    ansi = {
      palette.base00,
      palette.base08,
      palette.base0B,
      palette.base0A,
      palette.base0D,
      palette.base0E,
      palette.base0C,
      palette.base05,
    },
    brights = {
      palette.base03,
      palette.base12,
      palette.base14,
      palette.base13,
      palette.base16,
      palette.base17,
      palette.base15,
      palette.base07,
    },
    tab_bar = create_tab_bar_colors(palette),
  }
end

---创建 Fancy 标签栏使用的窗口框架颜色。
---@param palette Base24Palette
---@return WezTermWindowFrame
local function create_window_frame(palette)
  return {
    active_titlebar_bg = palette.base01,
    inactive_titlebar_bg = palette.base01,
    active_titlebar_fg = palette.base05,
    inactive_titlebar_fg = palette.base04,
    active_titlebar_border_bottom = palette.base02,
    inactive_titlebar_border_bottom = palette.base02,
    button_bg = palette.base01,
    button_fg = palette.base04,
    button_hover_bg = palette.base01,
    button_hover_fg = palette.base05,
  }
end

---将 Base24 Palette 应用到 WezTerm 的全部颜色配置。
---@param config table
---@param palette Base24Palette
function M.apply(config, palette)
  config.colors = create_colors(palette)
  config.window_frame = create_window_frame(palette)
end

return M
