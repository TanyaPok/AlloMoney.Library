import type { SankeyOrientation, SankeyTheme } from '../models/sankey-data';
import { generatePalette } from './palette';
import type { ValidLink, ValidNode } from './validate-sankey-data';

/** A node positioned by the layout engine, ready to bind to SVG. */
export interface LayoutNode {
  readonly id: number;
  readonly label: string;
  /** Formatted "total deposit" shown inside the node, or `null` when derived. */
  readonly valueLabel: string | null;
  /**
   * Formatted effective node total (the explicit value, or the derived flow
   * magnitude when none was given). Always present — used for the hover tooltip.
   */
  readonly total: string;
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
}

/** A link ribbon positioned by the layout engine. */
export interface LayoutLink {
  /** Stable id for `@for` tracking: `"<source>-><target>"`. */
  readonly id: string;
  readonly source: number;
  readonly target: number;
  /** Raw flow magnitude. */
  readonly value: number;
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
  /**
   * Minimum vertical distance (center-to-center, user units) between two link
   * value labels that share a horizontal band, so they never overlap.
   * Should be at least the value label's line height.
   */
  readonly minLabelGap: number;
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
  minLabelGap: 18,
};

/**
 * Builds the value formatter for the diagram. When a non-empty ISO 4217
 * currency code is supplied, values are formatted as currency in the host
 * locale via {@link Intl.NumberFormat} (e.g. `"$10.00"`). An unknown code makes
 * `Intl` throw, so we fall back to a plain fixed-2 number. Dependency-free —
 * `Intl` is a JavaScript platform built-in.
 */
function makeValueFormatter(currency: string | null | undefined): (value: number) => string {
  const code = typeof currency === 'string' ? currency.trim() : '';
  if (code.length > 0) {
    try {
      const nf = new Intl.NumberFormat(undefined, { style: 'currency', currency: code });
      return (value) => nf.format(value);
    } catch {
      // Unknown/invalid currency code — fall through to plain formatting.
    }
  }
  return (value) => value.toFixed(2);
}

/** Anything carrying a horizontal band key and a mutable vertical position. */
interface PlacedLabel {
  readonly labelX: number;
  labelY: number;
}

/**
 * Spreads link value labels so no two overlap (business rule 2: "Two or more
 * `links[i].value` cannot overlap on Component").
 *
 * Only labels that share a horizontal band can collide: links between the same
 * pair of columns share the exact same midpoint x, and adjacent bands are a
 * full column apart. So labels are grouped by their (rounded) `labelX`, and
 * within each group pushed apart to at least `minGap` user units
 * center-to-center. Each group is then re-centered on its original mean (to
 * minimize how far any label drifts from the middle of its link) and clamped
 * within `[top, bottom]` so labels stay on-canvas. Mutates `labelY` in place.
 */
function separateLabelBands(
  labels: readonly PlacedLabel[],
  minGap: number,
  top: number,
  bottom: number,
): void {
  const bands = new Map<number, PlacedLabel[]>();
  for (const label of labels) {
    const key = Math.round(label.labelX);
    let band = bands.get(key);
    if (!band) bands.set(key, (band = []));
    band.push(label);
  }

  for (const band of bands.values()) {
    if (band.length < 2) continue;
    band.sort((a, b) => a.labelY - b.labelY);

    const mean = (arr: readonly PlacedLabel[]): number =>
      arr.reduce((sum, l) => sum + l.labelY, 0) / arr.length;
    const originalMean = mean(band);

    // Push each label below the previous one by at least `minGap`.
    for (let i = 1; i < band.length; i++) {
      const minY = band[i - 1].labelY + minGap;
      if (band[i].labelY < minY) band[i].labelY = minY;
    }

    // Re-center the spread block on its original mean to minimize drift.
    const shift = originalMean - mean(band);
    for (const label of band) label.labelY += shift;

    // Clamp the block within the canvas, favoring the top edge if it is too
    // tall to fit (so the first label always stays visible).
    const overflowBottom = band[band.length - 1].labelY - bottom;
    if (overflowBottom > 0) for (const l of band) l.labelY -= overflowBottom;
    const overflowTop = top - band[0].labelY;
    if (overflowTop > 0) for (const l of band) l.labelY += overflowTop;
  }
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
 * @param orientation `'horizontal'` (default) lays flows left→right with node
 *   names to the left of each node; `'vertical'` lays them top→bottom with names
 *   centered above each node. Vertical geometry is the horizontal layout
 *   transposed (every coordinate mirrored across x = y).
 * @param currency Optional ISO 4217 code; when set, values are formatted as
 *   currency in the host locale, otherwise as a plain fixed-2 number.
 * @param options Geometry overrides (defaults to {@link DEFAULT_LAYOUT_OPTIONS}).
 */
export function computeSankeyLayout(
  nodes: readonly ValidNode[],
  links: readonly ValidLink[],
  theme: SankeyTheme,
  orientation: SankeyOrientation = 'horizontal',
  currency: string | null = null,
  options: LayoutOptions = DEFAULT_LAYOUT_OPTIONS,
): SankeyLayout {
  const vertical = orientation === 'vertical';
  const format = makeValueFormatter(currency);
  const { width, height, nodeWidth, nodePadding, marginTop, marginRight, marginBottom, marginLeft, labelGap, minThickness, minLabelGap } = options;

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

  // Build geometry first (input order → stable, deterministic result), then
  // resolve label overlaps before emitting the final link objects.
  interface LinkGeom {
    readonly link: ValidLink;
    readonly source: WorkNode;
    readonly path: string;
    readonly thickness: number;
    readonly valueLabel: string;
    readonly a11yLabel: string;
    readonly labelX: number;
    labelY: number;
  }

  // Serializes a path coordinate, mirroring x↔y for vertical orientation so the
  // same ribbon math produces a top→bottom ribbon. Horizontal output is
  // byte-identical to a plain `${x},${y}`.
  const pt = (px: number, py: number): string => (vertical ? `${py},${px}` : `${px},${py}`);

  const geoms: LinkGeom[] = links.map((link) => {
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
      `M${pt(x0, sy0)}` +
      `C${pt(xm, sy0)} ${pt(xm, ty0)} ${pt(x1, ty0)}` +
      `L${pt(x1, ty1)}` +
      `C${pt(xm, ty1)} ${pt(xm, sy1)} ${pt(x0, sy1)}` +
      'Z';

    const valueLabel = format(link.value);
    return {
      link,
      source,
      path,
      thickness,
      valueLabel,
      a11yLabel: `${source.node.label} → ${target.node.label}: ${valueLabel}`,
      labelX: xm, // horizontal middle of the link (business rule 2)
      labelY: (sy0 + sy1 + ty0 + ty1) / 4, // ribbon center at that midpoint
    };
  });

  // Business rule 2: two or more link value labels cannot overlap. Nudge apart
  // any that share a horizontal band; horizontal midpoints are preserved.
  separateLabelBands(geoms, minLabelGap, marginTop, height - marginBottom);

  const layoutLinks: LayoutLink[] = geoms.map((geom) => ({
    id: `${geom.link.source}-${geom.link.target}`,
    source: geom.link.source,
    target: geom.link.target,
    value: geom.link.value,
    path: geom.path,
    color: geom.link.color ?? geom.source.color,
    thickness: geom.thickness,
    valueLabel: geom.valueLabel,
    labelX: vertical ? geom.labelY : geom.labelX,
    labelY: vertical ? geom.labelX : geom.labelY,
    a11yLabel: geom.a11yLabel,
  }));

  // --- 7. Node geometry + labels -----------------------------------------
  // Business rule 2: for horizontal orientation every node's name/id sits on the
  // LEFT side of the node, vertically centered — the same placement for all ranks
  // (see the reference diagrams). For vertical orientation we transpose every
  // coordinate (x↔y): the left-of-node name becomes a centered above-node label,
  // so only the text anchor changes ('end' → 'middle').
  const layoutNodes: LayoutNode[] = work.map((w) => {
    const canonLabelX = w.x - labelGap; // canonical: just left of the node
    const canonLabelY = w.y + w.height / 2; // canonical: vertical center
    const x = vertical ? w.y : w.x;
    const y = vertical ? w.x : w.y;
    const nodeW = vertical ? w.height : nodeWidth;
    const nodeH = vertical ? nodeWidth : w.height;
    return {
      id: w.node.id,
      label: w.node.label,
      valueLabel: w.node.value != null ? format(w.node.value) : null,
      total: format(w.magnitude),
      x,
      y,
      width: nodeW,
      height: nodeH,
      color: w.color,
      rank: w.rank,
      labelX: vertical ? canonLabelY : canonLabelX,
      labelY: vertical ? canonLabelX : canonLabelY,
      labelAnchor: vertical ? 'middle' : 'end',
    };
  });

  // Vertical swaps the canvas to portrait (the horizontal viewBox transposed).
  return {
    width: vertical ? height : width,
    height: vertical ? width : height,
    nodes: layoutNodes,
    links: layoutLinks,
  };
}
