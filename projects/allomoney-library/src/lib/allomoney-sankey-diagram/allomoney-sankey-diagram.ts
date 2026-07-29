import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { ALLOMONEY_LIBRARY_CONFIG } from '../config/allomoney-library-config';
import type { SankeyData, SankeyTheme } from './models/sankey-data';

/**
 * Zero-dependency Sankey diagram component.
 *
 * Standalone, signal-based, and OnPush. Renders a themed empty-state
 * placeholder until real data is supplied; the actual Sankey layout/render is
 * future work (see the `internal/` folder and the TODOs below).
 *
 * @example
 * ```html
 * <allomoney-sankey-diagram [data]="flows()" theme="dark" />
 * ```
 */
@Component({
  selector: 'allomoney-sankey-diagram',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './allomoney-sankey-diagram.html',
  styleUrl: './allomoney-sankey-diagram.scss',
  host: {
    // Expose the resolved theme to CSS so the correct inline placeholder shows.
    '[attr.data-theme]': 'theme()',
    '[class.allomoney-sankey--empty]': 'isEmpty()',
  },
})
export class AllomoneySankeyDiagram {
  private readonly config = inject(ALLOMONEY_LIBRARY_CONFIG);

  /**
   * The diagram data. When `undefined` or empty, the themed empty state is
   * shown instead of a diagram.
   */
  readonly data = input<SankeyData | undefined>(undefined);

  /**
   * Visual theme. Falls back to the library-wide `defaultTheme` configured via
   * `provideAlloMoneyLibrary()` when not set on the element.
   */
  readonly theme = input<SankeyTheme>(this.config.defaultTheme);

  /** `true` when there is nothing to render (no nodes / no links). */
  readonly isEmpty = computed(() => {
    const value = this.data();
    return !value || value.nodes.length === 0 || value.links.length === 0;
  });

  // TODO(sankey): Implement the dependency-free layout engine in `internal/`:
  //   1. Assign nodes to columns (ranks) from the link graph.
  //   2. Order nodes within each column to minimise crossings.
  //   3. Compute node heights/positions proportional to flow value.
  //   4. Emit native-SVG <path> ribbons for each link.
  // TODO(sankey): SECURITY — node/link labels are untrusted. Bind them via
  //   Angular interpolation (auto-escaped). Never use innerHTML or
  //   bypassSecurityTrustHtml to inject label text (XSS risk).
}