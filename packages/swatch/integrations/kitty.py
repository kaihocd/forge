from __future__ import annotations

import json
import os
import subprocess
from typing import Any, NamedTuple


class RuntimeContext(NamedTuple):
    command_search_path: str
    current_theme_state_file: str


def _run_bytes(command: list[str], operation: str) -> bytes:
    result = subprocess.run(command, check=False, capture_output=True)
    if result.returncode != 0:
        message = result.stderr.decode(errors="replace").strip()
        raise RuntimeError(f"{operation} failed: {message}")
    return result.stdout


def _run(command: list[str], operation: str) -> str:
    return _run_bytes(command, operation).decode().strip()


def _interactive_shell_path() -> str:
    shell = os.environ.get("SHELL")
    if not shell:
        raise RuntimeError("Swatch initialization failed: SHELL is not set")

    environment = _run_bytes(
        [
            "/usr/bin/env",
            "-u",
            "PATH",
            "-u",
            "ZDOTDIR",
            "-u",
            "NVM_BIN",
            "-u",
            "NVM_INC",
            shell,
            "-ic",
            "exec /usr/bin/env -0",
        ],
        "Shell environment discovery",
    )
    for entry in environment.split(b"\0"):
        if entry.startswith(b"PATH="):
            return os.fsdecode(entry.removeprefix(b"PATH="))
    raise RuntimeError("Swatch initialization failed: could not read PATH from the interactive Shell")


def _run_swatch(command_search_path: str, *arguments: str) -> str:
    return _run(
        ["/usr/bin/env", f"PATH={command_search_path}", "swatch", *arguments],
        "Swatch command",
    )


def runtime_context() -> RuntimeContext:
    command_search_path = _interactive_shell_path()
    return RuntimeContext(
        command_search_path=command_search_path,
        current_theme_state_file=_run_swatch(command_search_path, "current", "--path"),
    )


def current_theme(context: RuntimeContext | None = None) -> dict[str, Any]:
    context = context or runtime_context()
    try:
        theme = json.loads(_run_swatch(context.command_search_path, "current", "--json"))
    except json.JSONDecodeError as error:
        raise RuntimeError("Swatch returned invalid Theme JSON") from error
    if not isinstance(theme, dict) or not isinstance(theme.get("palette"), dict):
        raise RuntimeError("Swatch returned an invalid Theme")
    return theme
