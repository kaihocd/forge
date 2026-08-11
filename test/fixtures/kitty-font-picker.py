from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path


picker_path = Path(sys.argv[1]).resolve()

with tempfile.TemporaryDirectory() as state_home:
    os.environ["XDG_STATE_HOME"] = state_home
    original_sys_path = sys.path[:]
    try:
        sys.path.insert(0, str(picker_path.parent))
        source = picker_path.read_text()
        globals_: dict[str, object] = {"__name__": "kitten"}
        exec(compile(source, str(picker_path), "exec"), globals_)
    finally:
        sys.path[:] = original_sys_path

    handle_result = globals_["handle_result"]
    assert callable(handle_result)
    handle_result([], ("comment", "fira-code"), 0, None)

    state_path = Path(state_home) / "kitty" / "font.json"
    assert json.loads(state_path.read_text()) == {
        "main": "fira-code",
        "comment": "fira-code",
    }
