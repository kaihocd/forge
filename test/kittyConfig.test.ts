import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const watcherHarness = fileURLToPath(new URL('./fixtures/kitty-theme-watcher.py', import.meta.url));
const fontPickerHarness = fileURLToPath(
  new URL('./fixtures/kitty-font-picker.py', import.meta.url),
);
const fontPicker = fileURLToPath(new URL('../configs/kitty/files/font_picker.py', import.meta.url));

describe('Kitty configuration', () => {
  it('loads the font picker without __file__ in Kitty result handlers', () => {
    const result = spawnSync('python3', [fontPickerHarness, fontPicker], { encoding: 'utf8' });

    expect(result.error).toBeUndefined();
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  it('reloads when Swatch atomically replaces its state file', () => {
    const result = spawnSync('python3', [watcherHarness], { encoding: 'utf8' });

    expect(result.error).toBeUndefined();
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });
});
