local data_home = os.getenv('XDG_DATA_HOME')
if not data_home or data_home == '' or data_home:sub(1, 1) ~= '/' then
  data_home = require('wezterm').home_dir .. '/.local/share'
end
package.path = data_home .. '/?.lua;' .. package.path

-- Load the WezTerm adapter owned by Swatch.
return require('swatch.integrations.wezterm')
