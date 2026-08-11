local adapter_path = assert(arg[1], 'adapter path is required')
local discovery_count = 0
local watched_paths = {}

local function assert_command(actual, expected)
  assert(#actual == #expected, 'command argument count differs')
  for index, value in ipairs(expected) do
    assert(
      actual[index] == value,
      'unexpected command argument ' .. index .. ': ' .. tostring(actual[index])
    )
  end
end

package.preload.wezterm = function()
  return {
    add_to_config_reload_watch_list = function(path)
      table.insert(watched_paths, path)
    end,
    json_parse = function(value)
      assert(value == '{"id":"theme","palette":{"base00":"#000000"}}')
      return { id = 'theme', palette = { base00 = '#000000' } }
    end,
    run_child_process = function(command)
      if command[#command] == 'exec /usr/bin/env -0' then
        discovery_count = discovery_count + 1
        assert_command(command, {
          '/usr/bin/env',
          '-u',
          'PATH',
          '-u',
          'ZDOTDIR',
          '-u',
          'NVM_BIN',
          '-u',
          'NVM_INC',
          '/bin/zsh',
          '-ic',
          'exec /usr/bin/env -0',
        })
        return true, 'PATH=/fresh/bin\0', ''
      end

      assert(command[1] == '/usr/bin/env')
      assert(command[2] == 'PATH=/fresh/bin')
      assert(command[3] == 'swatch')
      if command[4] == 'current' and command[5] == '--path' then
        return true, '/home/test/.local/state/swatch/current.json\n', ''
      end
      if command[4] == 'current' and command[5] == '--json' then
        return true, '{"id":"theme","palette":{"base00":"#000000"}}\n', ''
      end
      error('unexpected Swatch command')
    end,
  }
end

local adapter = assert(loadfile(adapter_path))()
assert(adapter.current_palette().base00 == '#000000')
assert(adapter.current_palette().base00 == '#000000')
assert(discovery_count == 2, 'runtime context must be rediscovered for every config evaluation')
assert(#watched_paths == 2)
assert(watched_paths[1] == '/home/test/.local/state/swatch/current.json')
assert(watched_paths[2] == '/home/test/.local/state/swatch/current.json')
