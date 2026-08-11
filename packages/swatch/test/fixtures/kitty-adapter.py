from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys


adapter_path = sys.argv[1]
spec = importlib.util.spec_from_file_location("swatch_kitty", adapter_path)
assert spec and spec.loader
adapter = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = adapter
spec.loader.exec_module(adapter)

commands: list[list[str]] = []


def run(command: list[str], **_: object) -> subprocess.CompletedProcess[bytes]:
    commands.append(command)
    if command[-1] == "exec /usr/bin/env -0":
        return subprocess.CompletedProcess(command, 0, b"UNRELATED=\xe2\0PATH=/fresh/bin\0", b"")
    if command[-2:] == ["current", "--path"]:
        return subprocess.CompletedProcess(command, 0, b"/home/test/.local/state/swatch/current.json\n", b"")
    if command[-2:] == ["current", "--json"]:
        theme = {"id": "theme", "palette": {"base00": "#000000"}}
        return subprocess.CompletedProcess(command, 0, json.dumps(theme).encode(), b"")
    raise AssertionError(f"unexpected command: {command}")


adapter.subprocess.run = run
os.environ["SHELL"] = "/bin/zsh"

assert adapter.current_theme()["palette"]["base00"] == "#000000"
assert adapter.current_theme()["palette"]["base00"] == "#000000"

discoveries = [command for command in commands if command[-1] == "exec /usr/bin/env -0"]
assert len(discoveries) == 2
assert discoveries[0] == [
    "/usr/bin/env",
    "-u",
    "PATH",
    "-u",
    "ZDOTDIR",
    "-u",
    "NVM_BIN",
    "-u",
    "NVM_INC",
    "/bin/zsh",
    "-ic",
    "exec /usr/bin/env -0",
]
for command in commands:
    if "swatch" in command:
        assert command[:3] == ["/usr/bin/env", "PATH=/fresh/bin", "swatch"]
