from __future__ import annotations

from typing import Any

from fonts import FONTS, read, write


def _choose(prompt: str, options: list[tuple[str, str]]) -> str | None:
    print(prompt)
    for index, (_, label) in enumerate(options, start=1):
        print(f"  {index}. {label}")
    try:
        selected = input("> ").strip()
    except (EOFError, KeyboardInterrupt):
        return None
    if not selected:
        return None
    try:
        return options[int(selected) - 1][0]
    except (ValueError, IndexError):
        raise SystemExit("Invalid selection")


def main(args: list[str]) -> tuple[str, str] | None:
    del args
    state = read()
    role = _choose(
        "Choose a font role:",
        [("main", f"Main ({FONTS[state['main']][0]})"), ("comment", f"Comment ({FONTS[state['comment']][0]})")],
    )
    if not role:
        return None
    font = _choose(
        f"Choose the {role} font:",
        [(font_id, label) for font_id, (label, _) in FONTS.items()],
    )
    return (role, font) if font else None


def handle_result(args: list[str], result: tuple[str, str] | None, target_window_id: int, boss: Any) -> None:
    del args, target_window_id, boss
    if not result:
        return
    role, font = result
    state = read()
    if state[role] == font:
        return
    state[role] = font
    write(state)
