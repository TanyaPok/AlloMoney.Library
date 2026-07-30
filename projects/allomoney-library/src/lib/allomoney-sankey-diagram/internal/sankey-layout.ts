import type { SankeyOrientation, SankeyTheme } from '../models/sankey-data';
import { generatePalette } from './palette';
import type { ValidLink, ValidNode } from './validate-sankey-data';

/** A node positioned by the layout engine, ready to bind to SVG. */
export interface LayoutNode {
  readonly id: number;
  readonly label: string;
  /** Formatted "total deposit" shown inside the node, or `null` when derived. */
  readonly valueLabel: string | null;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color: string;
  readonly rank: number;
  /** Text anchor and position for the node's name label. */
  readonly labelX: number;
  readonly labelY: number;
  readonly labelAnchor: 'start' | 'middle' | 'end';
  /** Centered position for the in-node value label (when present). */
  readonly valueX: number;
  readonly valueY: number;
}

/** A link ribbon positioned by the layout engine. */
export interface LayoutLink {
  /** Stable id for `@for` tracking: `"<source>-><target>"`. */
  readonly id: string;
  readonly source: number;
  readonly target: number;
  /** SVG `path` `d` for the closed ribbon. */
  readonly path: string;
  readonly color: string;
  /** Ribbon thickness in user units (proportional to value). */
  readonly thickness: number;
  readonly valueLabel: string;
  readonly labelX: number;
  readonly labelY: number;
  /** Accessible description, e.g. `"account 0 → node 2: 5.50"`. */
  readonly a11yLabel: string;
}

/** Complete, render-ready layout in a fixed user-space viewBox. */
export interface SankeyLayout {
  readonly width: number;
  readonly height: number;
  readonly nodes: readonly LayoutNode[];
  readonly links: readonly LayoutLink[];
}

/** Tunable layout geometry. All values are in viewBox user units. */
export interface LayoutOptions {
  readonly width: number;
  readonly height: number;
  readonly nodeWidth: number;
  readonly nodePadding: number;
  readonly marginTop: number;
  readonly marginRight: number;
  readonly marginBottom: number;
  readonly marginLeft: number;
  readonly labelGap: number;
  /** Minimum drawn thickness so tiny flows/nodes stay visible. */
  readonly minThickness: number;
}

export const DEFAULT_LAYOUT_OPTIONS: LayoutOptions = {
  width: 1000,
  height: 520,
  nodeWidth: 22,
  nodePadding: 18,
  marginTop: 32,
  marginRight: 132,
  marginBottom: 32,
  marginLeft: 108,
  labelGap: 10,
  minThickness: 1.5,
};

/** Formats a monetary value the same way the reference diagrams do. */
function formatValue(value: number): string {
  return value.toFixed(2);
}

/** Mutable bookkeeping used only inside this module during layout. */
interface WorkNode {
  readonly node: ValidNode;
  readonly index: number; // input order — drives the palette
  rank: number;
  magnitude: number;
  x: number;
  y: number;
  height: number;
  color: string;
}

/**
 * Assigns each node to a column (rank) via longest-path relaxation from the
 * source nodes. Runs a bounded number of passes so a cyclic graph cannot loop
 * forever (money-flow graphs are expected to be acyclic).
 */
function assignRanks(work: readonly WorkNode[], links: readonly ValidLink[], byId: Map<number, WorkNode>): number {
  let maxRank = 0;
  // At most N passes fully relaxes any DAG of N nodes.
  for (let pass = 0; pass < work.length; pass++) {
    let changed = false;
    for (const link of links) {
      const s = byId.get(link.source);
      const t = byId.get(link.target);
      if (!s || !t) continue;
      if (t.rank < s.rank + 1) {
        t.rank = s.rank + 1;
        if (t.rank > maxRank) maxRank = t.rank;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return maxRank;
}

/**
 * Computes the Sankey layout for pre-validated nodes and links.
 *
 * Pure and deterministic: given the same inputs it always produces the same
 * geometry. Node ordering within a column follows input order (the reference
 * requires that node order is honored); crossing reduction is applied at the
 * link level by stacking each node's links in the vertical order of the
 * neighbor they connect to.
 *
 * @param nodes Validated nodes, in input order.
 * @param links Validated links referencing only valid nodes.
 * @param theme Active theme (drives the generated palette).
 * @param orientation Reserved for future vertical layout; only `horizontal`
 *   is implemented today and other values fall back to it.
 * @param options Geometry overrides (defaults to {@link DEFAULT_LAYOUT_OPTIONS}).
 */
export function computeSankeyLayout(
  nodes: readonly ValidNode[],
  links: readonly ValidLink[],
  theme: SankeyTheme,
  orientation: SankeyOrientation = 'horizontal',
  options: LayoutOptions = DEFAULT_LAYOUT_OPTIONS,
): SankeyLayout {
  void orientation; // horizontal-only for UC-1; kept for API stability.
  const { width, height, nodeWidth, nodePadding, marginTop, marginRight, marginBottom, marginLeft, labelGap, minThickness } = options;

  const palette = generatePalette(nodes.length, theme);
  const work: WorkNode[] = nodes.map((node, index) => ({
    node,
    index,
    rank: 0,
    magnitude: 0,
    x: 0,
    y: 0,
    height: 0,
    color: node.color ?? palette[index],
  }));
  const byId = new Map<number, WorkNode>(work.map((w) => [w.node.id, w]));

  // --- 1. Rank assignment (columns) --------------------------------------
  const maxRank = assignRanks(work, links, byId);

  // --- 2. Node magnitude --------------------------------------------------
  // Explicit value ("total deposit") wins; otherwise the summed inflow. The
  // drawn height is at least large enough to fit whichever side (in/out) of
  // links carries the most value, so ribbons never overflow the node.
  const inflow = new Map<number, number>();
  const outflow = new Map<number, number>();
  for (const link of links) {
    inflow.set(link.target, (inflow.get(link.target) ?? 0) + link.value);
    outflow.set(link.source, (outflow.get(link.source) ?? 0) + link.value);
  }
  for (const w of work) {
    const inSum = inflow.get(w.node.id) ?? 0;
    const outSum = outflow.get(w.node.id) ?? 0;
    const base = w.node.value ?? inSum;
    w.magnitude = Math.max(base, inSum, outSum);
  }

  // --- 3. Columns + vertical scale ---------------------------------------
  const columns: WorkNode[][] = Array.from({ length: maxRank + 1 }, () => []);
  for (const w of work) columns[w.rank].push(w);

  const innerHeight = height - marginTop - marginBottom;
  // Single scale (user units per value) so all columns share proportions.
  // Constrained by the tightest column once its inter-node gaps are removed.
  let scale = Number.POSITIVE_INFINITY;
  for (const column of columns) {
    const valueSum = column.reduce((sum, w) => sum + w.magnitude, 0);
    const gaps = Math.max(0, column.length - 1) * nodePadding;
    const usable = innerHeight - gaps;
    if (valueSum > 0 && usable > 0) {
      scale = Math.min(scale, usable / valueSum);
    }
  }
  if (!Number.isFinite(scale)) scale = 1;

  // --- 4. Horizontal position (one column per rank) ----------------------
  const innerWidth = width - marginLeft - marginRight;
  const columnX = (rank: number): number =>
    maxRank === 0 ? marginLeft + (innerWidth - nodeWidth) / 2 : marginLeft + (rank / maxRank) * (innerWidth - nodeWidth);

  // --- 5. Vertical position (stack + vertically center each column) ------
  for (const column of columns) {
    let totalHeight = 0;
    for (const w of column) {
      w.height = Math.max(w.magnitude * scale, minThickness);
      totalHeight += w.height;
    }
    totalHeight += Math.max(0, column.length - 1) * nodePadding;
    let cursor = marginTop + Math.max(0, (innerHeight - totalHeight) / 2);
    for (const w of column) {
      w.x = columnX(w.rank);
      w.y = cursor;
      cursor += w.height + nodePadding;
    }
  }

  // --- 6. Link geometry (crossing-reduced stacking) ----------------------
  const center = (w: WorkNode): number => w.y + w.height / 2;
  const thicknessOf = (link: ValidLink): number => Math.max(link.value * scale, minThickness);

  const outgoingByNode = new Map<number, ValidLink[]>();
  const incomingByNode = new Map<number, ValidLink[]>();
  for (const link of links) {
    let outList = outgoingByNode.get(link.source);
    if (!outList) outgoingByNode.set(link.source, (outList = []));
    outList.push(link);
    let inList = incomingByNode.get(link.target);
    if (!inList) incomingByNode.set(link.target, (inList = []));
    inList.push(link);
  }
  // Stack each node's outgoing links by their target's vertical position, and
  // incoming links by their source's — this minimizes ribbon crossings. The
  // resulting slice offsets are recorded per link so both endpoints agree.
  const sourceY0 = new Map<ValidLink, number>();
  const targetY0 = new Map<ValidLink, number>();
  for (const [nodeId, list] of outgoingByNode) {
    list.sort((a, b) => center(byId.get(a.target)!) - center(byId.get(b.target)!));
    let offset = byId.get(nodeId)!.y;
    for (const link of list) {
      sourceY0.set(link, offset);
      offset += thicknessOf(link);
    }
  }
  for (const [nodeId, list] of incomingByNode) {
    list.sort((a, b) => center(byId.get(a.source)!) - center(byId.get(b.source)!));
    let offset = byId.get(nodeId)!.y;
    for (const link of list) {
      targetY0.set(link, offset);
      offset += thicknessOf(link);
    }
  }

  const layoutLinks: LayoutLink[] = [];
  // Build in input order for a stable, deterministic result.
  for (const link of links) {
    const source = byId.get(link.source)!;
    const target = byId.get(link.target)!;
    const thickness = thicknessOf(link);

    const sy0 = sourceY0.get(link)!;
    const ty0 = targetY0.get(link)!;

    const x0 = source.x + nodeWidth; // right edge of source node
    const x1 = target.x; // left edge of target node
    const xm = (x0 + x1) / 2;
    const sy1 = sy0 + thickness;
    const ty1 = ty0 + thickness;

    const path =
      `M${x0},${sy0}` +
      `C${xm},${sy0} ${xm},${ty0} ${x1},${ty0}` +
      `L${x1},${ty1}` +
      `C${xm},${ty1} ${xm},${sy1} ${x0},${sy1}` +
      'Z';

    const valueLabel = formatValue(link.value);
    layoutLinks.push({
      id: `${link.source}-${link.target}`,
      source: link.source,
      target: link.target,
      path,
      color: link.color ?? source.color,
      thickness,
      valueLabel,
      labelX: xm,
      labelY: (sy0 + sy1 + ty0 + ty1) / 4,
      a11yLabel: `${source.node.label} → ${target.node.label}: ${valueLabel}`,
    });
  }

  // --- 7. Node geometry + labels -----------------------------------------
  const layoutNodes: LayoutNode[] = work.map((w) => {
    let labelX: number;
    let labelY: number;
    let labelAnchor: 'start' | 'middle' | 'end';
    if (w.rank === 0) {
      labelAnchor = 'end';
      labelX = w.x - labelGap;
      labelY = w.y + w.height / 2;
    } else if (w.rank === maxRank) {
      labelAnchor = 'start';
      labelX = w.x + nodeWidth + labelGap;
      labelY = w.y + w.height / 2;
    } else {
      labelAnchor = 'middle';
      labelX = w.x + nodeWidth / 2;
      labelY = w.y - labelGap;
    }
    return {
      id: w.node.id,
      label: w.node.label,
      valueLabel: w.node.value != null ? formatValue(w.node.value) : null,
      x: w.x,
      y: w.y,
      width: nodeWidth,
      height: w.height,
      color: w.color,
      rank: w.rank,
      labelX,
      labelY,
      labelAnchor,
      valueX: w.x + nodeWidth / 2,
      valueY: w.y + w.height / 2,
    };
  });

  return { width, height, nodes: layoutNodes, links: layoutLinks };
}
