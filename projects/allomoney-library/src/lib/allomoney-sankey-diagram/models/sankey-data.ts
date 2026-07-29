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
  id: string;
  /** Human-readable label. Treat as untrusted: sanitize before rendering. */
  label: string;
  /**
   * Optional CSS color for the node. When omitted, the component picks a
   * color from its theme palette.
   */
  color?: string;
}

/**
 * A directed flow of value from one node to another. The visual thickness of
 * the link is proportional to {@link value}.
 */
export interface SankeyLink {
  /** {@link SankeyNode.id} of the source (flow origin). */
  source: string;
  /** {@link SankeyNode.id} of the target (flow destination). */
  target: string;
  /** Magnitude of the flow. Must be a finite, non-negative number. */
  value: number;
  /** Optional CSS color for this link. Falls back to a theme color. */
  color?: string;
}

/**
 * The complete data set rendered by {@link AllomoneySankeyDiagram}.
 *
 * An empty (or `undefined`) data set causes the component to render its
 * themed empty state instead of a diagram.
 */
export interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

/**
 * Visual theme for the diagram. Drives which inline empty-state placeholder
 * (light or dark) is shown and the default color palette.
 */
export type SankeyTheme = 'light' | 'dark';