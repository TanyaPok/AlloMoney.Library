import { describe, expect, it } from 'vitest';
import { collectChain, type ChainLink } from './sankey-chain';

/** The UC-1 reference graph: 0→2, 0→3, 1→2, 2→4, 3→4. */
const LINKS: ChainLink[] = [
  { id: '0-2', source: 0, target: 2 },
  { id: '0-3', source: 0, target: 3 },
  { id: '1-2', source: 1, target: 2 },
  { id: '2-4', source: 2, target: 4 },
  { id: '3-4', source: 3, target: 4 },
];

const sorted = (set: ReadonlySet<number> | ReadonlySet<string>): unknown[] =>
  [...set].sort();

describe('collectChain (UC-2)', () => {
  it('traces a hovered link upstream from its source and downstream from its target', () => {
    // 1→2: nothing feeds node 1; node 2 flows on to 4. Sibling 0→2 is excluded.
    const chain = collectChain({ kind: 'link', id: '1-2', source: 1, target: 2 }, LINKS);
    expect(sorted(chain.nodeIds)).toEqual([1, 2, 4]);
    expect(sorted(chain.linkIds)).toEqual(['1-2', '2-4']);
  });

  it('excludes sibling flows that only share a downstream node', () => {
    // 0→3: node 3 flows to 4, but 4 also receives 2→4 — that sibling is excluded.
    const chain = collectChain({ kind: 'link', id: '0-3', source: 0, target: 3 }, LINKS);
    expect(sorted(chain.nodeIds)).toEqual([0, 3, 4]);
    expect(sorted(chain.linkIds)).toEqual(['0-3', '3-4']);
  });

  it('traces a hovered node both upstream and downstream', () => {
    // Node 0 is a source: its whole descendant cone lights up, node 1 does not.
    const chain = collectChain({ kind: 'node', id: 0 }, LINKS);
    expect(sorted(chain.nodeIds)).toEqual([0, 2, 3, 4]);
    expect(sorted(chain.linkIds)).toEqual(['0-2', '0-3', '2-4', '3-4']);
  });

  it('spans the whole diagram when hovering a shared sink (extension 1.a)', () => {
    // Every flow ends at node 4, so hovering it reaches everything → nothing dims.
    const chain = collectChain({ kind: 'node', id: 4 }, LINKS);
    expect(sorted(chain.nodeIds)).toEqual([0, 1, 2, 3, 4]);
    expect(chain.linkIds.size).toBe(LINKS.length);
  });

  it('includes only the node itself when it has no links', () => {
    const chain = collectChain({ kind: 'node', id: 9 }, LINKS);
    expect(sorted(chain.nodeIds)).toEqual([9]);
    expect(chain.linkIds.size).toBe(0);
  });

  it('does not loop forever on a cycle', () => {
    const cyclic: ChainLink[] = [
      { id: 'a', source: 0, target: 1 },
      { id: 'b', source: 1, target: 0 },
    ];
    const chain = collectChain({ kind: 'node', id: 0 }, cyclic);
    expect(sorted(chain.nodeIds)).toEqual([0, 1]);
    expect(sorted(chain.linkIds)).toEqual(['a', 'b']);
  });
});