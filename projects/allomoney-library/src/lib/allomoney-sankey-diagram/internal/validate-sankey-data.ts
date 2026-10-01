import type {SankeyData} from '../models/sankey-data';

/**
 * A node that survived validation and can be drawn.
 * Framework-agnostic and immutable.
 */
export interface ValidNode {
    /** Unique, finite numeric id (as supplied). */
    readonly id: number;
    /** Display label — the supplied `name`, or the id as a string when absent. */
    readonly label: string;
    /**
     * The explicit `value` ("total deposit") when the consumer supplied a valid
     * positive number, otherwise `null` (derived from links at layout time).
     */
    readonly value: number | null;
    /** Optional consumer-supplied CSS color. */
    readonly color?: string;
}

/** A link that survived validation and connects two valid nodes. */
export interface ValidLink {
    readonly source: number;
    readonly target: number;
    readonly value: number;
    readonly color?: string;
    /**
     * Position of this link in the original {@link SankeyData.links} array. It is
     * the stable identity used to write an edit back to the exact link — needed
     * because parallel links share the same source and target.
     */
    readonly index: number;
}

/** Result of validating a {@link SankeyData} payload. */
export interface ValidationResult {
    /**
     * `true` when the placeholder must be shown — either an Empty State
     *  or when every node was rejected.
     */
    readonly isEmptyState: boolean;
    /** Drawable nodes, in input order. */
    readonly nodes: readonly ValidNode[];
    /** Drawable links referencing only valid nodes, in input order. */
    readonly links: readonly ValidLink[];
    /** Human-readable messages for every rejected node/link (for the console). */
    readonly errors: readonly string[];
}

/** A finite number strictly greater than zero. */
function isPositiveNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** A finite number (id may be zero or negative, it just has to be a real number). */
function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Validates a consumer-supplied {@link SankeyData} payload.
 * Pure and non-mutating: the input is treated as immutable and never changed.
 * Invalid nodes/links are dropped (not thrown), and a message is collected for
 * each so the component can log them to the console.
 * @param data The raw, untrusted data (possibly `null`/`undefined`).
 * @returns Drawable nodes/links, an empty-state flag, and error messages.
 */
export function validateSankeyData(
    data: SankeyData | null | undefined,
): ValidationResult {
    const errors: string[] = [];

    if (data == null || !Array.isArray(data.nodes) || data.nodes.length === 0) {
        return {isEmptyState: true, nodes: [], links: [], errors};
    }

    const validNodes: ValidNode[] = [];
    const seenIds = new Set<number>();

    for (const node of data.nodes) {
        if (node == null) {
            errors.push('Skipped a node: entry is null or undefined.');
            continue;
        }
        if (!isFiniteNumber(node.id)) {
            errors.push(`Skipped a node: "id" is not a finite number (${String(node.id)}).`);
            continue;
        }
        if (node.value != null && !isPositiveNumber(node.value)) {
            errors.push(`Skipped node ${node.id}: "value" is not a positive number (${String(node.value)}).`);
            continue;
        }
        if (seenIds.has(node.id)) {
            errors.push(`Skipped node ${node.id}: duplicate id.`);
            continue;
        }

        seenIds.add(node.id);
        const label =
            typeof node.name === 'string' && node.name.trim().length > 0
                ? node.name
                : String(node.id);
        validNodes.push({
            id: node.id,
            label,
            value: node.value != null ? node.value : null,
            ...(node.color != null ? {color: node.color} : {}),
        });
    }

    // show the placeholder if all nodes are invalid.
    if (validNodes.length === 0) {
        return {isEmptyState: true, nodes: [], links: [], errors};
    }

    const validLinks: ValidLink[] = [];
    const links = Array.isArray(data.links) ? data.links : [];

    for (let i = 0; i < links.length; i++) {
        const link = links[i];
        if (link == null) {
            errors.push('Skipped a link: entry is null or undefined.');
            continue;
        }
        if (!isFiniteNumber(link.source) || !isFiniteNumber(link.target)) {
            errors.push('Skipped a link: "source"/"target" is not a finite number.');
            continue;
        }
        if (link.source === link.target) {
            errors.push(`Skipped link ${link.source}->${link.target}: source equals target.`);
            continue;
        }
        if (!seenIds.has(link.source)) {
            errors.push(`Skipped link ${link.source}->${link.target}: no valid node with id ${link.source}.`);
            continue;
        }
        if (!seenIds.has(link.target)) {
            errors.push(`Skipped link ${link.source}->${link.target}: no valid node with id ${link.target}.`);
            continue;
        }
        if (!isPositiveNumber(link.value)) {
            errors.push(`Skipped link ${link.source}->${link.target}: "value" is not a positive number (${String(link.value)}).`);
            continue;
        }

        validLinks.push({
            source: link.source,
            target: link.target,
            value: link.value,
            index: i,
            ...(link.color != null ? {color: link.color} : {}),
        });
    }

    return {isEmptyState: false, nodes: validNodes, links: validLinks, errors};
}
