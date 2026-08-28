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
