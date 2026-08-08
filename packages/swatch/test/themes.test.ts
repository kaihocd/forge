// Verifies generated Base24 theme contracts and color derivation.

import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { rawSchemeSchema, type FetchedScheme, type RawScheme } from '../scripts/lib/schemes.js';
import { contrastRatio, lightness, processTheme } from '../scripts/lib/themes.js';
import { themeSchema, type Theme } from '../src/schema.js';

describe('processTheme', () => {
  it('normalizes OneDark into a valid Base24 theme', async () => {
    const theme = processTheme(await fixture('onedark.yaml'));

    expect(themeSchema.safeParse(theme).success).toBe(true);
    expect(theme).toMatchObject({
      id: 'onedark',
      name: 'OneDark',
      author: 'Lalit Magant (http://github.com/tilal6991)',
      variant: 'dark',
      palette: {
        base08: '#e06c75',
        base09: '#d19a66',
        base0F: '#be5046',
      },
    });
    expect(Object.values(theme.palette).every((color) => /^#[0-9a-f]{6}$/.test(color))).toBe(true);
    expect(contrastRatio(theme.palette.base00, theme.palette.base05)).toBeGreaterThanOrEqual(6.5);
  });

  it('preserves ordered, distinguishable neutral levels', async () => {
    const darkPalette = processTheme(await fixture('onedark.yaml')).palette;
    const lightInput = await fixture('onedark.yaml');
    lightInput.scheme.variant = 'light';
    lightInput.scheme.palette.base00 = '#ffffff';
    lightInput.scheme.palette.base05 = '#111111';
    const lightPalette = processTheme(lightInput).palette;

    expectNeutralOrder(darkPalette, 'dark');
    expectNeutralOrder(lightPalette, 'light');
    expect(contrastRatio(lightPalette.base00, lightPalette.base05)).toBeGreaterThanOrEqual(6.5);
  });

  it('reserves two darker background levels for dark themes', async () => {
    const input = await fixture('onedark.yaml');
    input.scheme.palette.base00 = '#000000';

    const { palette } = processTheme(input);

    expect(lightness(palette.base11)).toBeLessThan(lightness(palette.base10));
    expect(lightness(palette.base10)).toBeLessThan(lightness(palette.base00));
    expect(new Set([palette.base00, palette.base10, palette.base11])).toHaveLength(3);
  });

  it('reserves two lighter background levels for light themes', async () => {
    const input = await fixture('onedark.yaml');
    input.scheme.variant = 'light';
    input.scheme.palette.base00 = '#ffffff';
    input.scheme.palette.base05 = '#111111';

    const { palette, variant } = processTheme(input);

    expect(variant).toBe('light');
    expect(lightness(palette.base00)).toBeLessThan(lightness(palette.base10));
    expect(lightness(palette.base10)).toBeLessThan(lightness(palette.base11));
    expect(new Set([palette.base00, palette.base10, palette.base11])).toHaveLength(3);
  });

  it('derives bright red from base08 rather than base09', async () => {
    const original = await fixture('onedark.yaml');
    const changedRed = structuredClone(original);
    const changedOrange = structuredClone(original);
    changedRed.scheme.palette.base08 = '#00ff00';
    changedOrange.scheme.palette.base09 = '#00ff00';

    const baseline = processTheme(original).palette;
    const redResult = processTheme(changedRed).palette;
    const orangeResult = processTheme(changedOrange).palette;

    expect(redResult.base12).not.toBe(baseline.base12);
    expect(orangeResult.base12).toBe(baseline.base12);
    expect(orangeResult.base09).not.toBe(baseline.base09);
  });

  it('omits an empty upstream author', async () => {
    const theme = processTheme(await fixture('seti.yaml'));

    expect(theme).not.toHaveProperty('author');
  });

  it('reports the source when theme processing fails', async () => {
    const input = await fixture('onedark.yaml');
    input.scheme.palette.base00 = '#ffffff';
    input.scheme.palette.base05 = '#ffffff';

    expect(() => processTheme(input)).toThrow(
      'Failed to process base16/onedark.yaml: Unable to reach 6.5:1 foreground contrast',
    );
  });
});

describe('themeSchema', () => {
  const palette = Object.fromEntries(
    [
      '00',
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
      '07',
      '08',
      '09',
      '0A',
      '0B',
      '0C',
      '0D',
      '0E',
      '0F',
      '10',
      '11',
      '12',
      '13',
      '14',
      '15',
      '16',
      '17',
    ].map((suffix) => [`base${suffix}`, '#abcdef']),
  );

  it('accepts normalized themes', () => {
    expect(
      themeSchema.safeParse({ id: 'one-dark', name: 'One Dark', variant: 'dark', palette }).success,
    ).toBe(true);
  });

  it('requires a valid theme variant', () => {
    expect(themeSchema.safeParse({ id: 'one-dark', name: 'One Dark', palette }).success).toBe(
      false,
    );
    expect(
      themeSchema.safeParse({ id: 'one-dark', name: 'One Dark', variant: 'dim', palette }).success,
    ).toBe(false);
  });

  it('rejects non-normalized hex colors', () => {
    expect(
      themeSchema.safeParse({
        id: 'one-dark',
        name: 'One Dark',
        variant: 'dark',
        palette: { ...palette, base08: '#ABCDEF' },
      }).success,
    ).toBe(false);
  });

  it('rejects extra palette fields', () => {
    expect(
      themeSchema.safeParse({
        id: 'one-dark',
        name: 'One Dark',
        variant: 'dark',
        palette: { ...palette, accent: '#abcdef' },
      }).success,
    ).toBe(false);
  });
});

async function fixture(name: string): Promise<FetchedScheme> {
  const contents = await readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
  const scheme: RawScheme = rawSchemeSchema.parse(parse(contents));
  return {
    id: name.replace(/\.ya?ml$/, ''),
    source: `base16/${name}`,
    scheme,
  };
}

function expectNeutralOrder(palette: Theme['palette'], variant: RawScheme['variant']): void {
  const values = ['base00', 'base01', 'base02', 'base03', 'base04', 'base05'].map((key) =>
    lightness(palette[key as keyof Theme['palette']]),
  );

  for (let index = 1; index < values.length; index += 1) {
    if (variant === 'dark') {
      expect(values[index]).toBeGreaterThan(values[index - 1]!);
    } else {
      expect(values[index]).toBeLessThan(values[index - 1]!);
    }
  }
}
