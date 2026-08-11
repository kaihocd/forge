import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const harness = fileURLToPath(new URL('./fixtures/kitty-adapter.py', import.meta.url));
const adapter = fileURLToPath(new URL('../integrations/kitty.py', import.meta.url));

describe('Kitty integration', () => {
  it('rediscovers Swatch through a clean shell environment on every evaluation', () => {
    const result = spawnSync('python3', [harness, adapter], { encoding: 'utf8' });

    expect(result.error).toBeUndefined();
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });
});
