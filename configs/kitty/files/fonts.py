from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import TypedDict


class FontState(TypedDict):
    main: str
    comment: str


FONTS = {
    "fira-code": ("FiraCode Nerd Font", "FiraCode Nerd Font Mono"),
    "jetbrains-mono": ("JetBrainsMono Nerd Font", "JetBrainsMono Nerd Font Mono"),
}
DEFAULT_STATE: FontState = {"main": "fira-code", "comment": "jetbrains-mono"}


def state_path() -> Path:
    state_home = os.environ.get("XDG_STATE_HOME")
    if not state_home or not os.path.isabs(state_home):
        state_home = str(Path.home() / ".local" / "state")
    return Path(state_home) / "kitty" / "font.json"


def validate(state: object) -> FontState:
    if not isinstance(state, dict) or set(state) != {"main", "comment"}:
        raise RuntimeError(f"Invalid Kitty font state: {state_path()}")
    if not all(isinstance(state[role], str) and state[role] in FONTS for role in DEFAULT_STATE):
        raise RuntimeError(f"Invalid Kitty font ID in state: {state_path()}")
    return {"main": state["main"], "comment": state["comment"]}


def read() -> FontState:
    path = state_path()
    try:
        return validate(json.loads(path.read_text()))
    except FileNotFoundError:
        return DEFAULT_STATE.copy()
    except json.JSONDecodeError as error:
        raise RuntimeError(f"Invalid JSON in Kitty font state: {path}") from error


def write(state: FontState) -> None:
    validated = validate(state)
    path = state_path()
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w") as file:
            json.dump(validated, file, indent=2)
            file.write("\n")
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    except BaseException:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise
