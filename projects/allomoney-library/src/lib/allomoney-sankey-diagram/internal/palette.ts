import type { SankeyTheme } from '../models/sankey-data';

/**
 * Generates a set of visually distinct, theme-aware node colors.
 *
 * Uses an OKLCH color with a fixed lightness/chroma per theme and a
 * golden-angle hue rotation so hues spread evenly without clustering. Each
 * index yields a unique color.
 *
 * @param count Number of colors to generate (one per node).
 * @param theme Active theme.
 * @returns An array of `count` CSS `oklch(...)` color strings.
 */
export function generatePalette(count: number, theme: SankeyTheme): string[] {
  const L = theme === 'dark' ? 0.84 : 0.82; // high lightness -> soft, luminous nodes
  const C = theme === 'dark' ? 0.105 : 0.075; // chroma: brighter on dark, more pastel on light
  const GOLDEN = 137.508; // even hue spread, no clustering
  const hue0 = 25;

  return Array.from(
    { length: Math.max(0, count) },
    (_, i) => `oklch(${L} ${C} ${(hue0 + i * GOLDEN) % 360})`
  );
}
