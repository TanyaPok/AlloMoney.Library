import { describe, expect, it } from 'vitest';
import { validateSankeyData } from './validate-sankey-data';
import type { SankeyData } from '../models/sankey-data';

describe('validateSankeyData (business rules 3 & 5)', () => {
  describe('Empty States (rule 5)', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['{}', {} as unknown as SankeyData],
      ['{ nodes: [] }', { nodes: [], links: [] } as SankeyData],
      ['{ nodes: null }', { nodes: null } as unknown as SankeyData],
      ['{ nodes: undefined }', { nodes: undefined } as unknown as SankeyData],
    ])('treats %s as an empty state', (_label, input) => {
      const result = validateSankeyData(input);
      expect(result.isEmptyState).toBe(true);
      expect(result.nodes).toHaveLength(0);
      expect(result.links).toHaveLength(0);
    });

    it('ignores links when nodes is empty', () => {
      const result = validateSankeyData({
        nodes: [],
        links: [{ source: 0, target: 1, value: 5 }],
      });
      expect(result.isEmptyState).toBe(true);
    });
  });

  describe('node validation (rule 3)', () => {
    it('drops a node whose id is not a finite number', () => {
      const result = validateSankeyData({
        nodes: [
          { id: 0, name: 'ok' },
          { id: Number.NaN as number, name: 'nan' },
          { id: 'x' as unknown as number, name: 'string id' },
        ],
        links: [],
      });
      expect(result.nodes.map((n) => n.id)).toEqual([0]);
      expect(result.errors.length).toBe(2);
    });

    it('drops a node whose value is present but not positive', () => {
      const result = validateSankeyData({
        nodes: [
          { id: 0, value: 0 },
          { id: 1, value: -5 },
          { id: 2, value: 10 },
        ],
        links: [],
      });
      expect(result.nodes.map((n) => n.id)).toEqual([2]);
    });

    it('keeps a node whose value is null/undefined (derived later)', () => {
      const result = validateSankeyData({
        nodes: [
          { id: 0, value: null },
          { id: 1 },
        ],
        links: [],
      });
      expect(result.nodes.map((n) => n.id)).toEqual([0, 1]);
      expect(result.nodes.every((n) => n.value === null)).toBe(true);
    });

    it('rejects a node whose name looks malicious', () => {
      const result = validateSankeyData({
        nodes: [
          { id: 0, name: '<script>alert(1)</script>' },
          { id: 1, name: '<img src=x onerror=alert(1)>' },
          { id: 2, name: 'safe name' },
        ],
        links: [],
      });
      expect(result.nodes.map((n) => n.id)).toEqual([2]);
      expect(result.errors.length).toBe(2);
    });

    it('drops duplicate ids, keeping the first', () => {
      const result = validateSankeyData({
        nodes: [
          { id: 0, name: 'first' },
          { id: 0, name: 'second' },
        ],
        links: [],
      });
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].label).toBe('first');
    });

    it('falls back to the id string when name is missing or blank', () => {
      const result = validateSankeyData({
        nodes: [{ id: 2 }, { id: 3, name: '   ' }],
        links: [],
      });
      expect(result.nodes.map((n) => n.label)).toEqual(['2', '3']);
    });

    it('reports an empty state when every node is invalid (rule 3)', () => {
      const result = validateSankeyData({
        nodes: [
          { id: 'a' as unknown as number },
          { id: null as unknown as number },
        ],
        links: [{ source: 0, target: 1, value: 5 }],
      });
      expect(result.isEmptyState).toBe(true);
    });
  });

  describe('link validation (rule 3)', () => {
    const nodes = [{ id: 0 }, { id: 1 }, { id: 2 }];

    it('drops links that reference missing nodes, self-loop, or bad values', () => {
      const result = validateSankeyData({
        nodes,
        links: [
          { source: 0, target: 1, value: 5 }, // ok
          { source: 0, target: 0, value: 5 }, // self loop
          { source: 0, target: 9, value: 5 }, // missing target
          { source: 9, target: 1, value: 5 }, // missing source
          { source: 0, target: 1, value: 0 }, // non-positive value
          { source: 0, target: 1, value: null as unknown as number }, // missing value
          { source: 'x' as unknown as number, target: 1, value: 5 }, // non-number source
        ],
      });
      expect(result.links).toEqual([{ source: 0, target: 1, value: 5 }]);
      expect(result.errors.length).toBe(6);
    });
  });

  it('does not mutate the input data', () => {
    const input: SankeyData = {
      nodes: [{ id: 0, name: 'a' }],
      links: [{ source: 0, target: 0, value: 1 }],
    };
    const snapshot = JSON.stringify(input);
    validateSankeyData(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
