from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fonts import state_path as font_state_path
from swatch import integration


_started = False


def _signature(path: Path) -> tuple[int, int, int] | None:
    try:
        stat = path.stat()
        return stat.st_ino, stat.st_mtime_ns, stat.st_size
    except FileNotFoundError:
        return None


def _watched_paths() -> tuple[Path, Path]:
    context = integration().runtime_context()
    return Path(context.current_theme_state_file), font_state_path()


def _watch(parent_pid: int, paths: tuple[Path, Path]) -> None:
    previous = tuple(_signature(path) for path in paths)
    while os.getppid() == parent_pid:
        time.sleep(0.5)
        current = tuple(_signature(path) for path in paths)
        if current != previous:
            time.sleep(0.2)
            os.kill(parent_pid, signal.SIGUSR1)
            previous = current


def on_load(boss: Any, data: dict[str, Any]) -> None:
    del boss, data
    global _started
    if _started:
        return
    paths = _watched_paths()
    subprocess.Popen(
        ["/usr/bin/python3", __file__, str(os.getpid()), *(str(path) for path in paths)],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    _started = True


if __name__ == "__main__":
    _watch(int(sys.argv[1]), (Path(sys.argv[2]), Path(sys.argv[3])))
