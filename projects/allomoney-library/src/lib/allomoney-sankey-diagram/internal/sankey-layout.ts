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
  /**
   * `true` for a synthetic "ghost" node: a phantom duplicate of a real node,
   * created to break a cycle by redrawing a returning flow forward instead of
   * looping backward. A ghost is drawn as a border-only outline (no fill) in its
   * original's color, is never editable/selectable, and never appears in
   * {@link SankeyData} — it exists only in this layout.
   */
  readonly ghost: boolean;
  /** For a ghost, the id of the real node it duplicates; `null` otherwise. */
  readonly ghostOf: number | null;
}

/** A link ribbon positioned by the layout engine. */
export interface LayoutLink {
  /** Stable id for `@for` tracking: `"<source>-><target>"`. */
  readonly id: string;
  readonly source: number;
  readonly target: number;
  /**
   * Position of the originating link in {@link SankeyData.links}. Used to write an
   * edit back to the exact link — the reliable identity when parallel links share
   * a source and target. For an aggregate it is the first contributor's index.
   */
  readonly sourceIndex: number;
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
  /**
   * `true` when this ribbon aggregates two or more parallel links (same source
   * and target) whose values were summed. Such a flow's value is derived, so it
   * cannot be edited in place — the component blocks the attempt and logs why.
   */
  readonly aggregated: boolean;
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
  /**
   * Minimum gap between two adjacent rank columns along the flow axis. Unlike
   * `nodePadding` (which separates nodes stacked within one column) this must be
   * wide enough to show the link value label that sits between two columns and,
   * in vertical orientation, to keep that label clear of the next node's name —
   * so it is sized to a couple of text lines, not the tighter node padding.
   */
  readonly minColumnGap: number;
  /**
   * Minimum drawn thickness (user units) of a node's value-proportional side and
   * of a link ribbon. It is a legibility floor: a small flow next to a large one
   * would otherwise render as a barely-visible sliver, so every node and link is
   * drawn at least this thick even when its value is tiny.
   */
  readonly minThickness: number;
  /**
   * Minimum vertical distance (center-to-center, user units) between two link
   * value labels that share a horizontal band, so they never overlap.
   * Should be at least the value label's line height.
   */
  readonly minLabelGap: number;
  /**
   * Font size (user units) used only to ESTIMATE on-diagram name widths when
   * deciding how many characters fit before a vertical-orientation label would
   * overlap its neighbour. Should track the rendered `--allomoney-label-size`; an
   * off estimate merely shifts how aggressively long names truncate, never
   * correctness.
   */
  readonly labelFontSize: number;
  /**
   * The most characters of a node name the diagram will display (matching the
   * component's `maxDisplayedNodeName`). In vertical orientation the gap between
   * adjacent nodes is widened to fit names up to this length, so a name shown on
   * the diagram never overlaps its neighbour.
   */
  readonly maxDisplayedNodeName: number;
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
  minColumnGap: 52,
  // Legibility floor so small nodes/links never shrink to slivers next to large
  // ones — roughly the node's flow-axis width, so a minimal element reads as a
  // clear block rather than a thin line.
  minThickness: 24,
  minLabelGap: 18,
  labelFontSize: 12,
  maxDisplayedNodeName: 17,
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
  rank: number;
  magnitude: number;
  x: number;
  y: number;
  height: number;
  color: string;
  /** `true` for a synthetic ghost node (see {@link LayoutNode.ghost}). */
  ghost: boolean;
  /** For a ghost, the real node id it duplicates; `null` for real nodes. */
  ghostOf: number | null;
}

/**
 * Merges parallel links — those sharing the same source AND target — into a
 * single aggregate whose value is their summed magnitude, so a flow between two
 * nodes always reads as one ribbon (and gets one unique `"source-target"` track
 * id instead of colliding duplicates). First-seen order is preserved for a
 * deterministic result, and the aggregate keeps the first contributor's colour.
 * Opposite-direction links (a genuine cycle, e.g. `A→B` and `B→A`) are distinct
 * pairs and are left untouched.
 */
function aggregateParallelLinks(
  links: readonly ValidLink[],
): { readonly links: ValidLink[]; readonly counts: ReadonlyMap<string, number> } {
  const byPair = new Map<string, ValidLink>();
  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const link of links) {
    const key = `${link.source}->${link.target}`;
    const existing = byPair.get(key);
    if (existing) {
      byPair.set(key, { ...existing, value: existing.value + link.value });
      counts.set(key, (counts.get(key) ?? 1) + 1);
    } else {
      byPair.set(key, link);
      counts.set(key, 1);
      order.push(key);
    }
  }
  return { links: order.map((key) => byPair.get(key)!), counts };
}

/**
 * Finds the "back edges" — the links that close a cycle. A directed graph is
 * acyclic exactly when a depth-first search crosses no edge into a node that is
 * still on the current DFS stack; each such edge is a back edge. Removing them
 * leaves a DAG that {@link assignRanks} can lay out, and each is then redrawn
 * forward into a ghost duplicate of its target instead of looping backward.
 *
 * Iterative (an explicit stack) so a deep chain cannot overflow the call stack.
 * Deterministic: roots and each node's out-links are visited in input order.
 */
function detectBackEdges(
  work: readonly WorkNode[],
  outgoing: ReadonlyMap<number, readonly ValidLink[]>,
): ReadonlySet<ValidLink> {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const state = new Map<number, number>();
  const back = new Set<ValidLink>();

  for (const root of work) {
    if ((state.get(root.node.id) ?? WHITE) !== WHITE) continue;
    const stack: { readonly id: number; i: number }[] = [{ id: root.node.id, i: 0 }];
    state.set(root.node.id, GRAY);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const out = outgoing.get(frame.id) ?? [];
      if (frame.i < out.length) {
        const link = out[frame.i++];
        const next = state.get(link.target) ?? WHITE;
        if (next === GRAY) {
          back.add(link); // edge into an ancestor on the stack → closes a cycle
        } else if (next === WHITE) {
          state.set(link.target, GRAY);
          stack.push({ id: link.target, i: 0 });
        }
      } else {
        state.set(frame.id, BLACK);
        stack.pop();
      }
    }
  }
  return back;
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
 * @param rawLinks Validated links referencing only valid nodes. Parallel links
 *   (same source and target) are aggregated into one summed ribbon before layout.
 * @param theme Active theme (drives the generated palette).
 * @param orientation `'horizontal'` (default) lays flows left→right with node
 *   names to the left of each node; `'vertical'` lays them top→bottom with names
 *   centered above each node. Vertical geometry is the horizontal layout
 *   transposed (every coordinate mirrored across x = y).
 * @param currency Optional ISO 4217 code; when set, values are formatted as
 *   currency in the host locale, otherwise as a plain fixed-2 number.
 * @param aggregate When `true` (default), parallel links (same source and
 *   target) are merged into one summed ribbon; when `false`, every link is drawn
 *   as its own ribbon.
 * @param options Geometry overrides (defaults to {@link DEFAULT_LAYOUT_OPTIONS}).
 */
export function computeSankeyLayout(
  nodes: readonly ValidNode[],
  rawLinks: readonly ValidLink[],
  theme: SankeyTheme,
  orientation: SankeyOrientation = 'horizontal',
  currency: string | null = null,
  aggregate = true,
  options: LayoutOptions = DEFAULT_LAYOUT_OPTIONS,
): SankeyLayout {
  const vertical = orientation === 'vertical';
  const format = makeValueFormatter(currency);
  const { width, height, nodeWidth, nodePadding, marginTop, marginRight, marginBottom, marginLeft, labelGap, minColumnGap, minThickness, minLabelGap, labelFontSize, maxDisplayedNodeName } = options;

  // Several links between the same two nodes are shown as one aggregate ribbon
  // (their summed value) unless aggregation is turned off, in which case every
  // link is kept as-is. Everything below — cycle detection, magnitude, stacking
  // and geometry — then works on `links`. `linkCounts` records how many raw links
  // each pair merged, so the emitted link can flag an aggregate (whose derived
  // value must not be edited in place); it is empty when not aggregating.
  let links: readonly ValidLink[];
  let linkCounts: ReadonlyMap<string, number>;
  if (aggregate) {
    const merged = aggregateParallelLinks(rawLinks);
    links = merged.links;
    linkCounts = merged.counts;
  } else {
    links = rawLinks;
    linkCounts = new Map();
  }

  // A colour set directly on a node is reserved: the auto palette must never
  // reproduce it for another node. Two nodes only share a colour when both set
  // it explicitly. So we drop any generated colour that collides with an
  // explicit one and hand the survivors out to the auto-coloured nodes in
  // order. Generate a few extra (one per explicit colour) so skipping never
  // leaves an auto node short.
  const explicitColors = new Set<string>();
  for (const node of nodes) {
    if (node.color != null) explicitColors.add(node.color);
  }
  const autoPalette = generatePalette(nodes.length + explicitColors.size, theme)
    .filter((color) => !explicitColors.has(color));

  let autoCursor = 0;
  const work: WorkNode[] = nodes.map((node) => ({
    node,
    rank: 0,
    magnitude: 0,
    x: 0,
    y: 0,
    height: 0,
    color: node.color ?? autoPalette[autoCursor++],
    ghost: false,
    ghostOf: null,
  }));
  const byId = new Map<number, WorkNode>(work.map((w) => [w.node.id, w]));

  // --- 1. Cycle handling + rank assignment (columns) ---------------------
  // Money-flow graphs are expected to be acyclic, but a returning flow (say a
  // broker paying back into the checking account) forms a cycle that longest-
  // path ranking cannot place. Each link that closes a cycle is detected as a
  // back edge, left out of ranking so the rest lays out as a clean left→right
  // DAG, and later redrawn forward into a "ghost" duplicate of its target.
  const outgoingAll = new Map<number, ValidLink[]>();
  for (const link of links) {
    let list = outgoingAll.get(link.source);
    if (!list) outgoingAll.set(link.source, (list = []));
    list.push(link);
  }
  const backEdges = detectBackEdges(work, outgoingAll);
  const forwardLinks =
    backEdges.size > 0 ? links.filter((link) => !backEdges.has(link)) : links;

  let maxRank = assignRanks(work, forwardLinks, byId);

  // Each back edge is redrawn forward into a phantom copy of its target placed
  // one column past its source, so the returning flow reads left→right into a
  // duplicate instead of doubling back. Ghosts borrow their original's label and
  // colour but are drawn border-only, are never editable, and are absent from
  // the consumer's data. Their ids are allocated above every real id so they can
  // never collide with one.
  //
  // A single ghost is shared by every back edge that returns to the same
  // original AND lands on the same level (rank) — several brokers paying back
  // into one account collapse to one phantom account, its return ribbons
  // stacked into it. Back edges to that original that fall on different levels
  // (their sources sit in different columns) keep their own ghost, since they
  // cannot share one column.
  let nextGhostId = 0;
  for (const w of work) nextGhostId = Math.max(nextGhostId, w.node.id);
  nextGhostId = Math.floor(nextGhostId) + 1;
  const usedIds = new Set<number>(byId.keys());
  const allocGhostId = (): number => {
    while (usedIds.has(nextGhostId)) nextGhostId++;
    const id = nextGhostId++;
    usedIds.add(id);
    return id;
  };

  // Back edge → the ghost that stands in for its (real) target. The emitted link
  // keeps its real source/target for tooltips, a11y and editing; only its drawn
  // geometry is routed into the ghost. Ghosts are keyed by (original id, rank) so
  // co-levelled returns to the same original reuse one phantom node.
  const ghostByBackEdge = new Map<ValidLink, WorkNode>();
  const ghostByOriginalRank = new Map<string, WorkNode>();
  for (const link of backEdges) {
    const original = byId.get(link.target);
    const source = byId.get(link.source);
    if (!original || !source) continue;
    const rank = source.rank + 1;
    const groupKey = `${original.node.id}@${rank}`;
    let ghost = ghostByOriginalRank.get(groupKey);
    if (!ghost) {
      ghost = {
        node: {
          id: allocGhostId(),
          label: original.node.label,
          value: null,
          ...(original.node.color != null ? { color: original.node.color } : {}),
        },
        rank,
        magnitude: 0,
        x: 0,
        y: 0,
        height: 0,
        color: original.color,
        ghost: true,
        ghostOf: original.node.id,
      };
      work.push(ghost);
      byId.set(ghost.node.id, ghost);
      ghostByOriginalRank.set(groupKey, ghost);
      if (ghost.rank > maxRank) maxRank = ghost.rank;
    }
    ghostByBackEdge.set(link, ghost);
  }

  // Geometry uses these links: a back edge flows into its ghost instead of
  // looping back, every other link is unchanged. `originalOf` maps each geometry
  // link back to the consumer-facing link it was derived from.
  const originalOf = new Map<ValidLink, ValidLink>();
  const geomLinks: ValidLink[] = links.map((link) => {
    const ghost = ghostByBackEdge.get(link);
    if (!ghost) {
      originalOf.set(link, link);
      return link;
    }
    const routed: ValidLink = {
      source: link.source,
      target: ghost.node.id,
      value: link.value,
      index: link.index,
      ...(link.color != null ? { color: link.color } : {}),
    };
    originalOf.set(routed, link);
    return routed;
  });

  // --- 2. Node magnitude --------------------------------------------------
  // Explicit value ("total deposit") wins; otherwise the summed inflow. The
  // drawn height is at least large enough to fit whichever side (in/out) of
  // links carries the most value, so ribbons never overflow the node.
  // Uses the routed geometry links so a returning flow sizes its ghost sink
  // rather than folding back into (and inflating) its real target node.
  const inflow = new Map<number, number>();
  const outflow = new Map<number, number>();
  for (const link of geomLinks) {
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
  // Ranks are spread along the flow axis. Two adjacent columns must be at least
  // a node width plus a gap apart or their rects would overlap, so when the
  // requested width is too narrow for every rank the canvas grows along the
  // flow axis to that necessary minimum (nodes must never overlap). A graph
  // that already fits keeps spreading across the full requested width.
  const innerWidth = width - marginLeft - marginRight;
  const requiredInnerWidth =
    maxRank === 0 ? innerWidth : maxRank * (nodeWidth + minColumnGap) + nodeWidth;
  const effectiveInnerWidth = Math.max(innerWidth, requiredInnerWidth);
  const effectiveWidth = marginLeft + effectiveInnerWidth + marginRight;
  const columnX = (rank: number): number =>
    maxRank === 0
      ? marginLeft + (effectiveInnerWidth - nodeWidth) / 2
      : marginLeft + (rank / maxRank) * (effectiveInnerWidth - nodeWidth);

  // --- 5. Vertical position (stack + distribute each column) -------------
  // Size every node first. A node is never drawn thinner than minThickness.
  for (const w of work) w.height = Math.max(w.magnitude * scale, minThickness);

  // The minimum gap each consecutive pair in a column needs. Nodes must never
  // overlap (>= nodePadding). In VERTICAL orientation each node's name is drawn
  // centered ABOVE the node, so the gap also widens enough that the names of two
  // adjacent nodes (each up to maxDisplayedNodeName chars, estimated from the
  // label font size) do not overlap — rather than shrinking the names to fit a
  // fixed gap. In horizontal orientation names sit to the left and stack, so
  // they never collide this way and the gap is just nodePadding. Columns are in
  // placement (input) order, which is top-to-bottom order.
  const avgCharWidth = labelFontSize * 0.62; // rough proportional-font estimate
  const labelPad = labelFontSize; // breathing room between two adjacent names
  const estLabelWidth = (label: string): number =>
    Math.min(label.length, maxDisplayedNodeName) * avgCharWidth;
  const requiredGap = (a: WorkNode, b: WorkNode): number => {
    if (!vertical) return nodePadding;
    // centre-to-centre must clear both half-labels + padding; the gap is that
    // minus the two half-heights already between the centres.
    const forLabels =
      (estLabelWidth(a.node.label) + estLabelWidth(b.node.label)) / 2 +
      labelPad -
      (a.height + b.height) / 2;
    return Math.max(nodePadding, forLabels);
  };

  const columnGaps = columns.map((column) => {
    const gaps: number[] = [];
    for (let i = 1; i < column.length; i++) gaps.push(requiredGap(column[i - 1], column[i]));
    return gaps;
  });
  const columnHeights = columns.map((column, i) => {
    const stacked = column.reduce((sum, w) => sum + w.height, 0);
    return stacked + columnGaps[i].reduce((sum, g) => sum + g, 0);
  });
  const requiredInnerHeight = columnHeights.reduce((max, h) => Math.max(max, h), 0);
  const effectiveInnerHeight = Math.max(innerHeight, requiredInnerHeight);
  const effectiveHeight = marginTop + effectiveInnerHeight + marginBottom;

  for (let i = 0; i < columns.length; i++) {
    const column = columns[i];
    const gaps = columnGaps[i];
    // Distribute the column's nodes across the FULL inner height so they occupy
    // all the available cross-axis space instead of clustering in a centered
    // block. Each pair keeps at least its required gap (above); any leftover
    // space is shared equally on top of those gaps (space-between: first node
    // flush at the top edge, last flush at the bottom). A lone node is centered.
    const stacked = column.reduce((sum, w) => sum + w.height, 0);
    const gapSum = gaps.reduce((sum, g) => sum + g, 0);
    const extra = Math.max(0, effectiveInnerHeight - stacked - gapSum);
    const extraPer = gaps.length > 0 ? extra / gaps.length : 0;
    let cursor = gaps.length > 0 ? marginTop : marginTop + extra / 2;
    for (let k = 0; k < column.length; k++) {
      const w = column[k];
      w.x = columnX(w.rank);
      w.y = cursor;
      cursor += w.height + (k < gaps.length ? gaps[k] + extraPer : 0);
    }
  }

  // --- 6. Link geometry (crossing-reduced stacking) ----------------------
  const center = (w: WorkNode): number => w.y + w.height / 2;
  const thicknessOf = (link: ValidLink): number => Math.max(link.value * scale, minThickness);

  const outgoingByNode = new Map<number, ValidLink[]>();
  const incomingByNode = new Map<number, ValidLink[]>();
  for (const link of geomLinks) {
    let outList = outgoingByNode.get(link.source);
    if (!outList) outgoingByNode.set(link.source, (outList = []));
    outList.push(link);
    let inList = incomingByNode.get(link.target);
    if (!inList) incomingByNode.set(link.target, (inList = []));
    inList.push(link);
  }
  // Stack each node's outgoing links by their target's vertical position, and
  // incoming links by their source's — this minimizes ribbon crossings. The
  // resulting slice spans are recorded per link (top `y0`, bottom `y1`) for each
  // side so both endpoints agree.
  const sourceY0 = new Map<ValidLink, number>();
  const sourceY1 = new Map<ValidLink, number>();
  const targetY0 = new Map<ValidLink, number>();
  const targetY1 = new Map<ValidLink, number>();

  // Stacks one side of a node's links so their ribbon ends attach flush to the
  // node: each link takes its value-proportional thickness from the node's top
  // edge downward. Small links floored to `minThickness` (and any zero-value
  // link) can make the stack taller than the node's fixed drawn height, which
  // would spill the ribbons past the node's bottom edge — so when the stack
  // overflows it is scaled to exactly fill the node height. It never expands
  // past the natural thickness, so a node carrying less than its magnitude on
  // this side keeps a proportional gap. Source and target sides are fitted
  // independently, so an oversubscribed end simply tapers to meet its node.
  const stackSide = (
    nodeId: number,
    list: readonly ValidLink[],
    y0: Map<ValidLink, number>,
    y1: Map<ValidLink, number>,
  ): void => {
    const node = byId.get(nodeId)!;
    let total = 0;
    for (const link of list) total += thicknessOf(link);
    const fit = total > node.height ? node.height / total : 1;
    let offset = node.y;
    for (const link of list) {
      const slice = thicknessOf(link) * fit;
      y0.set(link, offset);
      y1.set(link, offset + slice);
      offset += slice;
    }
  };

  for (const [nodeId, list] of outgoingByNode) {
    list.sort((a, b) => center(byId.get(a.target)!) - center(byId.get(b.target)!));
    stackSide(nodeId, list, sourceY0, sourceY1);
  }
  for (const [nodeId, list] of incomingByNode) {
    list.sort((a, b) => center(byId.get(a.source)!) - center(byId.get(b.source)!));
    stackSide(nodeId, list, targetY0, targetY1);
  }

  // Build geometry first (input order → stable, deterministic result), then
  // resolve label overlaps before emitting the final link objects.
  interface LinkGeom {
    /** The consumer-facing link this ribbon represents (real source/target). */
    readonly original: ValidLink;
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

  const geoms: LinkGeom[] = geomLinks.map((link) => {
    const original = originalOf.get(link)!;
    const source = byId.get(link.source)!;
    // For a back edge `target` is the ghost duplicate, so the ribbon is drawn
    // forward into it; the emitted link still carries its real source/target.
    const target = byId.get(link.target)!;
    const thickness = thicknessOf(link);

    // Fitted spans on each side — sy1-sy0 (source) and ty1-ty0 (target) may
    // differ when a node is oversubscribed, so the ribbon tapers to stay flush.
    const sy0 = sourceY0.get(link)!;
    const sy1 = sourceY1.get(link)!;
    const ty0 = targetY0.get(link)!;
    const ty1 = targetY1.get(link)!;

    const x0 = source.x + nodeWidth; // right edge of source node
    const x1 = target.x; // left edge of target node
    const xm = (x0 + x1) / 2;

    const path =
      `M${pt(x0, sy0)}` +
      `C${pt(xm, sy0)} ${pt(xm, ty0)} ${pt(x1, ty0)}` +
      `L${pt(x1, ty1)}` +
      `C${pt(xm, ty1)} ${pt(xm, sy1)} ${pt(x0, sy1)}` +
      'Z';

    const valueLabel = format(link.value);
    return {
      original,
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
  separateLabelBands(geoms, minLabelGap, marginTop, effectiveHeight - marginBottom);

  // When aggregation is off, parallel links share the same `source-target`; a
  // per-pair occurrence suffix keeps every id unique for `@for` tracking and
  // selection. With aggregation on there are no duplicates, so ids are unchanged.
  const idSeen = new Map<string, number>();
  const layoutLinks: LayoutLink[] = geoms.map((geom) => {
    const pairKey = `${geom.original.source}->${geom.original.target}`;
    const seen = idSeen.get(pairKey) ?? 0;
    idSeen.set(pairKey, seen + 1);
    const baseId = `${geom.original.source}-${geom.original.target}`;
    return {
      id: seen === 0 ? baseId : `${baseId}#${seen}`,
      source: geom.original.source,
      target: geom.original.target,
      sourceIndex: geom.original.index,
      value: geom.original.value,
      path: geom.path,
      color: geom.original.color ?? geom.source.color,
      thickness: geom.thickness,
      valueLabel: geom.valueLabel,
      labelX: vertical ? geom.labelY : geom.labelX,
      labelY: vertical ? geom.labelX : geom.labelY,
      a11yLabel: geom.a11yLabel,
      aggregated: (linkCounts.get(pairKey) ?? 1) > 1,
    };
  });

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
      ghost: w.ghost,
      ghostOf: w.ghostOf,
    };
  });

  // Vertical swaps the canvas to portrait (the horizontal viewBox transposed).
  // effectiveWidth/effectiveHeight carry any growth needed to fit the ranks and
  // the tallest column; for the vertical layout the two axes swap.
  return {
    width: vertical ? effectiveHeight : effectiveWidth,
    height: vertical ? effectiveWidth : effectiveHeight,
    nodes: layoutNodes,
    links: layoutLinks,
  };
}
