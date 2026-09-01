import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  model,
  numberAttribute,
  signal,
  viewChild,
} from '@angular/core';
import { ALLOMONEY_LIBRARY_CONFIG } from '../config/allomoney-library-config';
import type {
  SankeyData,
  SankeyOptions,
  SankeyOrientation,
  SankeyTheme,
} from './models/sankey-data';
import {
  computeSankeyLayout,
  type LayoutLink,
  type LayoutNode,
  type SankeyLayout,
} from './internal/sankey-layout';
import { collectChain, type Chain, type ChainSeed } from './internal/sankey-chain';
import { validateSankeyData } from './internal/validate-sankey-data';
import { resolveDimensions } from './internal/validate-dimensions';

/** A node paired with its current hover-dim state. */
interface RenderNode extends LayoutNode {
  /** `true` when a chain is hovered and this node is outside it. */
  readonly dimmed: boolean;
  /** `true` when this node is the current selection (intensified edge). */
  readonly selected: boolean;
  /** Accessible name for the node's editable `button`, precomputed. */
  readonly editLabel: string;
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

/** A link edit in progress: identified by its original source/target. */
interface LinkEditDraft extends EditDraftBase {
  readonly kind: 'link';
  /** Original source id — identifies the edited link and seeds the source select. */
  readonly source: number;
  /** Original target id — identifies the edited link and seeds the target select. */
  readonly target: number;
  /** Initial value shown in the input. */
  readonly seedValue: string;
}

/** The element being edited in place, or `null` when no edit is open. */
type EditDraft = NodeEditDraft | LinkEditDraft;

/** A selectable node for the link source/target dropdowns. */
interface NodeOption {
  readonly id: number;
  readonly label: string;
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
}

/** The link edit overlay: geometry, seeds, and the selectable nodes. */
interface LinkEditView extends EditBox {
  readonly source: number;
  readonly target: number;
  readonly seedValue: string;
  readonly error: string | null;
  readonly nodes: readonly NodeOption[];
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
  },
})
export class AllomoneySankeyDiagram {
  private readonly config = inject(ALLOMONEY_LIBRARY_CONFIG);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly uid = ++uidCounter;

  /** Element id for the SVG `<desc>` (accessible summary). */
  protected readonly descId = `allomoney-sankey-desc-${this.uid}`;

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
  protected readonly currency = computed<string | null>(
    () => this.options().currency ?? this.currencyInput() ?? null,
  );

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
   * The resolved host size in CSS pixels (or `null` per axis for the default
   * 100%-of-container size). {@link options}`.width`/`.height` win over the
   * `[width]`/`[height]` inputs; an invalid or display-distorting request is
   * discarded (its error logged) and the default size is used. See
   * {@link resolveDimensions}.
   */
  protected readonly dimensions = computed(() =>
    resolveDimensions(
      this.options().width ?? this.widthInput(),
      this.options().height ?? this.heightInput(),
    ),
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
    return view.nodes.map((node) => ({
      ...node,
      dimmed: chain !== null && !chain.nodeIds.has(node.id),
      selected: sel?.kind === 'node' && sel.id === node.id,
      editLabel: node.valueLabel
        ? `Edit node ${node.label}, value ${node.valueLabel}`
        : `Edit node ${node.label}`,
    }));
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
    const nodeCount = layout.nodes.length;
    const linkCount = layout.links.length;
    return `Sankey diagram with ${nodeCount} ${nodeCount === 1 ? 'node' : 'nodes'} and ${linkCount} ${linkCount === 1 ? 'flow' : 'flows'}.`;
  });

  /**
   * Highlights the chain of the hovered node (UC-2 main scenario, steps 1–2):
   * every element outside its flow thread becomes half-transparent. Also seeds
   * the custom tooltip's position from the pointer.
   */
  protected onHoverNode(id: number, event: PointerEvent): void {
    this.hovered.set({ kind: 'node', id });
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

  // --- custom hover tooltip ------------------------------------------------

  /** Pointer position (host-relative px) + edge-flip flags, or `null` when idle. */
  private readonly tooltipPos = signal<Omit<TooltipView, 'rows'> | null>(null);

  /** Node id → display label, rebuilt only when the layout changes. */
  private readonly nodeLabelById = computed(() => {
    const view = this.layout();
    return new Map(view ? view.nodes.map((n) => [n.id, n.label]) : []);
  });

  /**
   * The placed custom tooltip, or `null` when nothing is hovered. A node shows
   * only its value; a link shows source, target, and value on separate rows.
   */
  protected readonly tooltipView = computed<TooltipView | null>(() => {
    const seed = this.hovered();
    const pos = this.tooltipPos();
    const view = this.layout();
    if (!seed || !pos || !view) return null;

    let rows: readonly TooltipRow[];
    if (seed.kind === 'node') {
      const node = view.nodes.find((n) => n.id === seed.id);
      if (!node) return null;
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

  /** Live control handles, read at commit time (uncontrolled inputs). */
  private readonly nameInputRef = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  private readonly valueInputRef = viewChild<ElementRef<HTMLInputElement>>('valueInput');
  private readonly linkValueInputRef = viewChild<ElementRef<HTMLInputElement>>('linkValueInput');
  private readonly sourceSelectRef = viewChild<ElementRef<HTMLSelectElement>>('sourceSelect');
  private readonly targetSelectRef = viewChild<ElementRef<HTMLSelectElement>>('targetSelect');

  /**
   * A stable key for the open edit — changes only when a different element is
   * opened (not on every keystroke/error), so the auto-focus effect fires once.
   */
  private readonly editKey = computed(() => {
    const edit = this.editState();
    if (!edit) return null;
    return edit.kind === 'node' ? `n${edit.nodeId}` : `l${edit.source}-${edit.target}`;
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
    const box = this.placeBox(node.x + node.width / 2, node.y + node.height / 2, 220, rows, edit.error, view);
    return { ...box, seedName: edit.seedName, seedValue: edit.seedValue, error: edit.error };
  });

  /**
   * The placed link edit overlay (UC-4), or `null` unless a link edit is open.
   * Centered on the edited link's value label and clamped inside the viewBox.
   */
  protected readonly linkEditView = computed<LinkEditView | null>(() => {
    const edit = this.editState();
    const view = this.layout();
    if (!edit || edit.kind !== 'link' || !view) return null;
    const link = view.links.find((l) => l.source === edit.source && l.target === edit.target);
    if (!link) return null;

    const rows =
      (this.canEditLinkValue() ? 1 : 0) +
      (this.canEditLinkSource() ? 1 : 0) +
      (this.canEditLinkTarget() ? 1 : 0);
    const box = this.placeBox(link.labelX, link.labelY, 240, rows, edit.error, view);
    const nodes = view.nodes.map((n) => ({ id: n.id, label: n.label }));
    return { ...box, source: edit.source, target: edit.target, seedValue: edit.seedValue, error: edit.error, nodes };
  });

  /** Centers a `rows`-field overlay on (cx, cy), clamped inside the viewBox. */
  private placeBox(
    cx: number,
    cy: number,
    width: number,
    rows: number,
    error: string | null,
    view: SankeyLayout,
  ): EditBox {
    const height = 78 + rows * 56 + (error ? 30 : 0);
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
    const node = this.dataSource()?.nodes.find((n) => n?.id === nodeId);
    this.editState.set({
      kind: 'node',
      nodeId,
      seedName: node && typeof node.name === 'string' ? node.name : '',
      seedValue: node && node.value != null ? String(node.value) : '',
      error: null,
    });
  }

  /**
   * Opens the link edit overlay (UC-4 trigger: double-click). No-op when no link
   * element is editable (extension 1.a). Identified by the link's current
   * source/target so the right entry is rewritten on commit.
   */
  protected startLinkEdit(link: LayoutLink): void {
    if (!this.linkEditingEnabled()) return;
    this.editState.set({
      kind: 'link',
      source: link.source,
      target: link.target,
      seedValue: String(link.value),
      error: null,
    });
  }

  /** Dispatches ENTER / Save / click-outside to the matching commit (UC-3/UC-4 step 3). */
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
      this.editState.set(null);
      return;
    }

    // Business rule 2: value must be a positive number, or null/undefined.
    let nextValue: number | null = null;
    if (this.canEditNodeValue()) {
      const raw = (this.valueInputRef()?.nativeElement.value ?? '').trim();
      if (raw.length > 0) {
        const parsed = Number(raw);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          this.editState.set({ ...edit, error: 'Value must be a positive number.' });
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
    this.editState.set(null);
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
      this.editState.set(null);
      return;
    }
    const nodeIds = new Set(this.layout()?.nodes.map((n) => n.id));

    // Selects only offer existing node ids, but re-validate defensively.
    const nextSource = this.canEditLinkSource()
      ? Number(this.sourceSelectRef()?.nativeElement.value)
      : edit.source;
    const nextTarget = this.canEditLinkTarget()
      ? Number(this.targetSelectRef()?.nativeElement.value)
      : edit.target;

    // Business rule 2: source and target must be existing, distinct nodes.
    if (!nodeIds.has(nextSource) || !nodeIds.has(nextTarget)) {
      this.editState.set({ ...edit, error: 'Source and target must be existing nodes.' });
      return;
    }
    if (nextSource === nextTarget) {
      this.editState.set({ ...edit, error: 'Source and target must be different.' });
      return;
    }

    // Business rule 2: value must be a positive number (required for a link).
    let nextValue = edit.seedValue.length > 0 ? Number(edit.seedValue) : NaN;
    if (this.canEditLinkValue()) {
      const raw = (this.linkValueInputRef()?.nativeElement.value ?? '').trim();
      nextValue = Number(raw);
    }
    if (!Number.isFinite(nextValue) || nextValue <= 0) {
      this.editState.set({ ...edit, error: 'Value must be a positive number.' });
      return;
    }

    // Rewrite the first link matching the original source/target (its identity).
    let replaced = false;
    const links = data.links.map((link) => {
      if (replaced || !link || link.source !== edit.source || link.target !== edit.target) return link;
      replaced = true;
      return {
        ...link,
        ...(this.canEditLinkSource() ? { source: nextSource } : {}),
        ...(this.canEditLinkTarget() ? { target: nextTarget } : {}),
        ...(this.canEditLinkValue() ? { value: nextValue } : {}),
      };
    });

    this.dataSource.set({ ...data, links });
    this.editState.set(null);
  }

  /** Discards the edit and closes the overlay (UC-3/UC-4 extension 3.a.1.a: Esc/Cancel). */
  protected cancelEdit(): void {
    this.editState.set(null);
  }

  /**
   * Commits when focus leaves the whole overlay — i.e. the user "clicks outside
   * the editable area" (UC-3/UC-4 step 2). Focus moving between the overlay's own
   * controls (a field, Save, Cancel) is ignored so those keep their own intent.
   */
  protected onEditFocusOut(event: FocusEvent): void {
    const container = event.currentTarget as HTMLElement;
    const next = event.relatedTarget as Node | null;
    if (next && container.contains(next)) return;
    this.commitEdit();
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

    // Move keyboard focus into the overlay when an edit opens, so keyboard users
    // land in the first editable control (UC-3/UC-4 accessibility).
    effect(() => {
      if (this.editKey() === null) return;
      queueMicrotask(() => {
        const el =
          this.nameInputRef()?.nativeElement ??
          this.valueInputRef()?.nativeElement ??
          this.sourceSelectRef()?.nativeElement ??
          this.targetSelectRef()?.nativeElement ??
          this.linkValueInputRef()?.nativeElement;
        el?.focus();
        if (el instanceof HTMLInputElement) el.select();
      });
    });
  }
}
