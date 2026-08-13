import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const harness = fileURLToPath(new URL('./fixtures/wezterm-adapter.lua', import.meta.url));
const adapter = fileURLToPath(new URL('../integrations/wezterm.lua', import.meta.url));

describe('WezTerm integration', () => {
  it('rediscovers Swatch through a clean shell environment on every evaluation', () => {
    const result = spawnSync('luajit', [harness, adapter], { encoding: 'utf8' });

    expect(result.error).toBeUndefined();
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });
});
