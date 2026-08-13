local keymap = require('tab.keymap')
local title = require('tab.title')

local M = {}

function M.setup(config)
  keymap.apply(config)
  title.register()
end

return M
