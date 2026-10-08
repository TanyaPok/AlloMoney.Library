import {
  afterNextRender,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  model,
  numberAttribute,
  signal,
  viewChild,
} from '@angular/core';
import { ALLOMONEY_LIBRARY_CONFIG } from '../config/allomoney-library-config';
import type {
  SankeyData,
  SankeyLegend,
  SankeyOptions,
  SankeyOrientation,
  SankeyTheme,
} from './models/sankey-data';
import {
  computeSankeyLayout,
  DEFAULT_LAYOUT_OPTIONS,
  type LayoutLink,
  type LayoutNode,
  type SankeyLayout,
} from './internal/sankey-layout';
import { collectChain, type Chain, type ChainSeed } from './internal/sankey-chain';
import { validateSankeyData } from './internal/validate-sankey-data';
import { resolveDimensions } from './internal/validate-dimensions';
import { resolveLegend, type ResolvedSankeyLegend } from './internal/resolve-legend';
import { makeValueFormatter } from './internal/format-value';

/** A node paired with its current hover-dim state. */
interface RenderNode extends LayoutNode {
  /** `true` when a chain is hovered and this node is outside it. */
  readonly dimmed: boolean;
  /** `true` when this node is the current selection (intensified edge). */
  readonly selected: boolean;
  /** Accessible name for the node's editable `button`, precomputed. */
  readonly editLabel: string;
  /**
   * The node name as shown in the diagram: {@link LayoutNode.label} truncated to
   * {@link AllomoneySankeyDiagram.maxDisplayedNodeName} characters plus an
   * ellipsis when it is longer. The untruncated `label` is kept for assistive tech.
   */
  readonly displayLabel: string;
}

/** A link paired with its current hover-dim state. */
interface RenderLink extends LayoutLink {
  /** `true` when a chain is hovered and this link is outside it. */
  readonly dimmed: boolean;
  /** `true` when this link is the current selection (intensified edge). */
  readonly selected: boolean;
  /** Accessible name for the link's editable `button`, precomputed. */
  readonly editLabel: string;
}

/** The currently selected element, or `null` when nothing is selected. */
type Selection = { readonly kind: 'node'; readonly id: number } | { readonly kind: 'link'; readonly id: string };

/** One line of the custom hover tooltip. */
interface TooltipRow {
  /** Field label (e.g. `"Source"`), or `null` to show only the value. */
  readonly label: string | null;
  /** The formatted value shown on this row. */
  readonly value: string;
}

/** The placed custom tooltip: pointer-relative position, flip flags, and rows. */
interface TooltipView {
  /** Pointer x, in pixels relative to the host. */
  readonly x: number;
  /** Pointer y, in pixels relative to the host. */
  readonly y: number;
  /** Anchor to the left of the pointer when it is in the host's right half. */
  readonly flipX: boolean;
  /** Anchor above the pointer when it is in the host's lower half. */
  readonly flipY: boolean;
  /** The rows to render, top to bottom. */
  readonly rows: readonly TooltipRow[];
}

/** Fields shared by every in-place edit draft. */
interface EditDraftBase {
  /** Validation message to show, or `null` while the draft is clean. */
  readonly error: string | null;
  /**
   * Which field {@link error} refers to, so only that control is flagged
   * `aria-invalid` (and given the error border) rather than every input. A value
   * error uses `'value'`; a link's source/target error uses `'endpoints'`.
   * `null` whenever there is no error.
   */
  readonly errorField: 'value' | 'endpoints' | null;
}

/** A node edit in progress (UC-3): which node, plus the seed field values. */
interface NodeEditDraft extends EditDraftBase {
  readonly kind: 'node';
  /** {@link SankeyNode.id} of the node under edit. */
  readonly nodeId: number;
  /** Initial name shown in the input (empty when the node had no name). */
  readonly seedName: string;
  /** Initial value shown in the input (empty when the node had no explicit value). */
  readonly seedValue: string;
}

/** A link edit in progress: identified by its position in the data. */
interface LinkEditDraft extends EditDraftBase {
  readonly kind: 'link';
  /**
   * Position of the edited link in {@link SankeyData.links}. This — not the
   * source/target pair — is the link's identity, so parallel links between the
   * same two nodes are told apart and the edit lands on the one that was opened.
   */
  readonly index: number;
  /** Original source id — seeds the source select. */
  readonly source: number;
  /** Original target id — seeds the target select. */
  readonly target: number;
  /** Initial value shown in the input. */
  readonly seedValue: string;
}

/** The element being edited in place, or `null` when no edit is open. */
type EditDraft = NodeEditDraft | LinkEditDraft;

/** A selectable node option in a link source/target listbox. */
interface NodeOption {
  readonly id: number;
  /** Display label, truncated to {@link AllomoneySankeyDiagram.maxDisplayedNodeName}. */
  readonly label: string;
  /** Unique DOM id for the `role="option"` element (aria-activedescendant target). */
  readonly optionId: string;
  /** `true` when this option is the listbox's current selection. */
  readonly selected: boolean;
}

/** Placed geometry common to both edit overlays. */
interface EditBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The node edit overlay: geometry plus its current draft/error state. */
interface NodeEditView extends EditBox {
  readonly seedName: string;
  readonly seedValue: string;
  readonly error: string | null;
  /** Which field {@link error} refers to; see {@link EditDraftBase.errorField}. */
  readonly errorField: 'value' | 'endpoints' | null;
}

/** The link edit overlay: geometry, seeds, and the source/target combobox options. */
interface LinkEditView extends EditBox {
  readonly source: number;
  readonly target: number;
  readonly seedValue: string;
  readonly error: string | null;
  /** Which field {@link error} refers to; see {@link EditDraftBase.errorField}. */
  readonly errorField: 'value' | 'endpoints' | null;
  /** Options for the source combobox popup (each flagged selected/with a DOM id). */
  readonly sourceOptions: readonly NodeOption[];
  /** Options for the target combobox popup. */
  readonly targetOptions: readonly NodeOption[];
  /**
   * The selected source node's display label (truncated to
   * {@link AllomoneySankeyDiagram.maxDisplayedNodeName}), shown on the collapsed
   * source combobox trigger.
   */
  readonly sourceLabel: string;
  /** The selected target node's display label, shown on the collapsed target trigger. */
  readonly targetLabel: string;
  /** `true` while the source combobox popup is open. */
  readonly sourceOpen: boolean;
  /** `true` while the target combobox popup is open. */
  readonly targetOpen: boolean;
  /**
   * `true` when the open popup drops upward (above its trigger) because there is
   * not enough room below it in the viewBox; `false` (the default) drops down.
   * When it is up, the overlay content is bottom-anchored so the trigger stays put.
   */
  readonly dropUp: boolean;
  /** `id` of the selected source option — the source combobox's `aria-activedescendant`. */
  readonly sourceActiveId: string;
  /** `id` of the selected target option — the target combobox's `aria-activedescendant`. */
  readonly targetActiveId: string;
}

/** One colour swatch in a legend row. */
interface LegendSwatch {
  /** The node's colour. */
  readonly color: string;
  /**
   * `true` when this swatch stands for a ghost duplicate (a node redrawn by a
   * circular link). Rendered as a dashed, fill-less outline in {@link color} to
   * match how the ghost is drawn in the diagram; the first (real) swatch is a
   * solid fill.
   */
  readonly ghost: boolean;
}

/** One node's row in the legend (UC-5). */
interface LegendEntry {
  /** {@link SankeyNode.id} — stable key for `@for` tracking. */
  readonly id: number;
  /** Display name (truncated to {@link AllomoneySankeyDiagram.maxDisplayedNodeName}), or the id. */
  readonly label: string;
  /** The full, untruncated name for the item's `title`/tooltip. */
  readonly title: string;
  /**
   * One swatch per time this node appears in the diagram: a solid swatch for the
   * node itself plus a dashed, outline swatch for each ghost duplicate created by
   * a circular link (UC-5 business rule 3), so a repeated node reads the same way
   * in the legend as on the diagram.
   */
  readonly swatches: readonly LegendSwatch[];
  /** Formatted total incoming sum ("deposit"); shown only in the full legend. */
  readonly inTotal: string;
  /** Formatted total outgoing sum ("withdrawal"); shown only in the full legend. */
  readonly outTotal: string;
}

/** The placed legend (UC-5), or `null` when it is hidden or there is no diagram. */
interface LegendView {
  readonly location: ResolvedSankeyLegend['location'];
  /** `true` when per-node in/out totals are shown (business rule 3). */
  readonly isFull: boolean;
  /** Label for the incoming total (e.g. `"Deposit"`). */
  readonly inLabel: string;
  /** Label for the outgoing total (e.g. `"Withdrawal"`). */
  readonly outLabel: string;
  /** One row per real (non-ghost) node, in diagram order. */
  readonly entries: readonly LegendEntry[];
}

/** Monotonic id source so each instance gets unique `aria` target ids. */
let uidCounter = 0;

/**
 * Zero-dependency Sankey diagram component.
 *
 * Standalone, signal-based, and OnPush. Given a {@link SankeyData} payload in
 * {@link dataSource} it validates the data, then renders a
 * native-SVG, value-proportional Sankey diagram. Empty or
 * fully-invalid data falls back to the themed placeholder,
 * and every rejected node/link is logged to the console.
 *
 * @example
 * ```html
 * <allomoney-sankey-diagram [dataSource]="flows()" [options]="{ theme: 'dark' }" />
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
    // Explicit pixel size when requested and valid; otherwise `null` removes the
    // inline style so the SCSS default (100% of the container) applies.
    '[style.width.px]': 'dimensions().width',
    '[style.height.px]': 'dimensions().height',
    // The diagram's natural (1:1) size, published to the SCSS so the canvas can
    // render at native size (and scroll) or be scaled down to fit — see the
    // scrolling modes below. `null` in the empty state.
    '[style.--allomoney-natural-w]': 'naturalSize()?.w ?? null',
    '[style.--allomoney-natural-h]': 'naturalSize()?.h ?? null',
    // Scrolling modes: by default the diagram keeps its natural size and scrolls.
    // Turning an axis off makes it scale down to fit instead (no scrollbar).
    '[class.allomoney-sankey--no-hscroll]': '!horizontalScrolling()',
    '[class.allomoney-sankey--no-vscroll]': '!verticalScrolling()',
  },
})
export class AllomoneySankeyDiagram {
  private readonly config = inject(ALLOMONEY_LIBRARY_CONFIG);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly uid = ++uidCounter;

  /** Element id for the SVG `<desc>` (accessible summary). */
  protected readonly descId = `allomoney-sankey-desc-${this.uid}`;

  /** DOM id of the source combobox's listbox popup (the trigger's `aria-controls`). */
  protected readonly sourceListId = `allomoney-sankey-src-list-${this.uid}`;
  /** DOM id of the target combobox's listbox popup (the trigger's `aria-controls`). */
  protected readonly targetListId = `allomoney-sankey-tgt-list-${this.uid}`;

  /**
   * The diagram data. When it is an Empty State or every
   * node is invalid, the themed empty state is shown instead of a diagram.
   *
   * A two-way binding `model` : editing a node in place writes an
   * immutable copy back through it, so a `[(dataSource)]` binding (or an
   * explicit `(dataSourceChange)`) keeps the consumer's data in sync.
   */
  readonly dataSource = model<SankeyData | undefined | null>(undefined);

  /**
   * Presentation options (theme, currency formatting, flow orientation) kept
   * separate from the {@link dataSource} graph. Defaults to an empty object, so
   * every field falls back to its documented default when omitted.
   */
  readonly options = input<SankeyOptions>({});

  // theme / currency / orientation can be set two ways: as a dedicated element
  // input (`[theme]="'dark'"`) or through {@link options}. When both are
  // supplied the `options` value wins; otherwise the input applies, and when
  // neither is set each falls back to its documented default. The `…Input`
  // signals hold the raw element input; the like-named `computed`s expose the
  // resolved value used everywhere else.

  /** Raw `[theme]` element input (see resolved {@link theme}). */
  readonly themeInput = input<SankeyTheme | undefined>(undefined, { alias: 'theme' });
  /** Raw `[currency]` element input (see resolved {@link currency}). */
  readonly currencyInput = input<string | null | undefined>(undefined, { alias: 'currency' });
  /** Raw `[orientation]` element input (see resolved {@link orientation}). */
  readonly orientationInput = input<SankeyOrientation | undefined>(undefined, {
    alias: 'orientation',
  });
  /** Raw `[noDataMessage]` element input (see resolved {@link noDataMessage}). */
  readonly noDataMessageInput = input<string | undefined>(undefined, {
    alias: 'noDataMessage',
  });
  /** Raw `[width]` element input in px (see resolved {@link dimensions}). */
  readonly widthInput = input<number | null | undefined>(undefined, {
    alias: 'width',
    transform: numberAttribute,
  });
  /** Raw `[height]` element input in px (see resolved {@link dimensions}). */
  readonly heightInput = input<number | null | undefined>(undefined, {
    alias: 'height',
    transform: numberAttribute,
  });
  /** Raw `[maxDisplayedNodeName]` element input (see resolved {@link maxDisplayedNodeName}). */
  readonly maxDisplayedNodeNameInput = input(17, {
    alias: 'maxDisplayedNodeName',
    transform: numberAttribute,
  });
  /** Raw `[legend]` element input (see resolved {@link legend}). */
  readonly legendInput = input<SankeyLegend | null | undefined>(undefined, { alias: 'legend' });

  /**
   * The resolved visual theme: {@link options}`.theme` when set, else the
   * `[theme]` input, else the library-wide `defaultTheme` configured via
   * `provideAlloMoneyLibrary()`. Drives the host `data-theme` attribute and the
   * generated palette.
   */
  protected readonly theme = computed<SankeyTheme>(
    () => this.options().theme ?? this.themeInput() ?? this.config.defaultTheme,
  );

  /**
   * The resolved ISO 4217 currency code (or `null` for plain numbers):
   * {@link options}`.currency` when set, else the `[currency]` input, else
   * `null`.
   */
  protected readonly currency = computed<string | null>(() => {
    // `null` is a meaningful option value here ("plain numbers"), so an explicit
    // `options.currency` — including `null` — wins; only an absent (`undefined`)
    // key falls through to the `[currency]` input, then to the `null` default.
    const opt = this.options().currency;
    return opt !== undefined ? opt : (this.currencyInput() ?? null);
  });

  /**
   * The resolved flow direction: {@link options}`.orientation` when set, else
   * the `[orientation]` input, else `'horizontal'`.
   */
  protected readonly orientation = computed<SankeyOrientation>(
    () => this.options().orientation ?? this.orientationInput() ?? 'horizontal',
  );

  /**
   * The resolved empty-state message: {@link options}`.noDataMessage` when set,
   * else the `[noDataMessage]` input, else `'No Data'`. Rendered through
   * interpolation (auto-escaped), so any markup is shown literally and cannot
   * execute — no HTML/script can be injected through it.
   */
  protected readonly noDataMessage = computed<string>(
    () => this.options().noDataMessage ?? this.noDataMessageInput() ?? 'No Data',
  );

  /**
   * The resolved maximum number of characters of a node's name to display:
   * {@link options}`.maxDisplayedNodeName` when set, else the
   * `[maxDisplayedNodeName]` input, else `17`. A longer name is shown truncated
   * to this many characters plus an ellipsis (the full name stays available to
   * assistive technology). A non-finite or non-positive value falls back to `17`.
   */
  protected readonly maxDisplayedNodeName = computed<number>(() => {
    const raw = this.options().maxDisplayedNodeName ?? this.maxDisplayedNodeNameInput();
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 17;
  });

  /**
   * The resolved legend configuration plus any validation errors (UC-5 business
   * rules 1 and 2). The {@link options}`.legend` wins field by field over the
   * `[legend]` input; an absent, `null` or `{}` legend yields the full defaults,
   * and a partial legend fills only its missing fields. See {@link resolveLegend}.
   */
  private readonly legendResolution = computed(() =>
    resolveLegend(this.legendInput(), this.options().legend),
  );

  /** The resolved legend configuration (see {@link legendResolution}). */
  protected readonly legend = computed<ResolvedSankeyLegend>(() => this.legendResolution().legend);

  /**
   * Truncates a node name to the resolved {@link maxDisplayedNodeName} for
   * display, appending an ellipsis when it was shortened. Used for both the
   * on-node label and the tooltip's source/target rows, so what the user reads is
   * consistent; the untruncated name remains available to assistive technology.
   */
  private truncateName(label: string, max: number): string {
    return label.length > max ? `${label.slice(0, max)}…` : label;
  }

  /**
   * The resolved host size in CSS pixels (or `null` per axis for the default
   * 100%-of-container size). {@link options}`.width`/`.height` win over the
   * `[width]`/`[height]` inputs; an invalid or display-distorting request is
   * discarded (its error logged) and the default size is used. See
   * {@link resolveDimensions}.
   */
  protected readonly dimensions = computed(() => {
    // `null` is a meaningful option value here ("default 100% size"), so an
    // explicit `options.width`/`.height` — including `null` — wins; only an absent
    // (`undefined`) key falls through to the `[width]`/`[height]` input.
    const opts = this.options();
    return resolveDimensions(
      opts.width !== undefined ? opts.width : this.widthInput(),
      opts.height !== undefined ? opts.height : this.heightInput(),
    );
  });

  /**
   * The diagram's natural (1:1) size as unitless user-unit numbers, published to
   * the SCSS as `--allomoney-natural-w/h`. The canvas renders at this size (and
   * scrolls) when scrolling is on, or is scaled down to fit when it is off. Kept
   * unitless so the value is valid both as an `aspect-ratio` operand and, via
   * `calc(... * 1px)`, as a pixel length. `null` in the empty state, where there
   * is no diagram to size.
   */
  protected readonly naturalSize = computed<{ readonly w: number; readonly h: number } | null>(() => {
    const view = this.layout();
    return view ? { w: view.width, h: view.height } : null;
  });

  /**
   * Whether the diagram keeps its natural width and scrolls horizontally when it
   * overflows (`true`, the default) or is scaled down to fit the container width
   * (`false`). {@link SankeyOptions.horizontalScrolling} when set, else `true`.
   */
  protected readonly horizontalScrolling = computed(
    () => this.options().horizontalScrolling ?? true,
  );

  /**
   * Whether the diagram keeps its natural height and scrolls vertically when it
   * overflows (`true`, the default) or is scaled down to fit the available
   * height (`false`). {@link SankeyOptions.verticalScrolling} when set, else
   * `true`.
   */
  protected readonly verticalScrolling = computed(
    () => this.options().verticalScrolling ?? true,
  );

  // Edit flags can be set two ways: as a dedicated element input
  // (`[canEditNodeName]="true"`) or through {@link options}. When both are
  // supplied the `options` value wins; otherwise the input value applies, and a
  // missing value defaults to `false` (read-only). The `…Input` signals hold the
  // raw element input; the like-named `computed`s expose the resolved value used
  // everywhere else.

  /** Raw `[canEditNodeName]` element input (see resolved {@link canEditNodeName}). */
  readonly canEditNodeNameInput = input(false, {
    alias: 'canEditNodeName',
    transform: booleanAttribute,
  });
  /** Raw `[canEditNodeValue]` element input (see resolved {@link canEditNodeValue}). */
  readonly canEditNodeValueInput = input(false, {
    alias: 'canEditNodeValue',
    transform: booleanAttribute,
  });
  /** Raw `[canEditLinkValue]` element input (see resolved {@link canEditLinkValue}). */
  readonly canEditLinkValueInput = input(false, {
    alias: 'canEditLinkValue',
    transform: booleanAttribute,
  });
  /** Raw `[canEditLinkSource]` element input (see resolved {@link canEditLinkSource}). */
  readonly canEditLinkSourceInput = input(false, {
    alias: 'canEditLinkSource',
    transform: booleanAttribute,
  });
  /** Raw `[canEditLinkTarget]` element input (see resolved {@link canEditLinkTarget}). */
  readonly canEditLinkTargetInput = input(false, {
    alias: 'canEditLinkTarget',
    transform: booleanAttribute,
  });
  /** Raw `[canAggregateLinks]` element input (see resolved {@link canAggregateLinks}). */
  readonly canAggregateLinksInput = input(true, {
    alias: 'canAggregateLinks',
    transform: booleanAttribute,
  });

  /**
   * When `true`, a user may edit each node's name by double-clicking it.
   * {@link options}`.canEditNodeName` when set, else the `[canEditNodeName]`
   * input; defaults to `false` (read-only).
   */
  protected readonly canEditNodeName = computed(
    () => this.options().canEditNodeName ?? this.canEditNodeNameInput(),
  );

  /**
   * When `true`, a user may edit each node's value by double-clicking it.
   * {@link options}`.canEditNodeValue` when set, else the `[canEditNodeValue]`
   * input; defaults to `false` (read-only).
   */
  protected readonly canEditNodeValue = computed(
    () => this.options().canEditNodeValue ?? this.canEditNodeValueInput(),
  );

  /** `true` when at least one node element is editable (UC-3 extension 1.a). */
  protected readonly editingEnabled = computed(
    () => this.canEditNodeName() || this.canEditNodeValue(),
  );

  /**
   * When `true`, a user may edit each link's value by double-clicking it.
   * {@link options}`.canEditLinkValue` when set, else the `[canEditLinkValue]`
   * input; defaults to `false`.
   */
  protected readonly canEditLinkValue = computed(
    () => this.options().canEditLinkValue ?? this.canEditLinkValueInput(),
  );

  /**
   * When `true`, a user may re-point each link's source to another node.
   * {@link options}`.canEditLinkSource` when set, else the `[canEditLinkSource]`
   * input; defaults to `false`.
   */
  protected readonly canEditLinkSource = computed(
    () => this.options().canEditLinkSource ?? this.canEditLinkSourceInput(),
  );

  /**
   * When `true`, a user may re-point each link's target to another node.
   * {@link options}`.canEditLinkTarget` when set, else the `[canEditLinkTarget]`
   * input; defaults to `false`.
   */
  protected readonly canEditLinkTarget = computed(
    () => this.options().canEditLinkTarget ?? this.canEditLinkTargetInput(),
  );

  /** `true` when at least one link element is editable (UC-4 extension 1.a). */
  protected readonly linkEditingEnabled = computed(
    () => this.canEditLinkValue() || this.canEditLinkSource() || this.canEditLinkTarget(),
  );

  /**
   * When `true` (the default), parallel links (same source and target) are merged
   * into one summed ribbon. {@link options}`.canAggregateLinks` when set, else the
   * `[canAggregateLinks]` input, else `true`.
   */
  protected readonly canAggregateLinks = computed(
    () => this.options().canAggregateLinks ?? this.canAggregateLinksInput(),
  );

  private readonly validation = computed(() => validateSankeyData(this.dataSource()));

  /** `true` when the placeholder must be shown (empty or all-invalid). */
  readonly isEmpty = computed(() => this.validation().isEmptyState);

  /**
   * The computed render geometry, or `null` while the empty state is shown.
   * Orientation defaults to `'horizontal'`.
   */
  protected readonly layout = computed<SankeyLayout | null>(() => {
    const validation = this.validation();
    if (validation.isEmptyState) return null;
    return computeSankeyLayout(
      validation.nodes,
      validation.links,
      this.theme(),
      this.orientation(),
      this.currency(),
      this.canAggregateLinks(),
      // Vertical orientation widens the gap between nodes so names up to this
      // length fit above them without overlapping (see computeSankeyLayout).
      { ...DEFAULT_LAYOUT_OPTIONS, maxDisplayedNodeName: this.maxDisplayedNodeName() },
    );
  });

  /**
   * The element the pointer is currently over, or `null`. Seeds the UC-2 chain
   * trace; its flow thread (ancestors + descendants) stays lit, the rest dims.
   */
  private readonly hovered = signal<ChainSeed | null>(null);

  /**
   * The element the user has selected by clicking it, or `null`. A selected node
   * or link draws an edge in an intensified shade of its own color.
   */
  private readonly selected = signal<Selection | null>(null);

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
    const sel = this.selected();
    const max = this.maxDisplayedNodeName();
    return view.nodes.map((node) => {
      // A ghost shares its real twin's chain membership, so it lights and dims in
      // lockstep with the node it duplicates rather than looking orphaned.
      const chainId = node.ghost && node.ghostOf != null ? node.ghostOf : node.id;
      return {
        ...node,
        dimmed: chain !== null && !chain.nodeIds.has(chainId),
        selected: sel?.kind === 'node' && sel.id === node.id,
        editLabel: node.valueLabel
          ? `Edit node ${node.label}, value ${node.valueLabel}`
          : `Edit node ${node.label}`,
        // Truncate the visible name past the limit; the full name stays in the
        // a11y editLabel and the visually-hidden flow list.
        displayLabel: this.truncateName(node.label, max),
      };
    });
  });

  /**
   * Ghost node id → the real node id it duplicates. A ghost is a synthetic,
   * non-editable phantom created to break a cycle; it exists only in the layout,
   * so hover and selection alias it to its real twin (or ignore it).
   */
  private readonly ghostAliasById = computed<ReadonlyMap<number, number>>(() => {
    const view = this.layout();
    const map = new Map<number, number>();
    if (view) {
      for (const node of view.nodes) {
        if (node.ghost && node.ghostOf != null) map.set(node.id, node.ghostOf);
      }
    }
    return map;
  });

  /** Links decorated with their current dim state (see {@link renderNodes}). */
  protected readonly renderLinks = computed<readonly RenderLink[]>(() => {
    const view = this.layout();
    if (!view) return [];
    const chain = this.activeChain();
    const sel = this.selected();
    return view.links.map((link) => ({
      ...link,
      dimmed: chain !== null && !chain.linkIds.has(link.id),
      selected: sel?.kind === 'link' && sel.id === link.id,
      editLabel: `Edit flow ${link.a11yLabel}`,
    }));
  });

  /** One-line accessible summary of the flows for the SVG `<desc>`. */
  protected readonly summary = computed(() => {
    const layout = this.layout();
    if (!layout) return '';
    // Ghost nodes are phantom cycle duplicates, not real nodes — exclude them so
    // the accessible summary reflects the actual graph.
    const nodeCount = layout.nodes.filter((n) => !n.ghost).length;
    const linkCount = layout.links.length;
    return `Sankey diagram with ${nodeCount} ${nodeCount === 1 ? 'node' : 'nodes'} and ${linkCount} ${linkCount === 1 ? 'flow' : 'flows'}.`;
  });

  /**
   * The legend view-model, or `null` when the legend is hidden
   * ({@link legend}`.visibility` is `false`) or there is no diagram to describe —
   * the empty state shows the placeholder only (UC-5 initial condition: "at least
   * one node"). One row per real node in diagram order; a node duplicated by a
   * circular link contributes one swatch per appearance (business rule 3), and the
   * full legend adds each node's total incoming/outgoing sums.
   */
  protected readonly legendView = computed<LegendView | null>(() => {
    const legend = this.legend();
    if (!legend.visibility) return null;
    const view = this.layout();
    if (!view) return null;

    const format = makeValueFormatter(this.currency());
    const max = this.maxDisplayedNodeName();

    // In/out totals come from the validated consumer links (real source/target),
    // so a returning flow counts toward its real node rather than its ghost.
    const inflow = new Map<number, number>();
    const outflow = new Map<number, number>();
    for (const link of this.validation().links) {
      inflow.set(link.target, (inflow.get(link.target) ?? 0) + link.value);
      outflow.set(link.source, (outflow.get(link.source) ?? 0) + link.value);
    }

    // How many times each real node is drawn: once for itself plus one per ghost
    // duplicate (a circular link redraws the node forward as a ghost).
    const appearances = new Map<number, number>();
    for (const node of view.nodes) {
      if (node.ghost && node.ghostOf != null) {
        appearances.set(node.ghostOf, (appearances.get(node.ghostOf) ?? 0) + 1);
      }
    }

    const entries: LegendEntry[] = view.nodes
      .filter((node) => !node.ghost)
      .map((node) => {
        const ghosts = appearances.get(node.id) ?? 0;
        // Real node first (solid), then one dashed outline swatch per ghost copy.
        const swatches: LegendSwatch[] = [
          { color: node.color, ghost: false },
          ...Array.from({ length: ghosts }, () => ({ color: node.color, ghost: true })),
        ];
        return {
          id: node.id,
          label: this.truncateName(node.label, max),
          title: node.label,
          swatches,
          inTotal: format(inflow.get(node.id) ?? 0),
          outTotal: format(outflow.get(node.id) ?? 0),
        };
      });

    return {
      location: legend.location,
      isFull: legend.isFullLegendShown,
      inLabel: legend.inLabel,
      outLabel: legend.outLabel,
      entries,
    };
  });

  /**
   * Highlights the chain of the hovered node (UC-2 main scenario, steps 1–2):
   * every element outside its flow thread becomes half-transparent. Also seeds
   * the custom tooltip's position from the pointer.
   */
  protected onHoverNode(id: number, event: PointerEvent): void {
    // Hovering a ghost highlights the chain of the real node it duplicates.
    const seedId = this.ghostAliasById().get(id) ?? id;
    this.hovered.set({ kind: 'node', id: seedId });
    this.updateTooltipPos(event);
  }

  /** Highlights the chain of the hovered link ribbon or its value label. */
  protected onHoverLink(link: LayoutLink, event: PointerEvent): void {
    this.hovered.set({
      kind: 'link',
      id: link.id,
      source: link.source,
      target: link.target,
    });
    this.updateTooltipPos(event);
  }

  /** Follows the pointer so the tooltip tracks it while over the diagram. */
  protected onTooltipMove(event: PointerEvent): void {
    if (this.hovered()) this.updateTooltipPos(event);
  }

  /**
   * Clears the highlight when the pointer leaves an element (UC-2 steps 3–4):
   * the translucency added on hover is removed and the tooltip is hidden.
   */
  protected onLeave(): void {
    this.hovered.set(null);
    this.tooltipPos.set(null);
  }

  // --- selection (click to select, click again or click empty to clear) ----

  /**
   * Toggles selection of a node; no-op when the node cannot be changed (every
   * `canEditNode*` is false). Always stops the click from clearing the selection
   * via the canvas, so clicking a non-selectable node leaves any selection intact.
   */
  protected toggleSelectNode(id: number, event: MouseEvent): void {
    event.stopPropagation();
    if (this.ghostAliasById().has(id)) return; // ghosts are inert phantoms
    if (!this.editingEnabled()) return;
    const cur = this.selected();
    this.selected.set(cur?.kind === 'node' && cur.id === id ? null : { kind: 'node', id });
  }

  /**
   * Toggles selection of a link; no-op when the link cannot be changed (every
   * `canEditLink*` is false). Always stops the click from clearing the selection
   * via the canvas, so clicking a non-selectable link leaves any selection intact.
   */
  protected toggleSelectLink(link: LayoutLink, event: MouseEvent): void {
    event.stopPropagation();
    if (!this.linkEditingEnabled()) return;
    const cur = this.selected();
    this.selected.set(cur?.kind === 'link' && cur.id === link.id ? null : { kind: 'link', id: link.id });
  }

  /** Clears the selection (clicking empty canvas). */
  protected clearSelection(): void {
    this.selected.set(null);
  }

  /**
   * Keeps selection and keyboard focus in sync so only one element is ever
   * highlighted at a time. Moving focus onto an element other than the current
   * selection — e.g. tabbing to a node after selecting a link — clears that
   * stale selection, so its coloured edge no longer lingers alongside the newly
   * focused element's focus ring. A click that selects the just-focused element
   * still runs afterwards (focus fires before click), so click-to-select is
   * unaffected; focusing the already-selected element leaves it selected.
   */
  protected onFocusNode(id: number): void {
    const cur = this.selected();
    if (cur && !(cur.kind === 'node' && cur.id === id)) this.selected.set(null);
  }

  /** Clears a selection on a different element when a link ribbon gains focus (see {@link onFocusNode}). */
  protected onFocusLink(id: string): void {
    const cur = this.selected();
    if (cur && !(cur.kind === 'link' && cur.id === id)) this.selected.set(null);
  }

  // --- custom hover tooltip ------------------------------------------------

  /** Pointer position (host-relative px) + edge-flip flags, or `null` when idle. */
  private readonly tooltipPos = signal<Omit<TooltipView, 'rows'> | null>(null);

  /**
   * Node id → display label (truncated to {@link maxDisplayedNodeName}), used for
   * the tooltip's source/target rows so they match the on-node labels. Rebuilt
   * when the layout or the display limit changes.
   */
  private readonly nodeLabelById = computed(() => {
    const view = this.layout();
    const max = this.maxDisplayedNodeName();
    return new Map(view ? view.nodes.map((n) => [n.id, this.truncateName(n.label, max)]) : []);
  });

  /**
   * The placed custom tooltip, or `null` when nothing is hovered (or the
   * hovered node has no value, not even a calculated one). A node shows only
   * its value; a link shows source, target, and value on separate rows.
   */
  protected readonly tooltipView = computed<TooltipView | null>(() => {
    const seed = this.hovered();
    const pos = this.tooltipPos();
    const view = this.layout();
    if (!seed || !pos || !view) return null;

    let rows: readonly TooltipRow[];
    if (seed.kind === 'node') {
      const node = view.nodes.find((n) => n.id === seed.id);
      // No value — not even a calculated one (no explicit value, no connected
      // flow) — means nothing to show, so suppress the tooltip entirely.
      if (!node || node.total === '') return null;
      rows = [{ label: null, value: node.total }];
    } else {
      const link = view.links.find((l) => l.id === seed.id);
      if (!link) return null;
      const labels = this.nodeLabelById();
      rows = [
        { label: 'Source', value: labels.get(link.source) ?? String(link.source) },
        { label: 'Target', value: labels.get(link.target) ?? String(link.target) },
        { label: 'Value', value: link.valueLabel },
      ];
    }
    return { ...pos, rows };
  });

  /** Records the pointer position relative to the host, with edge-flip flags. */
  private updateTooltipPos(event: PointerEvent): void {
    const rect = this.host.nativeElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    this.tooltipPos.set({ x, y, flipX: x > rect.width / 2, flipY: y > rect.height / 2 });
  }

  // --- edit a node (UC-3) or a link (UC-4) in place ----------------------

  /** The element currently being edited, or `null` when no edit is open. */
  private readonly editState = signal<EditDraft | null>(null);

  /**
   * Which source/target combobox popup is open in the link overlay, or `null`
   * when both are collapsed. Only one is ever open at a time, so the overlay can
   * reserve just enough extra height for a single open popup (see {@link linkEditView}).
   */
  private readonly openCombo = signal<'source' | 'target' | null>(null);

  /** Live control handles, read at commit time (uncontrolled inputs). */
  private readonly nameInputRef = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  private readonly valueInputRef = viewChild<ElementRef<HTMLInputElement>>('valueInput');
  private readonly linkValueInputRef = viewChild<ElementRef<HTMLInputElement>>('linkValueInput');
  /** The source/target combobox triggers (focused when the overlay opens). */
  private readonly sourceComboRef = viewChild<ElementRef<HTMLElement>>('sourceCombo');
  private readonly targetComboRef = viewChild<ElementRef<HTMLElement>>('targetCombo');
  /** The source/target listbox popups — present only while the matching combobox is open. */
  private readonly sourceListboxRef = viewChild<ElementRef<HTMLElement>>('sourceListbox');
  private readonly targetListboxRef = viewChild<ElementRef<HTMLElement>>('targetListbox');

  /**
   * A stable key for the open edit — changes only when a different element is
   * opened (not on every keystroke/error), so the auto-focus effect fires once.
   */
  private readonly editKey = computed(() => {
    const edit = this.editState();
    if (!edit) return null;
    return edit.kind === 'node' ? `n${edit.nodeId}` : `l${edit.index}`;
  });

  /**
   * The placed node edit overlay (UC-3), or `null` unless a node edit is open.
   * Centered over the edited node and clamped inside the viewBox.
   */
  protected readonly nodeEditView = computed<NodeEditView | null>(() => {
    const edit = this.editState();
    const view = this.layout();
    if (!edit || edit.kind !== 'node' || !view) return null;
    const node = view.nodes.find((n) => n.id === edit.nodeId);
    if (!node) return null;

    const rows = (this.canEditNodeName() ? 1 : 0) + (this.canEditNodeValue() ? 1 : 0);
    const height = 78 + rows * 56 + (edit.error ? 30 : 0);
    const box = this.placeBox(node.x + node.width / 2, node.y + node.height / 2, 220, height, view);
    return {
      ...box,
      seedName: edit.seedName,
      seedValue: edit.seedValue,
      error: edit.error,
      errorField: edit.errorField,
    };
  });

  /**
   * The placed link edit overlay (UC-4), or `null` unless a link edit is open.
   * Centered on the edited link's value label and clamped inside the viewBox.
   */
  protected readonly linkEditView = computed<LinkEditView | null>(() => {
    const edit = this.editState();
    const view = this.layout();
    if (!edit || edit.kind !== 'link' || !view) return null;
    const link = view.links.find((l) => l.sourceIndex === edit.index);
    if (!link) return null;

    // Ghost nodes are phantom cycle duplicates, not real endpoints — a link may
    // never be pointed at one, so keep them out of the source/target options. The
    // option labels honour maxDisplayedNodeName so they match the on-diagram names.
    const max = this.maxDisplayedNodeName();
    const base = view.nodes
      .filter((n) => !n.ghost)
      .map((n) => ({ id: n.id, label: this.truncateName(n.label, max) }));
    // Per-list options carry a unique DOM id (namespaced by instance + side, since
    // the same node appears in both listboxes) and a selected flag.
    const sourceOptions: NodeOption[] = base.map((o) => ({
      ...o,
      optionId: `allomoney-sankey-src-${this.uid}-${o.id}`,
      selected: o.id === edit.source,
    }));
    const targetOptions: NodeOption[] = base.map((o) => ({
      ...o,
      optionId: `allomoney-sankey-tgt-${this.uid}-${o.id}`,
      selected: o.id === edit.target,
    }));

    // Size the collapsed overlay from what it actually shows. Each combobox is a
    // single label+trigger row (like the value field).
    const open = this.openCombo();
    const fieldH = 56; // label + single control row
    const valueH = this.canEditLinkValue() ? fieldH : 0;
    const sourceH = this.canEditLinkSource() ? fieldH : 0;
    const targetH = this.canEditLinkTarget() ? fieldH : 0;
    const baseHeight = 78 + valueH + sourceH + targetH + (edit.error ? 30 : 0);

    // Collapsed placement: centered on the link's value label, clamped in the
    // viewBox. This stays fixed when a combobox opens, so the overlay never jumps.
    const baseBox = this.placeBox(link.labelX, link.labelY, 240, baseHeight, view);

    // When a combobox is open, grow the <foreignObject> just enough (and in the
    // right direction) that its popup isn't clipped — downward by default, upward
    // only when there isn't room below the trigger.
    const placed = open ? this.placeComboPopup(open, baseBox, baseHeight, view) : null;

    const selectedLabel = (opts: readonly NodeOption[], id: number): string =>
      opts.find((o) => o.id === id)?.label ?? String(id);
    return {
      ...(placed?.box ?? baseBox),
      source: edit.source,
      target: edit.target,
      seedValue: edit.seedValue,
      error: edit.error,
      errorField: edit.errorField,
      sourceOptions,
      targetOptions,
      sourceLabel: selectedLabel(sourceOptions, edit.source),
      targetLabel: selectedLabel(targetOptions, edit.target),
      sourceOpen: open === 'source',
      targetOpen: open === 'target',
      dropUp: placed?.dropUp ?? false,
      sourceActiveId: `allomoney-sankey-src-${this.uid}-${edit.source}`,
      targetActiveId: `allomoney-sankey-tgt-${this.uid}-${edit.target}`,
    };
  });

  /**
   * Places the open combobox's listbox popup. The popup opens below its trigger
   * (overlaying the fields beneath it) and the overlay grows downward just enough
   * to hold it. It flips above the trigger only when there isn't room below it in
   * the viewBox — and then the box grows upward instead, keeping its bottom edge
   * fixed so the trigger (and the rest of the overlay) stay exactly where they are.
   */
  private placeComboPopup(
    which: 'source' | 'target',
    base: EditBox,
    baseHeight: number,
    view: SankeyLayout,
  ): { readonly box: EditBox; readonly dropUp: boolean } {
    // Popup reserve (capped list + border + gap) and the overlay metrics used to
    // locate the open trigger within the content — must track the SCSS.
    const POPUP_H = 126;
    const PAD_TOP = 10;
    const FIELD_BLOCK = 46; // label + gap + control
    const FIELD_GAP = 8;
    const INPUT_H = 28;

    // Fields render in order (source, target, value), so a field before the open
    // trigger shifts it down by one block.
    const before = which === 'target' && this.canEditLinkSource() ? FIELD_BLOCK + FIELD_GAP : 0;
    const triggerTop = base.y + PAD_TOP + before;
    const triggerBottom = triggerTop + INPUT_H;
    const roomBelow = view.height - triggerBottom;
    const roomAbove = triggerTop;

    if (!(roomBelow < POPUP_H && roomAbove > roomBelow)) {
      // Drop down: ensure the box extends POPUP_H below the trigger. Content is
      // top-anchored, so the extra height is added at the bottom and the trigger
      // does not move.
      const height = Math.max(baseHeight, PAD_TOP + before + INPUT_H + POPUP_H);
      const y = Math.min(base.y, Math.max(0, view.height - height));
      return { box: { x: base.x, y, width: base.width, height }, dropUp: false };
    }

    // Drop up: keep the box bottom fixed and extend the top so there is POPUP_H
    // above the trigger. Content is bottom-anchored (see SCSS), so the trigger
    // stays put and the extra height opens above it.
    const bottom = base.y + baseHeight;
    const y = Math.max(0, Math.min(base.y, triggerTop - POPUP_H));
    return { box: { x: base.x, y, width: base.width, height: bottom - y }, dropUp: true };
  }

  /** Centers a `width`×`height` overlay on (cx, cy), clamped inside the viewBox. */
  private placeBox(
    cx: number,
    cy: number,
    width: number,
    height: number,
    view: SankeyLayout,
  ): EditBox {
    const x = Math.max(0, Math.min(cx - width / 2, view.width - width));
    const y = Math.max(0, Math.min(cy - height / 2, view.height - height));
    return { x, y, width, height };
  }

  /**
   * Opens the node edit overlay (UC-3 trigger: double-click). No-op when neither
   * node element is editable (extension 1.a). Seeds the inputs from the raw
   * consumer data — not the derived/formatted labels — so a cleared field means
   * "unset" rather than the id fallback or a summed value.
   */
  protected startEdit(nodeId: number): void {
    if (!this.editingEnabled()) return;
    if (this.ghostAliasById().has(nodeId)) return; // ghosts cannot be edited
    const node = this.dataSource()?.nodes.find((n) => n?.id === nodeId);
    this.openCombo.set(null);
    this.editState.set({
      kind: 'node',
      nodeId,
      seedName: node && typeof node.name === 'string' ? node.name : '',
      seedValue: node && node.value != null ? String(node.value) : '',
      error: null,
      errorField: null,
    });
  }

  /**
   * Opens the link edit overlay (UC-4 trigger: double-click). No-op when no link
   * element is editable (extension 1.a). Identified by the link's current
   * source/target so the right entry is rewritten on commit.
   */
  protected startLinkEdit(link: LayoutLink): void {
    if (!this.linkEditingEnabled()) return;
    // An aggregated ribbon stands in for several parallel links between the same
    // two nodes: it has no single value to write back, and editing its source or
    // target would silently rewrite every combined link at once. Rather than open
    // a partial, ambiguous edit, a combined ribbon is not editable in place.
    if (link.aggregated) {
      console.warn(
        `[allomoney-sankey-diagram] Cannot edit an aggregated flow (${link.a11yLabel}): it is the combined total of several links between the same nodes. Turn off link aggregation (canAggregateLinks) to edit the individual links.`,
      );
      return;
    }
    if (!this.canEditLinkValue() && !this.canEditLinkSource() && !this.canEditLinkTarget()) return;
    this.openCombo.set(null);
    this.editState.set({
      kind: 'link',
      index: link.sourceIndex,
      source: link.source,
      target: link.target,
      seedValue: String(link.value),
      error: null,
      errorField: null,
    });
  }

  /** Selects a node as the open link edit's source (combobox option pick/keyboard). */
  protected setEditSource(id: number): void {
    const edit = this.editState();
    if (!edit || edit.kind !== 'link') return;
    this.editState.set({ ...edit, source: id, error: null, errorField: null });
  }

  /** Selects a node as the open link edit's target (combobox option pick/keyboard). */
  protected setEditTarget(id: number): void {
    const edit = this.editState();
    if (!edit || edit.kind !== 'link') return;
    this.editState.set({ ...edit, target: id, error: null, errorField: null });
  }

  /** Toggles a source/target combobox popup open/closed (trigger click). */
  protected toggleCombo(which: 'source' | 'target'): void {
    this.openCombo.set(this.openCombo() === which ? null : which);
  }

  /** Closes the given combobox popup if it is the one currently open. */
  private closeCombo(which: 'source' | 'target'): void {
    if (this.openCombo() === which) this.openCombo.set(null);
  }

  /** Picks an option from the source popup: select it, close, and refocus the trigger. */
  protected chooseSource(id: number): void {
    this.setEditSource(id);
    this.closeCombo('source');
    this.sourceComboRef()?.nativeElement.focus();
  }

  /** Picks an option from the target popup: select it, close, and refocus the trigger. */
  protected chooseTarget(id: number): void {
    this.setEditTarget(id);
    this.closeCombo('target');
    this.targetComboRef()?.nativeElement.focus();
  }

  /** Closes a combobox popup when focus leaves its trigger+popup wrapper. */
  protected onComboFocusOut(event: FocusEvent, which: 'source' | 'target'): void {
    const wrap = event.currentTarget as HTMLElement;
    const next = event.relatedTarget as Node | null;
    if (next && wrap.contains(next)) return;
    this.closeCombo(which);
  }

  /**
   * Keyboard control for a source/target combobox (ARIA select-only combobox).
   * When collapsed: arrow keys open the popup, Space/Enter also open (Enter stays
   * free to commit the whole edit when it does nothing here), and Escape bubbles
   * to cancel. When open: arrows/Home/End move the selection, Enter/Space/Tab
   * confirm and close, and Escape closes just the popup.
   */
  protected onComboKeydown(event: KeyboardEvent, which: 'source' | 'target'): void {
    const open = this.openCombo() === which;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'Home':
      case 'End':
        event.preventDefault();
        if (!open) this.openCombo.set(which);
        else this.moveComboSelection(event, which);
        break;
      case ' ':
        event.preventDefault();
        if (open) {
          event.stopPropagation();
          this.closeCombo(which);
        } else {
          this.openCombo.set(which);
        }
        break;
      case 'Enter':
        // Open: confirm the active option and close. Collapsed: let it bubble so
        // Enter commits the edit (Save), consistent with the rest of the dialog.
        if (open) {
          event.preventDefault();
          event.stopPropagation();
          this.closeCombo(which);
        }
        break;
      case 'Escape':
        // Open: close just the popup. Collapsed: let it bubble to cancel the edit.
        if (open) {
          event.preventDefault();
          event.stopPropagation();
          this.closeCombo(which);
        }
        break;
      default:
        break;
    }
  }

  /**
   * Moves the selection within an open combobox popup with the arrow and Home/End
   * keys (single-select: selection follows the active option), and scrolls the
   * newly active option into view.
   */
  private moveComboSelection(event: KeyboardEvent, which: 'source' | 'target'): void {
    const edit = this.editState();
    const view = this.linkEditView();
    if (!edit || edit.kind !== 'link' || !view) return;
    const options = which === 'source' ? view.sourceOptions : view.targetOptions;
    if (options.length === 0) return;

    const currentId = which === 'source' ? edit.source : edit.target;
    const current = Math.max(0, options.findIndex((o) => o.id === currentId));
    let next = current;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        next = Math.min(options.length - 1, current + 1);
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        next = Math.max(0, current - 1);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = options.length - 1;
        break;
      default:
        return;
    }
    const option = options[next];
    if (which === 'source') this.setEditSource(option.id);
    else this.setEditTarget(option.id);

    const listbox = (which === 'source' ? this.sourceListboxRef() : this.targetListboxRef())?.nativeElement;
    listbox?.querySelector(`[id="${option.optionId}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  /** Whether the value field is editable for the open link edit (`canEditLinkValue`). */
  protected readonly linkValueEditable = computed(() => {
    const edit = this.editState();
    if (!edit || edit.kind !== 'link') return false;
    return this.canEditLinkValue();
  });

  /** Closes any open edit overlay and collapses its comboboxes. */
  private closeEdit(): void {
    this.openCombo.set(null);
    this.editState.set(null);
  }

  /**
   * Dispatches ENTER / Save to the matching commit (UC-3/UC-4 step 3). The
   * overlay closes only on a successful commit (Save) or on Cancel/Esc — never
   * on focus loss, so switching browser tabs or windows leaves the edit open.
   */
  protected commitEdit(): void {
    const edit = this.editState();
    if (!edit) return;
    if (edit.kind === 'node') this.commitNodeEdit(edit);
    else this.commitLinkEdit(edit);
  }

  /**
   * Validates a node edit (UC-3 step 3, business rule 2) and, when valid, writes
   * an immutable copy back through {@link dataSource} and closes (step 3.1). On
   * failure it keeps the overlay open with the error (extension 3.a). Only fields
   * the user is permitted to edit are touched.
   */
  private commitNodeEdit(edit: NodeEditDraft): void {
    const data = this.dataSource();
    if (!data) {
      this.closeEdit();
      return;
    }

    // Business rule 2: value must be a positive number, or null/undefined.
    let nextValue: number | null = null;
    if (this.canEditNodeValue()) {
      const raw = (this.valueInputRef()?.nativeElement.value ?? '').trim();
      if (raw.length > 0) {
        const parsed = Number(raw);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          this.editState.set({ ...edit, error: 'Value must be a positive number or empty.', errorField: 'value' });
          return;
        }
        nextValue = parsed;
      }
    }

    // Business rule 2: name must be a string (or null/undefined). An <input>
    // only yields a string, so an empty field becomes null ("unset").
    let nextName: string | null = null;
    if (this.canEditNodeName()) {
      const raw = (this.nameInputRef()?.nativeElement.value ?? '').trim();
      nextName = raw.length > 0 ? raw : null;
    }

    const nodes = data.nodes.map((node) => {
      if (!node || node.id !== edit.nodeId) return node;
      return {
        ...node,
        ...(this.canEditNodeName() ? { name: nextName } : {}),
        ...(this.canEditNodeValue() ? { value: nextValue } : {}),
      };
    });

    this.dataSource.set({ ...data, nodes });
    this.closeEdit();
  }

  /**
   * Validates a link edit (UC-4 step 3, business rule 2) and, when valid, writes
   * an immutable copy back through {@link dataSource} and closes (step 3.1). On
   * failure it keeps the overlay open with the error (extension 3.a). Only fields
   * the user is permitted to edit are touched; the rest keep their prior value.
   */
  private commitLinkEdit(edit: LinkEditDraft): void {
    const data = this.dataSource();
    if (!data) {
      this.closeEdit();
      return;
    }

    const editValue = this.canEditLinkValue();

    // A plain (non-aggregated) link is the only kind that can be opened, so the
    // edit affects exactly the entry that was opened (by its position in the data).
    const targets = new Set([edit.index]);

    // Business rule 2: a link's value may be a positive number or empty. A link
    // needs a positive value to be drawn (see validateSankeyData), so emptying the
    // field clears the flow — the link is removed rather than written un-drawable.
    const rawValue = editValue ? (this.linkValueInputRef()?.nativeElement.value ?? '').trim() : '';
    if (editValue && rawValue.length === 0) {
      this.dataSource.set({ ...data, links: data.links.filter((_, i) => !targets.has(i)) });
      this.closeEdit();
      return;
    }

    const nodeIds = new Set(this.layout()?.nodes.filter((n) => !n.ghost).map((n) => n.id));

    // The listboxes keep `edit.source`/`edit.target` current as the user picks, so
    // read the draft directly. The listboxes only offer existing node ids, but
    // re-validate defensively below.
    const nextSource = edit.source;
    const nextTarget = edit.target;

    // Business rule 2: source and target must be existing, distinct nodes.
    if (!nodeIds.has(nextSource) || !nodeIds.has(nextTarget)) {
      this.editState.set({ ...edit, error: 'Source and target must be existing nodes.', errorField: 'endpoints' });
      return;
    }
    if (nextSource === nextTarget) {
      this.editState.set({ ...edit, error: 'Source and target must be different.', errorField: 'endpoints' });
      return;
    }

    // A non-empty value must parse to a positive number.
    let nextValue = NaN;
    if (editValue) {
      nextValue = Number(rawValue);
      if (!Number.isFinite(nextValue) || nextValue <= 0) {
        this.editState.set({ ...edit, error: 'Value must be a positive number or empty.', errorField: 'value' });
        return;
      }
    }

    const links = data.links.map((link, i) => {
      if (!link || !targets.has(i)) return link;
      return {
        ...link,
        ...(this.canEditLinkSource() ? { source: nextSource } : {}),
        ...(this.canEditLinkTarget() ? { target: nextTarget } : {}),
        ...(editValue ? { value: nextValue } : {}),
      };
    });

    this.dataSource.set({ ...data, links });
    this.closeEdit();
  }

  /** Discards the edit and closes the overlay (UC-3/UC-4 extension 3.a.1.a: Esc/Cancel). */
  protected cancelEdit(): void {
    this.closeEdit();
  }

  constructor() {
    // Minimal guarantee: log every rejected node/link so consumers can debug
    // invalid data (main-scenario extension 1.1.b.2). Runs on each change.
    effect(() => {
      for (const message of this.validation().errors) {
        console.error(`[allomoney-sankey-diagram] ${message}`);
      }
    });

    // Log any rejected width/height so consumers see why an invalid or
    // display-distorting size fell back to the default (100% of the container).
    effect(() => {
      for (const message of this.dimensions().errors) {
        console.error(`[allomoney-sankey-diagram] ${message}`);
      }
    });

    // Log any rejected legend field so consumers see why it fell back to its
    // default (UC-5 business rule 2 / minimal guarantee).
    effect(() => {
      for (const message of this.legendResolution().errors) {
        console.error(`[allomoney-sankey-diagram] ${message}`);
      }
    });

    // Move keyboard focus into the overlay when an edit opens, so keyboard users
    // land in the first editable control (UC-3/UC-4 accessibility). The overlay —
    // and its view-child controls — are created by an `@if` and only exist after
    // the next render, so the focus is deferred to the post-render phase via
    // `afterNextRender`; a microtask could run before the `@if` materializes the
    // inputs, leaving every ref `undefined` and the focus never landing.
    effect(() => {
      if (this.editKey() === null) return;
      afterNextRender(
        () => {
          const el =
            this.nameInputRef()?.nativeElement ??
            this.valueInputRef()?.nativeElement ??
            this.sourceComboRef()?.nativeElement ??
            this.targetComboRef()?.nativeElement ??
            this.linkValueInputRef()?.nativeElement;
          el?.focus();
          if (el instanceof HTMLInputElement) el.select();
        },
        { injector: this.injector },
      );
    });
  }
}
