local wezterm = require('wezterm')

---@class SwatchRuntimeContext
---@field command_search_path string 交互式 Shell 初始化后的 PATH。
---@field current_theme_state_file string Swatch 当前主题状态文件的绝对路径。

---@class Base24Palette
---@field base00 string
---@field base01 string
---@field base02 string
---@field base03 string
---@field base04 string
---@field base05 string
---@field base06 string
---@field base07 string
---@field base08 string
---@field base09 string
---@field base0A string
---@field base0B string
---@field base0C string
---@field base0D string
---@field base0E string
---@field base0F string
---@field base10 string
---@field base11 string
---@field base12 string
---@field base13 string
---@field base14 string
---@field base15 string
---@field base16 string
---@field base17 string

---@class SwatchTheme
---@field id string
---@field palette Base24Palette

---@class SwatchAdapter
---@field current_palette fun(): Base24Palette
local M = {}

---移除命令输出首尾的空白字符。
---@param value string
---@return string
local function trim(value)
  return value:match('^%s*(.-)%s*$') or ''
end

---同步执行子进程，并在命令失败时抛出包含 stderr 的配置错误。
---@param command string[] 可执行文件及其参数。
---@param operation string 用于错误信息的操作名称。
---@return string stdout 移除首尾空白后的内容。
local function execute_child_process(command, operation)
  local succeeded, stdout, stderr = wezterm.run_child_process(command)
  if not succeeded then
    error(operation .. ' failed: ' .. trim(stderr))
  end

  return trim(stdout)
end

---读取交互式 Shell 初始化后的 PATH，不复制其他 Shell 环境变量。
---@return string command_search_path
local function read_interactive_shell_path()
  local shell = os.getenv('SHELL')
  if not shell or shell == '' then
    error('Swatch initialization failed: SHELL is not set')
  end

  -- WezTerm GUI 的 PATH 不等于窗格内 Shell 的 PATH。NUL 分隔可以避免
  -- Shell 初始化输出或环境变量中的换行干扰 PATH 的边界。清除父进程中
  -- 可能陈旧的 Shell 派生变量，让当前 ~/.zshenv 重新建立运行环境。
  local environment = execute_child_process({
    '/usr/bin/env',
    '-u',
    'PATH',
    '-u',
    'ZDOTDIR',
    '-u',
    'NVM_BIN',
    '-u',
    'NVM_INC',
    shell,
    '-ic',
    'exec /usr/bin/env -0',
  }, 'Shell environment discovery')
  local command_search_path = ('\0' .. environment):match('%zPATH=([^%z]*)%z')
  if not command_search_path then
    error('Swatch initialization failed: could not read PATH from the interactive Shell')
  end

  return command_search_path
end

---使用指定 PATH 按命令名执行 Swatch，不依赖 Forge 或 Node 的绝对路径。
---@param command_search_path string
---@param ... string Swatch CLI 参数。
---@return string stdout
local function execute_swatch_with_path(command_search_path, ...)
  return execute_child_process(
    { '/usr/bin/env', 'PATH=' .. command_search_path, 'swatch', ... },
    'Swatch command'
  )
end

---发现 Swatch 所需的 Shell PATH 和当前主题状态文件。
---@return SwatchRuntimeContext
local function create_swatch_runtime_context()
  local command_search_path = read_interactive_shell_path()
  local current_theme_state_file =
    execute_swatch_with_path(command_search_path, 'current', '--path')

  return {
    command_search_path = command_search_path,
    current_theme_state_file = current_theme_state_file,
  }
end

---使用已发现的 Shell PATH 执行 Swatch。
---@param context SwatchRuntimeContext
---@param ... string Swatch CLI 参数。
---@return string stdout
local function execute_swatch(context, ...)
  return execute_swatch_with_path(context.command_search_path, ...)
end

---读取并校验当前 Theme，同时注册状态文件以触发 WezTerm 配置重载。
---@return SwatchTheme
local function load_current_theme()
  local context = create_swatch_runtime_context()

  -- 每次配置求值都重新注册 watcher；状态文件变化后，WezTerm 会重新执行配置。
  wezterm.add_to_config_reload_watch_list(context.current_theme_state_file)

  local theme = wezterm.json_parse(execute_swatch(context, 'current', '--json'))
  if type(theme) ~= 'table' or type(theme.palette) ~= 'table' then
    error('Swatch returned an invalid Theme')
  end

  ---@cast theme SwatchTheme
  return theme
end

---加载当前 Swatch Palette，并监听主题选择以触发 WezTerm 配置重载。
---@return Base24Palette
function M.current_palette()
  return load_current_theme().palette
end

return M
