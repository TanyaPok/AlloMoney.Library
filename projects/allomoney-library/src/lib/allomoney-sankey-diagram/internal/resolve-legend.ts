import type { LegendLocation, SankeyLegend } from '../models/sankey-data';

/**
 * A legend with every field resolved to a concrete value — what the component
 * actually renders. Produced by {@link resolveLegend} from the (possibly
 * partial, possibly absent) consumer input plus the documented defaults.
 */
export interface ResolvedSankeyLegend {
  readonly visibility: boolean;
  readonly location: LegendLocation;
  readonly isFullLegendShown: boolean;
  readonly inLabel: string;
  readonly outLabel: string;
}

/** Documented default legend values (UC-5 business rule 2). */
export const DEFAULT_SANKEY_LEGEND: ResolvedSankeyLegend = {
  visibility: true,
  location: 'bottom',
  isFullLegendShown: false,
  inLabel: 'Deposit',
  outLabel: 'Withdrawal',
};

/** Result of resolving a legend: the concrete values plus any validation errors. */
export interface LegendResolution {
  readonly legend: ResolvedSankeyLegend;
  /** Messages for every rejected field (for the console). */
  readonly errors: readonly string[];
}

const LOCATIONS: readonly LegendLocation[] = ['left', 'top', 'right', 'bottom'];

/**
 * Resolves the effective legend (UC-5 business rules 1 and 2).
 *
 * Field-level merge over the defaults, applied input-first then options, so the
 * `options` legend takes priority field by field (business rule 1). An absent,
 * `null` or `{}` legend therefore yields the full defaults (extension 1.a), and a
 * partial legend fills only its missing fields (extension 1.b). Each supplied
 * field is validated by type/range (business rule 2); an invalid field is
 * dropped — it keeps the value resolved so far — and a message is collected so
 * the component can log it.
 *
 * Pure and non-mutating: inputs are treated as immutable.
 *
 * @param inputLegend The `[legend]` element input (lower priority).
 * @param optionsLegend The {@link SankeyOptions.legend} value (higher priority).
 */
export function resolveLegend(
  inputLegend: SankeyLegend | null | undefined,
  optionsLegend: SankeyLegend | null | undefined,
): LegendResolution {
  const errors: string[] = [];
  let legend: ResolvedSankeyLegend = { ...DEFAULT_SANKEY_LEGEND };

  // Lowest priority first so the later (options) source overrides the earlier
  // (input) one on any field they both set.
  for (const source of [inputLegend, optionsLegend]) {
    if (source == null) continue;

    if (source.visibility !== undefined) {
      if (typeof source.visibility === 'boolean') {
        legend = { ...legend, visibility: source.visibility };
      } else {
        errors.push(`Ignored legend "visibility": expected a boolean (${String(source.visibility)}).`);
      }
    }

    if (source.location !== undefined) {
      if (LOCATIONS.includes(source.location)) {
        legend = { ...legend, location: source.location };
      } else {
        errors.push(
          `Ignored legend "location": expected one of ${LOCATIONS.map((l) => `"${l}"`).join(', ')} (${String(source.location)}).`,
        );
      }
    }

    if (source.isFullLegendShown !== undefined) {
      if (typeof source.isFullLegendShown === 'boolean') {
        legend = { ...legend, isFullLegendShown: source.isFullLegendShown };
      } else {
        errors.push(
          `Ignored legend "isFullLegendShown": expected a boolean (${String(source.isFullLegendShown)}).`,
        );
      }
    }

    if (source.inLabel !== undefined) {
      if (typeof source.inLabel === 'string') {
        legend = { ...legend, inLabel: source.inLabel };
      } else {
        errors.push(`Ignored legend "inLabel": expected a string (${String(source.inLabel)}).`);
      }
    }

    if (source.outLabel !== undefined) {
      if (typeof source.outLabel === 'string') {
        legend = { ...legend, outLabel: source.outLabel };
      } else {
        errors.push(`Ignored legend "outLabel": expected a string (${String(source.outLabel)}).`);
      }
    }
  }

  return { legend, errors };
}
