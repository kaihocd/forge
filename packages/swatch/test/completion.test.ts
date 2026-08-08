// Verifies deterministic Zsh completion generation from CLI and catalog metadata.

import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { generateZshCompletion } from '../scripts/lib/completion.js';
import type { CatalogManifest } from '../src/schema.js';

const manifest: CatalogManifest = {
  revision: 'a'.repeat(40),
  defaultTheme: 'catppuccin-mocha',
  themes: ['catppuccin-mocha', 'one-dark'],
};

describe('generateZshCompletion', () => {
  it('registers Swatch and includes every command and theme ID', () => {
    const completion = generateZshCompletion(manifest);

    expect(completion).toContain('#compdef swatch');
    expect(completion).toContain("'list:List available theme IDs.'");
    expect(completion).toContain("'get:Read one normalized Base24 theme.'");
    expect(completion).toContain(
      "'current:Read the current theme, initializing the catalog default when missing.'",
    );
    expect(completion).toContain("'use:Select a theme from the built catalog.'");
    expect(completion).toContain("'--json:Write the catalog manifest as JSON.'");
    expect(completion).toContain("'--path:Write the current state file path without creating it.'");
    expect(completion).toContain("'catppuccin-mocha'");
    expect(completion).toContain("'one-dark'");
  });

  it('is deterministic and contains each theme exactly once', () => {
    const first = generateZshCompletion(manifest);
    const second = generateZshCompletion(manifest);

    expect(first).toBe(second);
    expect(first.match(/'one-dark'/g)).toHaveLength(1);
  });

  it('passes Zsh syntax validation', () => {
    const result = spawnSync('zsh', ['-n'], {
      encoding: 'utf8',
      input: generateZshCompletion(manifest),
    });

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  it('offers help and theme IDs from the get argument state', () => {
    const result = spawnSync('zsh', ['-f'], {
      encoding: 'utf8',
      input: `
_arguments() {
  state=argument
  words=(get one-d)
}
_describe() {
  print -rl -- \${(P)2}
}
${generateZshCompletion(manifest)}
`,
    });

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('-h');
    expect(result.stdout).toContain('--help');
    expect(result.stdout).toContain('one-dark');
  });

  it('offers help and JSON output from the list argument state', () => {
    const result = spawnSync('zsh', ['-f'], {
      encoding: 'utf8',
      input: `
_arguments() {
  state=argument
  words=(list --j)
}
_describe() {
  print -rl -- \${(P)2}
}
${generateZshCompletion(manifest)}
`,
    });

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('-h');
    expect(result.stdout).toContain('--help');
    expect(result.stdout).toContain('--json');
  });

  it('offers current options and use theme IDs', () => {
    const completion = generateZshCompletion(manifest);
    const current = runCompletion(completion, 'current');
    const use = runCompletion(completion, 'use');

    expect(current).toContain('--json');
    expect(current).toContain('--path');
    expect(use).toContain('catppuccin-mocha');
    expect(use).toContain('one-dark');
  });
});

function runCompletion(completion: string, command: string): string {
  const result = spawnSync('zsh', ['-f'], {
    encoding: 'utf8',
    input: `
_arguments() {
  state=argument
  words=(${command})
}
_describe() {
  print -rl -- \${(P)2}
}
${completion}
`,
  });

  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  return result.stdout;
}
