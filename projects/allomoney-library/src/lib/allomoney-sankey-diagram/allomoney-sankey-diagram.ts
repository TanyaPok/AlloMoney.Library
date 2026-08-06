import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { ALLOMONEY_LIBRARY_CONFIG } from '../config/allomoney-library-config';
import type { SankeyData, SankeyTheme } from './models/sankey-data';
import {
  computeSankeyLayout,
  type LayoutLink,
  type LayoutNode,
  type SankeyLayout,
} from './internal/sankey-layout';
import { collectChain, type Chain, type ChainSeed } from './internal/sankey-chain';
import { validateSankeyData } from './internal/validate-sankey-data';

/** A node paired with its current hover-dim state (UC-2). */
interface RenderNode extends LayoutNode {
  /** `true` when a chain is hovered and this node is outside it. */
  readonly dimmed: boolean;
}

/** A link paired with its current hover-dim state (UC-2). */
interface RenderLink extends LayoutLink {
  /** `true` when a chain is hovered and this link is outside it. */
  readonly dimmed: boolean;
}

/** Monotonic id source so each instance gets unique `aria` target ids. */
let uidCounter = 0;

/**
 * Zero-dependency Sankey diagram component (UC-1: "Show Sankey Diagram By
 * Default").
 *
 * Standalone, signal-based, and OnPush. Given a {@link SankeyData} payload in
 * {@link dataSource} it validates the data (business rule 3), then renders a
 * native-SVG, value-proportional Sankey diagram (business rule 2). Empty or
 * fully-invalid data falls back to the themed placeholder (business rules 4/5),
 * and every rejected node/link is logged to the console.
 *
 * @example
 * ```html
 * <allomoney-sankey-diagram [dataSource]="flows()" theme="dark" />
 * ```
 */
@Component({
  selector: 'allomoney-sankey-diagram',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './allomoney-sankey-diagram.html',
  styleUrl: './allomoney-sankey-diagram.scss',
  host: {
    // Expose the resolved theme to CSS so the correct inline placeholder and
    // palette-tuned styling apply.
    '[attr.data-theme]': 'theme()',
    '[class.allomoney-sankey--empty]': 'isEmpty()',
  },
})
export class AllomoneySankeyDiagram {
  private readonly config = inject(ALLOMONEY_LIBRARY_CONFIG);
  private readonly uid = ++uidCounter;

  /** Element id for the SVG `<title>` (accessible name). */
  protected readonly titleId = `allomoney-sankey-title-${this.uid}`;
  /** Element id for the SVG `<desc>` (accessible summary). */
  protected readonly descId = `allomoney-sankey-desc-${this.uid}`;

  /**
   * The diagram data. When it is an Empty State (business rule 5) or every
   * node is invalid, the themed empty state is shown instead of a diagram.
   */
  readonly dataSource = input<SankeyData | undefined>(undefined);

  /**
   * Visual theme. Falls back to the library-wide `defaultTheme` configured via
   * `provideAlloMoneyLibrary()` when not set on the element.
   */
  readonly theme = input<SankeyTheme>(this.config.defaultTheme);

  /** Validation outcome for the current `dataSource` (business rules 3 & 5). */
  private readonly validation = computed(() => validateSankeyData(this.dataSource()));

  /** `true` when the placeholder must be shown (empty or all-invalid). */
  readonly isEmpty = computed(() => this.validation().isEmptyState);

  /**
   * The computed render geometry, or `null` while the empty state is shown.
   * Orientation defaults to `'horizontal'` per business rule 1.
   */
  protected readonly layout = computed<SankeyLayout | null>(() => {
    const validation = this.validation();
    if (validation.isEmptyState) return null;
    const orientation = this.dataSource()?.orientation ?? 'horizontal';
    return computeSankeyLayout(validation.nodes, validation.links, this.theme(), orientation);
  });

  /**
   * The element the pointer is currently over, or `null`. Seeds the UC-2 chain
   * trace; its flow thread (ancestors + descendants) stays lit, the rest dims.
   */
  private readonly hovered = signal<ChainSeed | null>(null);

  /**
   * The nodes and links that belong to the hovered element's chain, or `null`
   * when nothing is hovered. Recomputed only when the hovered element or the
   * layout changes.
   */
  private readonly activeChain = computed<Chain | null>(() => {
    const view = this.layout();
    const seed = this.hovered();
    if (!view || !seed) return null;
    return collectChain(seed, view.links);
  });

  /**
   * Nodes decorated with their current dim state. A node dims only when a chain
   * is hovered and the node is not part of it — so hovering an element whose
   * chain spans the whole diagram dims nothing (UC-2 extension 1.a).
   */
  protected readonly renderNodes = computed<readonly RenderNode[]>(() => {
    const view = this.layout();
    if (!view) return [];
    const chain = this.activeChain();
    return view.nodes.map((node) => ({
      ...node,
      dimmed: chain !== null && !chain.nodeIds.has(node.id),
    }));
  });

  /** Links decorated with their current dim state (see {@link renderNodes}). */
  protected readonly renderLinks = computed<readonly RenderLink[]>(() => {
    const view = this.layout();
    if (!view) return [];
    const chain = this.activeChain();
    return view.links.map((link) => ({
      ...link,
      dimmed: chain !== null && !chain.linkIds.has(link.id),
    }));
  });

  /** One-line accessible summary of the flows for the SVG `<desc>`. */
  protected readonly summary = computed(() => {
    const layout = this.layout();
    if (!layout) return '';
    const nodeCount = layout.nodes.length;
    const linkCount = layout.links.length;
    return `Sankey diagram with ${nodeCount} ${nodeCount === 1 ? 'node' : 'nodes'} and ${linkCount} ${linkCount === 1 ? 'flow' : 'flows'}.`;
  });

  /**
   * Highlights the chain of the hovered node (UC-2 main scenario, steps 1–2):
   * every element outside its flow thread becomes half-transparent.
   */
  protected onHoverNode(id: number): void {
    this.hovered.set({ kind: 'node', id });
  }

  /** Highlights the chain of the hovered link ribbon or its value label. */
  protected onHoverLink(link: LayoutLink): void {
    this.hovered.set({
      kind: 'link',
      id: link.id,
      source: link.source,
      target: link.target,
    });
  }

  /**
   * Clears the highlight when the pointer leaves an element (UC-2 steps 3–4):
   * the translucency added on hover is removed.
   */
  protected onLeave(): void {
    this.hovered.set(null);
  }

  constructor() {
    // Minimal guarantee: log every rejected node/link so consumers can debug
    // invalid data (main-scenario extension 1.1.b.2). Runs on each change.
    effect(() => {
      for (const message of this.validation().errors) {
        console.error(`[allomoney-sankey-diagram] ${message}`);
      }
    });
  }
}
