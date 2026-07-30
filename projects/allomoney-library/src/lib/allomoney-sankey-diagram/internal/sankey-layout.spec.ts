import { describe, expect, it } from 'vitest';
import { computeSankeyLayout } from './sankey-layout';
import type { ValidLink, ValidNode } from './validate-sankey-data';

/** The UC-1 reference payload, already validated. */
const REF_NODES: ValidNode[] = [
  { id: 0, label: 'account 0', value: 10 },
  { id: 1, label: 'node 1', value: null },
  { id: 2, label: '2', value: null },
  { id: 3, label: 'Invest node 3', value: 10 },
  { id: 4, label: 'Questrade ARTG', value: null },
];
const REF_LINKS: ValidLink[] = [
  { source: 0, target: 2, value: 5.5 },
  { source: 0, target: 3, value: 4.5 },
  { source: 1, target: 2, value: 0.5 },
  { source: 2, target: 4, value: 6.0 },
  { source: 3, target: 4, value: 5.0 },
];

const nodeById = (layout: ReturnType<typeof computeSankeyLayout>, id: number) =>
  layout.nodes.find((n) => n.id === id)!;

describe('computeSankeyLayout (business rule 2)', () => {
  it('assigns nodes to columns by longest path (rank)', () => {
    const layout = computeSankeyLayout(REF_NODES, REF_LINKS, 'light');
    expect(nodeById(layout, 0).rank).toBe(0);
    expect(nodeById(layout, 1).rank).toBe(0);
    expect(nodeById(layout, 2).rank).toBe(1);
    expect(nodeById(layout, 3).rank).toBe(1);
    expect(nodeById(layout, 4).rank).toBe(2);
  });

  it('places later ranks further right', () => {
    const layout = computeSankeyLayout(REF_NODES, REF_LINKS, 'light');
    expect(nodeById(layout, 0).x).toBeLessThan(nodeById(layout, 2).x);
    expect(nodeById(layout, 2).x).toBeLessThan(nodeById(layout, 4).x);
  });

  it('sizes node height proportional to magnitude', () => {
    const layout = computeSankeyLayout(REF_NODES, REF_LINKS, 'light');
    // Magnitudes: node0=10, node4=11 -> ~1.1x taller.
    const ratio = nodeById(layout, 4).height / nodeById(layout, 0).height;
    expect(ratio).toBeCloseTo(1.1, 1);
  });

  it('derives magnitude for a node without an explicit value from its outflow', () => {
    const layout = computeSankeyLayout(REF_NODES, REF_LINKS, 'light');
    // node1 has no value and no inflow, only an outflow of 0.5 -> visible height.
    expect(nodeById(layout, 1).height).toBeGreaterThan(0);
    // node0 magnitude 10 is far taller than node1 magnitude 0.5.
    expect(nodeById(layout, 0).height).toBeGreaterThan(nodeById(layout, 1).height * 5);
  });

  it('labels the in-node value only when explicitly supplied', () => {
    const layout = computeSankeyLayout(REF_NODES, REF_LINKS, 'light');
    expect(nodeById(layout, 0).valueLabel).toBe('10.00');
    expect(nodeById(layout, 3).valueLabel).toBe('10.00');
    expect(nodeById(layout, 2).valueLabel).toBeNull();
    expect(nodeById(layout, 4).valueLabel).toBeNull();
  });

  it('emits one closed ribbon path per link with a formatted value label', () => {
    const layout = computeSankeyLayout(REF_NODES, REF_LINKS, 'light');
    expect(layout.links).toHaveLength(5);
    for (const link of layout.links) {
      expect(link.path.startsWith('M')).toBe(true);
      expect(link.path.endsWith('Z')).toBe(true);
      expect(link.valueLabel).toMatch(/^\d+\.\d{2}$/);
    }
    expect(layout.links.find((l) => l.id === '0-2')!.valueLabel).toBe('5.50');
  });

  it('gives every node a unique color', () => {
    const layout = computeSankeyLayout(REF_NODES, REF_LINKS, 'light');
    const colors = layout.nodes.map((n) => n.color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it('honors an explicit node color and derives link color from its source', () => {
    const nodes: ValidNode[] = [
      { id: 0, label: 'a', value: null, color: '#ff0000' },
      { id: 1, label: 'b', value: null },
    ];
    const links: ValidLink[] = [{ source: 0, target: 1, value: 3 }];
    const layout = computeSankeyLayout(nodes, links, 'light');
    expect(nodeById(layout, 0).color).toBe('#ff0000');
    expect(layout.links[0].color).toBe('#ff0000');
  });

  it('stacks a node\'s outgoing links by their target position (crossing reduction)', () => {
    // Source 0 fans out to targets 1 and 2; whichever target ends up higher
    // (smaller y) must own the higher slice of the source edge.
    const nodes: ValidNode[] = [
      { id: 0, label: 's', value: null },
      { id: 1, label: 't1', value: null },
      { id: 2, label: 't2', value: null },
    ];
    const links: ValidLink[] = [
      { source: 0, target: 2, value: 4 },
      { source: 0, target: 1, value: 4 },
    ];
    const layout = computeSankeyLayout(nodes, links, 'light');
    const t1 = nodeById(layout, 1);
    const t2 = nodeById(layout, 2);
    const higher = t1.y < t2.y ? 1 : 2;
    // The ribbon to the higher target should have the smaller labelY at source.
    const toT1 = layout.links.find((l) => l.target === 1)!;
    const toT2 = layout.links.find((l) => l.target === 2)!;
    if (higher === 1) {
      expect(toT1.labelY).toBeLessThan(toT2.labelY);
    } else {
      expect(toT2.labelY).toBeLessThan(toT1.labelY);
    }
  });

  it('is deterministic', () => {
    const a = computeSankeyLayout(REF_NODES, REF_LINKS, 'light');
    const b = computeSankeyLayout(REF_NODES, REF_LINKS, 'light');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('centers a single node when there is only one rank', () => {
    const nodes: ValidNode[] = [{ id: 0, label: 'solo', value: 5 }];
    const layout = computeSankeyLayout(nodes, [], 'light');
    expect(layout.nodes).toHaveLength(1);
    expect(nodeById(layout, 0).rank).toBe(0);
  });
});
