// Defines and generates normalized Base24 Swatch themes.

import Color from 'colorjs.io';

import { themeSchema, type Theme } from '../../src/schema.js';
import type { FetchedScheme } from './schemes.js';

const backgroundStep = 0.04;
const edgeLightness = 0.02;
const minimumContrast = 6.5;
const neutralRatios = {
  base01: 0.14,
  base02: 0.26,
  base03: 0.42,
  base04: 0.62,
} as const;
const neutralMinimumDifferences = {
  base01: 0.015,
  base02: 0.03,
  base03: 0.05,
  base04: 0.07,
} as const;

export function processTheme(input: FetchedScheme): Theme {
  try {
    return normalizeTheme(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to process ${input.source}: ${message}`, { cause: error });
  }
}

function normalizeTheme({ id, scheme }: FetchedScheme): Theme {
  const variant = scheme.variant;
  const palette = scheme.palette;
  const originalBase00 = normalizeHex(palette.base00);
  // Extreme backgrounds leave no room for Base24's two extended background levels.
  const base00Lightness = clampBase00Lightness(lightness(originalBase00), variant);
  const base00 = setLightness(originalBase00, base00Lightness);
  const base05 = normalizeForeground(normalizeHex(palette.base05), base00, variant);
  // OKLab mixing gives perceptually even neutrals; the minimum OKLCH lightness
  // gaps keep adjacent slots distinguishable after conversion back to sRGB.
  const neutrals = Object.fromEntries(
    Object.entries(neutralRatios).map(([key, ratio]) => {
      const candidate = toHex(new Color(base00).mix(base05, ratio, { space: 'oklab' }));
      return [
        key,
        ensureLightnessDifference(
          candidate,
          base00,
          variant,
          neutralMinimumDifferences[key as keyof typeof neutralMinimumDifferences],
        ),
      ];
    }),
  ) as Record<keyof typeof neutralRatios, string>;
  const accents = {
    base08: normalizeHex(palette.base08),
    base09: normalizeHex(palette.base09),
    base0A: normalizeHex(palette.base0A),
    base0B: normalizeHex(palette.base0B),
    base0C: normalizeHex(palette.base0C),
    base0D: normalizeHex(palette.base0D),
    base0E: normalizeHex(palette.base0E),
    base0F: normalizeHex(palette.base0F),
  };

  return themeSchema.parse({
    id,
    name: scheme.name,
    ...(scheme.author ? { author: scheme.author } : {}),
    variant,
    palette: {
      base00,
      ...neutrals,
      base05,
      base06: extendForeground(base05, variant, 0.08),
      base07: extendForeground(base05, variant, 0.16),
      ...accents,
      // Base24 assigns 10/11 to extended backgrounds and 12-17 to bright
      // variants of the six ANSI hues represented by Base16's 08 and 0A-0E.
      base10: setLightness(
        base00,
        base00Lightness + (variant === 'dark' ? -backgroundStep : backgroundStep),
      ),
      base11: setLightness(
        base00,
        base00Lightness + (variant === 'dark' ? -backgroundStep * 2 : backgroundStep * 2),
      ),
      base12: deriveBrightAccent(accents.base08, variant),
      base13: deriveBrightAccent(accents.base0A, variant),
      base14: deriveBrightAccent(accents.base0B, variant),
      base15: deriveBrightAccent(accents.base0C, variant),
      base16: deriveBrightAccent(accents.base0D, variant),
      base17: deriveBrightAccent(accents.base0E, variant),
    },
  });
}

export function contrastRatio(background: string, foreground: string): number {
  return Color.contrastWCAG21(background, foreground);
}

export function lightness(hex: string): number {
  return coordinate(new Color(hex).to('oklch').coords[0], 'lightness');
}

function clampBase00Lightness(value: number, variant: 'dark' | 'light'): number {
  const requiredSpace = edgeLightness + backgroundStep * 2;
  return variant === 'dark' ? Math.max(value, requiredSpace) : Math.min(value, 1 - requiredSpace);
}

function normalizeForeground(
  foreground: string,
  background: string,
  variant: 'dark' | 'light',
): string {
  let current = foreground;

  // The stricter-than-AA target leaves headroom for consumers that modify or
  // composite colors. Bounded iteration prevents malformed inputs hanging a build.
  for (
    let attempts = 0;
    attempts < 16 && contrastRatio(background, current) < minimumContrast;
    attempts += 1
  ) {
    const currentLightness = lightness(current);
    const target =
      variant === 'dark'
        ? Math.min(0.98, currentLightness + 0.04)
        : Math.max(0.02, currentLightness - 0.06);
    if (target === currentLightness) {
      break;
    }
    current = setLightness(current, target);
  }

  const ratio = contrastRatio(background, current);
  if (ratio < minimumContrast) {
    throw new Error(
      `Unable to reach ${minimumContrast}:1 foreground contrast; reached ${ratio.toFixed(2)}:1`,
    );
  }
  return current;
}

function ensureLightnessDifference(
  candidate: string,
  base: string,
  variant: 'dark' | 'light',
  minimumDifference: number,
): string {
  if (Math.abs(lightness(candidate) - lightness(base)) >= minimumDifference) {
    return candidate;
  }
  const target =
    variant === 'dark'
      ? Math.min(0.98, lightness(base) + minimumDifference)
      : Math.max(0.02, lightness(base) - minimumDifference);
  return setLightness(candidate, target);
}

function extendForeground(color: string, variant: 'dark' | 'light', amount: number): string {
  const current = lightness(color);
  const target =
    variant === 'dark' ? Math.min(0.99, current + amount) : Math.max(0.01, current - amount);
  return setLightness(color, target);
}

function deriveBrightAccent(color: string, variant: 'dark' | 'light'): string {
  const adjusted = new Color(color).to('oklch');
  const currentLightness = coordinate(adjusted.coords[0], 'lightness');
  const currentChroma = adjusted.coords[1] ?? 0;
  const targetLightness =
    variant === 'dark'
      ? Math.min(0.95, currentLightness + 0.1)
      : Math.max(0.08, currentLightness - 0.1);
  const targetChroma = Math.max(0, currentChroma + (variant === 'dark' ? 0.015 : -0.01));
  return toHex(adjusted.set('l', targetLightness).set('c', targetChroma));
}

function setLightness(color: string, target: number): string {
  const adjusted = new Color(color).to('oklch');
  if (adjusted.coords[1] === null) {
    adjusted.set('c', 0);
  }
  return toHex(adjusted.set('l', Math.max(0, Math.min(1, target))));
}

function normalizeHex(hex: string): string {
  return toHex(new Color(hex));
}

function toHex(color: Color): string {
  // Gamut mapping can shift the requested OKLCH coordinates, so callers test
  // observable sRGB contrast and spacing rather than trusting target values.
  const [red, green, blue] = color
    .to('srgb')
    .toGamut({ method: 'css' })
    .coords.map((value) => Math.round(coordinate(value, 'sRGB channel') * 255));
  return `#${hexChannel(red)}${hexChannel(green)}${hexChannel(blue)}`;
}

function coordinate(value: number | null, name: string): number {
  if (value === null || !Number.isFinite(value)) {
    throw new Error(`Color has no finite ${name}`);
  }
  return value;
}

function hexChannel(value: number): string {
  return Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0');
}
