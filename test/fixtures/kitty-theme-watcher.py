from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace


class ReloadRequested(Exception):
    pass


with tempfile.TemporaryDirectory() as temporary_directory:
    root = Path(temporary_directory)
    state = root / "swatch" / "current.json"
    state.parent.mkdir(parents=True)
    state.write_text('{"id":"one"}\n')

    os.environ["XDG_STATE_HOME"] = str(root)
    config_directory = Path(__file__).resolve().parents[2] / "configs" / "kitty" / "files"
    sys.path.insert(0, str(config_directory))

    import state_watcher

    context = SimpleNamespace(current_theme_state_file=str(state))
    adapter = SimpleNamespace(runtime_context=lambda: context)
    state_watcher.integration = lambda: adapter

    process_arguments: list[str] | None = None

    def popen(arguments: list[str], **options: object) -> None:
        del options
        global process_arguments
        process_arguments = arguments

    state_watcher.subprocess.Popen = popen
    state_watcher.on_load(None, {})
    assert process_arguments == [
        "/usr/bin/python3",
        str(config_directory / "state_watcher.py"),
        str(os.getpid()),
        str(state),
        str(root / "kitty" / "font.json"),
    ]

    sleep_count = 0

    def sleep(seconds: float) -> None:
        del seconds
        global sleep_count
        sleep_count += 1
        if sleep_count == 1:
            replacement = state.with_suffix(".tmp")
            replacement.write_text('{"id":"two"}\n')
            os.replace(replacement, state)
        if sleep_count > 2:
            raise RuntimeError("Watcher did not detect the atomic state replacement")

    parent_pid = os.getppid()

    def kill(pid: int, signal: int) -> None:
        assert pid == parent_pid
        assert signal == state_watcher.signal.SIGUSR1
        raise ReloadRequested

    state_watcher.time.sleep = sleep
    state_watcher.os.kill = kill

    try:
        state_watcher._watch(parent_pid, state_watcher._watched_paths())
    except ReloadRequested:
        pass
