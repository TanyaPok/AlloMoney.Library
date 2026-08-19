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
  signal,
  viewChild,
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

/** A node paired with its current hover-dim state. */
interface RenderNode extends LayoutNode {
  /** `true` when a chain is hovered and this node is outside it. */
  readonly dimmed: boolean;
  /** Accessible name for the node's editable `button`, precomputed. */
  readonly editLabel: string;
}

/** A link paired with its current hover-dim state. */
interface RenderLink extends LayoutLink {
  /** `true` when a chain is hovered and this link is outside it. */
  readonly dimmed: boolean;
  /** Accessible name for the link's editable `button`, precomputed. */
  readonly editLabel: string;
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
   * The diagram data. When it is an Empty State or every
   * node is invalid, the themed empty state is shown instead of a diagram.
   *
   * A two-way binding `model` : editing a node in place writes an
   * immutable copy back through it, so a `[(dataSource)]` binding (or an
   * explicit `(dataSourceChange)`) keeps the consumer's data in sync.
   */
  readonly dataSource = model<SankeyData | undefined | null>(undefined);

  /**
   * Visual theme. Falls back to the library-wide `defaultTheme` configured via
   * `provideAlloMoneyLibrary()` when not set on the element.
   */
  readonly theme = input<SankeyTheme>(this.config.defaultTheme);

  /**
   * When `true`, a user may edit each node's name by double-clicking it
   * Defaults to `false` (read-only).
   */
  readonly canEditNodeName = input(false, { transform: booleanAttribute });

  /**
   * When `true`, a user may edit each node's value by double-clicking it
   * Defaults to `false` (read-only).
   */
  readonly canEditNodeValue = input(false, { transform: booleanAttribute });

  /** `true` when at least one node element is editable (UC-3 extension 1.a). */
  protected readonly editingEnabled = computed(
    () => this.canEditNodeName() || this.canEditNodeValue(),
  );

  /**
   * When `true`, a user may edit each link's value by double-clicking it
   */
  readonly canEditLinkValue = input(false, { transform: booleanAttribute });

  /**
   * When `true`, a user may re-point each link's source to another node
   */
  readonly canEditLinkSource = input(false, { transform: booleanAttribute });

  /**
   * When `true`, a user may re-point each link's target to another node
   */
  readonly canEditLinkTarget = input(false, { transform: booleanAttribute });

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
    const data = this.dataSource();
    const orientation = data?.orientation ?? 'horizontal';
    return computeSankeyLayout(
      validation.nodes,
      validation.links,
      this.theme(),
      orientation,
      data?.currency ?? null,
    );
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
    return view.links.map((link) => ({
      ...link,
      dimmed: chain !== null && !chain.linkIds.has(link.id),
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
