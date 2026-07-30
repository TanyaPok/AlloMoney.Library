import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import { ALLOMONEY_LIBRARY_CONFIG } from '../config/allomoney-library-config';
import type { SankeyData, SankeyTheme } from './models/sankey-data';
import { computeSankeyLayout, type SankeyLayout } from './internal/sankey-layout';
import { validateSankeyData } from './internal/validate-sankey-data';

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

  /** One-line accessible summary of the flows for the SVG `<desc>`. */
  protected readonly summary = computed(() => {
    const layout = this.layout();
    if (!layout) return '';
    const nodeCount = layout.nodes.length;
    const linkCount = layout.links.length;
    return `Sankey diagram with ${nodeCount} ${nodeCount === 1 ? 'node' : 'nodes'} and ${linkCount} ${linkCount === 1 ? 'flow' : 'flows'}.`;
  });

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
