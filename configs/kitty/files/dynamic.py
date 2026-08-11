from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fonts import FONTS, read
from swatch import integration


def palette() -> dict[str, str]:
    adapter = integration()
    context = adapter.runtime_context()
    theme = adapter.current_theme(context)
    value = theme["palette"]
    required = {f"base{index:02X}" for index in range(24)}
    if set(value) != required or not all(
        isinstance(color, str) and len(color) == 7 and color.startswith("#") for color in value.values()
    ):
        raise RuntimeError("Swatch returned an invalid Base24 Palette")
    return value


def config_lines() -> list[str]:
    colors = palette()
    state = read()
    main = FONTS[state["main"]][1]
    comment = FONTS[state["comment"]][1]
    ansi = ["00", "08", "0B", "0A", "0D", "0E", "0C", "05"]
    brights = ["03", "12", "14", "13", "16", "17", "15", "07"]

    lines = [
        f'font_family family="{main}"',
        f'bold_font family="{main}" style=Bold',
        f'italic_font family="{comment}" style=Italic',
        f'bold_italic_font family="{comment}" style="Bold Italic"',
        f"foreground {colors['base05']}",
        f"background {colors['base00']}",
        f"cursor {colors['base05']}",
        f"cursor_text_color {colors['base00']}",
        f"selection_background {colors['base02']}",
        f"selection_foreground {colors['base05']}",
        f"active_border_color {colors['base0D']}",
        f"inactive_border_color {colors['base03']}",
        f"bell_border_color {colors['base09']}",
        f"tab_bar_background {colors['base01']}",
        f"active_tab_background {colors['base00']}",
        f"active_tab_foreground {colors['base05']}",
        f"inactive_tab_background {colors['base01']}",
        f"inactive_tab_foreground {colors['base04']}",
    ]
    lines.extend(f"color{index} {colors[f'base{base}']}" for index, base in enumerate(ansi))
    lines.extend(f"color{index + 8} {colors[f'base{base}']}" for index, base in enumerate(brights))
    return lines


print("\n".join(config_lines()))
