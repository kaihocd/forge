import { homedir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { expandHome } from '../src/paths.js';

describe('expandHome', () => {
  it('expands ~ to the user home directory', () => {
    expect(expandHome('~')).toBe(homedir());
  });

  it('expands ~/path to a path under the user home directory', () => {
    expect(expandHome('~/foo/bar')).toBe(`${homedir()}/foo/bar`);
  });

  it('returns absolute paths unchanged', () => {
    expect(expandHome('/usr/local/bin')).toBe('/usr/local/bin');
  });

  it('returns relative paths unchanged', () => {
    expect(expandHome('foo/bar')).toBe('foo/bar');
  });
});
