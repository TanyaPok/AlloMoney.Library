import type { SankeyTheme } from '../models/sankey-data';

/**
 * Generates a set of visually distinct, theme-aware node colors.
 *
 * Hue rotates by the golden angle so hues spread evenly without clustering.
 * Lightness and chroma are no longer fixed: each is nudged within a narrow
 * pastel band along its own low-discrepancy sequence (the plastic-number R2
 * constants). This matters once the node count wraps the 360° hue circle —
 * golden-angle hues then start landing arbitrarily close together (e.g.
 * 320.016 vs 320.08), and with L/C fixed those nodes were indistinguishable.
 * Perturbing L and C along uncorrelated sequences keeps such hue-neighbours
 * telling apart while staying soft and pastel.
 *
 * @param count Number of colors to generate (one per node).
 * @param theme Active theme.
 * @returns An array of `count` CSS `oklch(...)` color strings.
 */
export function generatePalette(count: number, theme: SankeyTheme): string[] {
  const baseL = theme === 'dark' ? 0.84 : 0.82; // high lightness -> soft, luminous nodes
  const baseC = theme === 'dark' ? 0.105 : 0.075; // chroma: brighter on dark, more pastel on light
  const GOLDEN = 137.508; // even hue spread, no clustering
  const hue0 = 25;

  // Amplitudes kept modest so colors stay in the pastel band in both themes:
  // L within ±0.07, C within ±0.04.
  const L_SPREAD = 0.07;
  const C_SPREAD = 0.04;

  // Plastic-number R2 low-discrepancy constants: two uncorrelated sequences so
  // a hue collision (driven by GOLDEN) does not coincide with an L or C match.
  const L_INC = 0.7548776662466927; // 1 / plastic number
  const C_INC = 0.5698402909980532; // 1 / plastic number^2
  const fract = (x: number): number => x - Math.floor(x);

  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    const L = baseL + (fract(i * L_INC) - 0.5) * 2 * L_SPREAD;
    const C = baseC + (fract(i * C_INC) - 0.5) * 2 * C_SPREAD;
    const h = (hue0 + i * GOLDEN) % 360;
    return `oklch(${L} ${C} ${h})`;
  });
}
