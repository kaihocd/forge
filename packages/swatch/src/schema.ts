// Defines the normalized runtime data contract for the Swatch catalog.

import { z } from 'zod';

const base24Keys = [
  'base00',
  'base01',
  'base02',
  'base03',
  'base04',
  'base05',
  'base06',
  'base07',
  'base08',
  'base09',
  'base0A',
  'base0B',
  'base0C',
  'base0D',
  'base0E',
  'base0F',
  'base10',
  'base11',
  'base12',
  'base13',
  'base14',
  'base15',
  'base16',
  'base17',
] as const;
const outputHexColorSchema = z.string().regex(/^#[0-9a-f]{6}$/);

export const themeIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const themeVariantSchema = z.enum(['dark', 'light']);
export const base24PaletteSchema = z
  .object(
    Object.fromEntries(base24Keys.map((key) => [key, outputHexColorSchema])) as {
      [Key in (typeof base24Keys)[number]]: z.ZodString;
    },
  )
  .strict();
export const themeSchema = z
  .object({
    id: themeIdSchema,
    name: z.string().min(1),
    author: z.string().optional(),
    variant: themeVariantSchema,
    palette: base24PaletteSchema,
  })
  .strict();
export const catalogManifestSchema = z
  .object({
    revision: z.string().regex(/^[0-9a-f]{40}$/),
    defaultTheme: themeIdSchema,
    themes: z.array(themeIdSchema),
  })
  .strict()
  .superRefine(({ defaultTheme, themes }, context) => {
    const seen = new Set<string>();

    for (const [index, themeId] of themes.entries()) {
      if (seen.has(themeId)) {
        context.addIssue({
          code: 'custom',
          message: `duplicate theme ID ${themeId}`,
          path: ['themes', index],
        });
      }
      if (index > 0 && themes[index - 1]! > themeId) {
        context.addIssue({
          code: 'custom',
          message: 'theme IDs must be sorted',
          path: ['themes', index],
        });
      }

      seen.add(themeId);
    }

    if (!seen.has(defaultTheme)) {
      context.addIssue({
        code: 'custom',
        message: `default theme ${defaultTheme} is not in the catalog`,
        path: ['defaultTheme'],
      });
    }
  });
export const currentStateSchema = z
  .object({
    id: themeIdSchema,
  })
  .strict();

export type Theme = z.infer<typeof themeSchema>;
export type CatalogManifest = z.infer<typeof catalogManifestSchema>;
export type CurrentState = z.infer<typeof currentStateSchema>;
