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
}

/** Which node is being edited, the seed values, and any validation error. */
interface EditDraft {
  /** {@link SankeyNode.id} of the node under edit. */
  readonly nodeId: number;
  /** Initial name shown in the input (empty when the node had no name). */
  readonly seedName: string;
  /** Initial value shown in the input (empty when the node had no explicit value). */
  readonly seedValue: string;
  /** Validation message to show, or `null` while the draft is clean. */
  readonly error: string | null;
}

/** The edit overlay's placed geometry plus its current draft/error state. */
interface EditView {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly seedName: string;
  readonly seedValue: string;
  readonly error: string | null;
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

  // --- edit a node in place ----------------------------------------

  /** The node currently being edited (UC-3), or `null` when no edit is open. */
  private readonly editState = signal<EditDraft | null>(null);

  /** Live `<input>` handles for reading the entered name/value at commit time. */
  private readonly nameInputRef = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  private readonly valueInputRef = viewChild<ElementRef<HTMLInputElement>>('valueInput');

  /**
   * Just the edited node id — changes only when a different node is opened (not
   * on every keystroke/error), so the auto-focus effect fires exactly once.
   */
  private readonly editingNodeId = computed(() => this.editState()?.nodeId ?? null);

  /**
   * The placed edit overlay, or `null` when no edit is open. Centered over the
   * edited node and clamped inside the viewBox so it never spills off-canvas.
   */
  protected readonly editView = computed<EditView | null>(() => {
    const edit = this.editState();
    const view = this.layout();
    if (!edit || !view) return null;
    const node = view.nodes.find((n) => n.id === edit.nodeId);
    if (!node) return null;

    const rows = (this.canEditNodeName() ? 1 : 0) + (this.canEditNodeValue() ? 1 : 0);
    const width = 220;
    const height = 78 + rows * 56 + (edit.error ? 30 : 0);
    const cx = node.x + node.width / 2;
    const cy = node.y + node.height / 2;
    const x = Math.max(0, Math.min(cx - width / 2, view.width - width));
    const y = Math.max(0, Math.min(cy - height / 2, view.height - height));

    return { x, y, width, height, seedName: edit.seedName, seedValue: edit.seedValue, error: edit.error };
  });

  /**
   * Opens the edit overlay for a node (UC-3 trigger: double-click). No-op when
   * neither element is editable (extension 1.a). Seeds the inputs from the raw
   * consumer data — not the derived/formatted labels — so cleared fields mean
   * "unset" rather than the id fallback or a summed value.
   */
  protected startEdit(nodeId: number): void {
    if (!this.editingEnabled()) return;
    const node = this.dataSource()?.nodes.find((n) => n?.id === nodeId);
    this.editState.set({
      nodeId,
      seedName: node && typeof node.name === 'string' ? node.name : '',
      seedValue: node && node.value != null ? String(node.value) : '',
      error: null,
    });
  }

  /**
   * Validates the entered data (UC-3 step 3, business rule 2) and, when valid,
   * writes an immutable copy back through {@link dataSource} and closes the
   * overlay (step 3.1). On failure it keeps the overlay open and shows the error
   * (extension 3.a). Only fields the user is permitted to edit are touched.
   */
  protected commitEdit(): void {
    const edit = this.editState();
    const data = this.dataSource();
    if (!edit || !data) {
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

  /** Discards the edit and closes the overlay (UC-3 extension 3.a.1.a: Esc/Cancel). */
  protected cancelEdit(): void {
    this.editState.set(null);
  }

  /**
   * Commits when focus leaves the whole overlay — i.e. the user "clicks outside
   * the editable area" (UC-3 step 2). Focus moving between the overlay's own
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
    // land in the first editable field (UC-3 accessibility).
    effect(() => {
      if (this.editingNodeId() === null) return;
      queueMicrotask(() => {
        const el = this.nameInputRef()?.nativeElement ?? this.valueInputRef()?.nativeElement;
        el?.focus();
        el?.select();
      });
    });
  }
}
