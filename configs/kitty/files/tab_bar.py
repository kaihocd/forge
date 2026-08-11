from __future__ import annotations

import os
from pathlib import Path
from typing import Any


LABELS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "!", "@", "#", "$", "%", "^", "&", "*", "(", ")"]


def draw_title(data: dict[str, Any]) -> str:
    index = data["index"]
    working_directory = data["tab"].active_wd
    if working_directory:
        path = Path(working_directory)
        title = "~" if path == Path.home() else path.name or os.sep
    else:
        title = data["title"]
    label = LABELS[index - 1] if index <= len(LABELS) else str(index)
    return f"{label}. {title}".ljust(12)
