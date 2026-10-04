/**
 * Public data model for the AllomoneySankeyDiagram component.
 *
 * These types form part of the library's public API surface and are therefore
 * a semver contract: any breaking change here is a breaking change for
 * consumers. Keep them minimal, framework-agnostic, and dependency-free.
 */

/**
 * A single node in a Sankey diagram (e.g. an account).
 */
export interface SankeyNode {
  /** Stable, unique identifier used to reference this node from links. */
  readonly id: number;
  /**
   * Human-readable label. Rendered as auto-escaped SVG text (never as HTML),
   * so any markup in the string is shown literally and cannot execute.
   */
  readonly name?: string | null;
  /**
   * Value of the node; total deposit for this node. When omitted it is derived from the sum of
   * incoming link values.
   */
  readonly value?: number | null;
  /**
   * Optional CSS color for the node. When omitted, the component picks a
   * color from its theme palette.
   */
  readonly color?: string;
}

/**
 * A directed flow of value from one node to another. The visual thickness of
 * the link is proportional to {@link value}.
 */
export interface SankeyLink {
  /** {@link SankeyNode.id} of the source (flow origin). */
  readonly source: number;
  /** {@link SankeyNode.id} of the target (flow destination). */
  readonly target: number;
  /** Magnitude of the flow. Must be a finite, positive number. */
  readonly value: number;
  /** Optional CSS color for this link. Falls back to the source node color. */
  readonly color?: string;
}

/**
 * The complete data set rendered by {@link AllomoneySankeyDiagram}.
 *
 * Carries only the graph itself — the `nodes` and `links`. Presentation
 * concerns (currency formatting, flow orientation) live in {@link SankeyOptions},
 * supplied through the component's separate `options` input.
 *
 * An empty (or `undefined`) data set causes the component to render its
 * themed empty state instead of a diagram.
 */
export interface SankeyData {
  readonly nodes: readonly SankeyNode[];
  readonly links: readonly SankeyLink[];
}

/**
 * Presentation options for {@link AllomoneySankeyDiagram}, supplied through the
 * component's `options` input separately from the {@link SankeyData} graph.
 */
export interface SankeyOptions {
  /**
   * Visual theme. When omitted, falls back to the library-wide `defaultTheme`
   * configured via `provideAlloMoneyLibrary()`.
   */
  readonly theme?: SankeyTheme;
  /**
   * Optional ISO 4217 currency code. When set, node and link values are
   * formatted as currency in the host locale (e.g. `"$10.00"`); otherwise a
   * plain 2-decimal number is shown. An unrecognized code falls back to the
   * plain format.
   */
  readonly currency?: string | null;
  /**
   * Flow direction of the diagram. Defaults to `'horizontal'` when omitted.
   */
  readonly orientation?: SankeyOrientation;
  /**
   * Rendered width in CSS pixels. When omitted (or `null`), the diagram fills
   * 100% of its container. An invalid or display-distorting value is ignored
   * (logged to the console) and the default size is used instead.
   */
  readonly width?: number | null;
  /**
   * Rendered height in CSS pixels. When omitted (or `null`), the diagram fills
   * 100% of its container. An invalid or display-distorting value is ignored
   * (logged to the console) and the default size is used instead.
   */
  readonly height?: number | null;
  /**
   * When `true`, a user may edit each node's name by double-clicking it.
   * Defaults to `false` (read-only).
   */
  readonly canEditNodeName?: boolean;
  /**
   * When `true`, a user may edit each node's value by double-clicking it.
   * Defaults to `false` (read-only).
   */
  readonly canEditNodeValue?: boolean;
  /**
   * When `true`, a user may edit each link's value by double-clicking it.
   * Defaults to `false` (read-only).
   */
  readonly canEditLinkValue?: boolean;
  /**
   * When `true`, a user may re-point each link's source to another node.
   * Defaults to `false` (read-only).
   */
  readonly canEditLinkSource?: boolean;
  /**
   * When `true`, a user may re-point each link's target to another node.
   * Defaults to `false` (read-only).
   */
  readonly canEditLinkTarget?: boolean;
  /**
   * Message shown in the empty state when there are no flows to display.
   * Rendered as auto-escaped text (never as HTML), so any markup in the string
   * is shown literally and cannot execute. Defaults to `"No Data"`.
   */
  readonly noDataMessage?: string;
  /**
   * Maximum number of characters of a node's name to display in the diagram.
   * Defaults to `17`. A name within the limit is shown in full; a longer name is
   * truncated to this many characters followed by an ellipsis (`…`). The full,
   * untruncated name is still exposed to assistive technology.
   */
  readonly maxDisplayedNodeName?: number;
  /**
   * When `true` (the default), several links between the same two nodes are
   * merged into a single ribbon whose value is their sum; the derived value of
   * such an aggregate cannot be edited in place. When `false`, every link is
   * drawn as its own ribbon.
   */
  readonly canAggregateLinks?: boolean;
  /**
   * Controls the horizontal axis when the diagram is wider than its container.
   * Defaults to `true`.
   *
   * - `true`: the diagram keeps its natural (1:1) width so every node, label and
   *   link value stays at a legible, user-friendly size, and the diagram scrolls
   *   horizontally when it does not fit.
   * - `false`: the diagram is scaled down to fit the container width (no
   *   horizontal scrollbar), which may make elements smaller.
   */
  readonly horizontalScrolling?: boolean;
  /**
   * Controls the vertical axis when the diagram is taller than its container.
   * Defaults to `true`. Behaves like {@link horizontalScrolling} on the vertical
   * axis: `true` keeps the natural height (scrolling when needed) so elements
   * stay legible; `false` scales the diagram down to fit the available height.
   */
  readonly verticalScrolling?: boolean;
  /**
   * Legend configuration (UC-5). May be partial: any omitted field — or an
   * omitted/`null`/`{}` legend altogether — falls back to its documented default
   * (see {@link SankeyLegend}). When a legend is supplied both here and through
   * the component's `[legend]` input, this one takes priority field by field.
   */
  readonly legend?: SankeyLegend | null;
}

/**
 * Where the legend sits relative to the diagram: to its `'left'`, above it
 * (`'top'`), to its `'right'`, or below it (`'bottom'`, the default).
 */
export type LegendLocation = 'left' | 'top' | 'right' | 'bottom';

/**
 * Legend configuration for {@link AllomoneySankeyDiagram} (UC-5). Every field is
 * optional: an omitted field falls back to its default, so a partial legend such
 * as `{ visibility: true }` is valid and the rest is filled in. Supply it either
 * through the component's `[legend]` input or via {@link SankeyOptions.legend};
 * when both are given, the `options` legend wins field by field.
 */
export interface SankeyLegend {
  /** Whether the legend is shown at all. Defaults to `true`. */
  readonly visibility?: boolean;
  /** Where the legend sits relative to the diagram. Defaults to `'bottom'`. */
  readonly location?: LegendLocation;
  /**
   * When `false` (the default) the legend shows only each node's colour
   * swatch(es) and name (or id when the name is empty). When `true` it also shows
   * each node's total incoming and outgoing sums, labelled by {@link inLabel} and
   * {@link outLabel}.
   */
  readonly isFullLegendShown?: boolean;
  /**
   * Label for a node's total incoming sum in the full legend. Rendered as
   * auto-escaped text (never as HTML). An empty or whitespace-only string is
   * treated as unset and falls back to the default `'Deposit'`.
   */
  readonly inLabel?: string;
  /**
   * Label for a node's total outgoing sum in the full legend. Rendered as
   * auto-escaped text (never as HTML). An empty or whitespace-only string is
   * treated as unset and falls back to the default `'Withdrawal'`.
   */
  readonly outLabel?: string;
}

/**
 * Visual theme for the diagram. Drives which inline empty-state placeholder
 * (light or dark) is shown and the default color palette.
 */
export type SankeyTheme = 'light' | 'dark';

/**
 * Direction in which flows are laid out. `'horizontal'` runs flows left→right
 * with node names to the left; `'vertical'` runs them top→bottom with node
 * names centered above each node.
 */
export type SankeyOrientation = 'horizontal' | 'vertical';
