/**
 * Public data model for the AllomoneySankeyDiagram component.
 *
 * These types form part of the library's public API surface and are therefore
 * a semver contract: any breaking change here is a breaking change for
 * consumers. Keep them minimal, framework-agnostic, and dependency-free.
 */

/**
 * A single node in a Sankey diagram (e.g. an account, category, or entity
 * between which value flows).
 */
export interface SankeyNode {
  /** Stable, unique identifier used to reference this node from links. */
  readonly id: number;
  /** Human-readable label. Treat as untrusted: sanitize before rendering. */
  readonly name?: string | null;
  /**
   * Total deposit for this node. When omitted it is derived from the sum of
   * incoming link values (business rule 2).
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
 * An empty (or `undefined`) data set causes the component to render its
 * themed empty state instead of a diagram.
 */
export interface SankeyData {
  readonly nodes: readonly SankeyNode[];
  readonly links: readonly SankeyLink[];
  /** ISO currency code used when formatting values. Optional. */
  readonly currency?: string | null;
  /**
   * Flow direction of the diagram. Defaults to `'horizontal'` (business
   * rule 1) when omitted.
   */
  readonly orientation?: SankeyOrientation;
}

/**
 * Visual theme for the diagram. Drives which inline empty-state placeholder
 * (light or dark) is shown and the default color palette.
 */
export type SankeyTheme = 'light' | 'dark';

/**
 * Direction in which flows are laid out. Only `'horizontal'` is rendered
 * today; `'vertical'` is reserved for a future release.
 */
export type SankeyOrientation = 'horizontal' | 'vertical';
