import { describe, expect, it } from 'vitest';
import { generatePalette } from './palette';

describe('generatePalette (business rule 2)', () => {
  it('returns one color per requested node', () => {
    expect(generatePalette(5, 'light')).toHaveLength(5);
    expect(generatePalette(0, 'light')).toHaveLength(0);
  });

  it('produces a unique color for each node', () => {
    const colors = generatePalette(24, 'light');
    expect(new Set(colors).size).toBe(colors.length);
  });

  it('emits oklch() colors', () => {
    for (const color of generatePalette(3, 'dark')) {
      expect(color).toMatch(/^oklch\(/);
    }
  });

  it('tunes lightness/chroma per theme', () => {
    expect(generatePalette(1, 'light')[0]).toContain('0.82 0.075');
    expect(generatePalette(1, 'dark')[0]).toContain('0.84 0.105');
  });

  it('is deterministic', () => {
    expect(generatePalette(6, 'light')).toEqual(generatePalette(6, 'light'));
  });
});
