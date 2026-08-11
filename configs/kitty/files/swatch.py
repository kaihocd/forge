from __future__ import annotations

import importlib.util
import os
from pathlib import Path
from types import ModuleType


def integration() -> ModuleType:
    data_home = os.environ.get("XDG_DATA_HOME")
    if not data_home or not os.path.isabs(data_home):
        data_home = str(Path.home() / ".local" / "share")
    path = Path(data_home) / "swatch" / "integrations" / "kitty.py"
    spec = importlib.util.spec_from_file_location("swatch_kitty_integration", path)
    if not spec or not spec.loader:
        raise RuntimeError(f"Failed to load Swatch Kitty integration: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
