/**
 * The "chain" of a hovered element is the directed flow thread it belongs to:
 * everything upstream that feeds into it (its ancestors) plus everything
 * downstream it feeds (its descendants), following link direction. Sibling
 * flows that merely share a node — but are not on a path through the hovered
 * element — are NOT part of the chain and get dimmed by the component.
 *
 * Pure and framework-agnostic so it can be unit-tested directly.
 */

/** Minimal link shape needed to trace a chain; {@link LayoutLink} satisfies it. */
export interface ChainLink {
  readonly id: string;
  readonly source: number;
  readonly target: number;
}

/** The element the user is hovering — the seed for {@link collectChain}. */
export type ChainSeed =
  | { readonly kind: 'node'; readonly id: number }
  | { readonly kind: 'link'; readonly id: string; readonly source: number; readonly target: number };

/** The nodes and links that make up a hovered element's chain. */
export interface Chain {
  readonly nodeIds: ReadonlySet<number>;
  readonly linkIds: ReadonlySet<string>;
}

/** Groups links by a node id using the given accessor (`source` or `target`). */
function index(
  links: readonly ChainLink[],
  key: (link: ChainLink) => number,
): ReadonlyMap<number, readonly ChainLink[]> {
  const map = new Map<number, ChainLink[]>();
  for (const link of links) {
    const id = key(link);
    let list = map.get(id);
    if (!list) map.set(id, (list = []));
    list.push(link);
  }
  return map;
}

/**
 * Collects the chain (directed flow thread) that a hovered element belongs to.
 *
 * For a hovered node, walks both upstream (incoming links → their sources) and
 * downstream (outgoing links → their targets). For a hovered link, walks
 * upstream from its source and downstream from its target, and includes the
 * link itself. Cycle-safe via visited sets (money-flow graphs are expected to
 * be acyclic, but a cycle cannot loop forever).
 *
 * @param seed  The hovered node or link.
 * @param links All drawable links of the diagram.
 * @returns The node ids and link ids that form the chain.
 */
export function collectChain(seed: ChainSeed, links: readonly ChainLink[]): Chain {
  const incoming = index(links, (l) => l.target);
  const outgoing = index(links, (l) => l.source);
  const nodeIds = new Set<number>();
  const linkIds = new Set<string>();

  // Walk upstream: follow links that flow INTO each visited node.
  const walkUpstream = (start: number): void => {
    const stack = [start];
    nodeIds.add(start);
    while (stack.length > 0) {
      const node = stack.pop()!;
      for (const link of incoming.get(node) ?? []) {
        linkIds.add(link.id);
        if (!nodeIds.has(link.source)) {
          nodeIds.add(link.source);
          stack.push(link.source);
        }
      }
    }
  };

  // Walk downstream: follow links that flow OUT OF each visited node.
  const walkDownstream = (start: number): void => {
    const stack = [start];
    nodeIds.add(start);
    while (stack.length > 0) {
      const node = stack.pop()!;
      for (const link of outgoing.get(node) ?? []) {
        linkIds.add(link.id);
        if (!nodeIds.has(link.target)) {
          nodeIds.add(link.target);
          stack.push(link.target);
        }
      }
    }
  };

  if (seed.kind === 'node') {
    walkUpstream(seed.id);
    walkDownstream(seed.id);
  } else {
    linkIds.add(seed.id);
    walkUpstream(seed.source);
    walkDownstream(seed.target);
  }

  return { nodeIds, linkIds };
}
