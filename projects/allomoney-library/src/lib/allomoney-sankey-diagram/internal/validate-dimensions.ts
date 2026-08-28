import { DEFAULT_LAYOUT_OPTIONS } from './sankey-layout';

/**
 * The diagram's natural aspect ratio (width / height), taken from the fixed
 * viewBox the layout engine draws into. A requested pixel box whose ratio strays
 * too far from this leaves the value-proportional diagram stranded in a sea of
 * empty space, which is what {@link resolveDimensions} treats as "distortion".
 */
const NATURAL_ASPECT_RATIO = DEFAULT_LAYOUT_OPTIONS.width / DEFAULT_LAYOUT_OPTIONS.height;

/**
 * Smallest edge (px) at which the diagram is still legible. Matches the
 * component's CSS `min-block-size` floor, so an accepted height is never
 * silently clamped larger by the stylesheet.
 */
const MIN_DIMENSION_PX = 200;

/**
 * How far the requested box ratio may stray from {@link NATURAL_ASPECT_RATIO}
 * before it counts as significant distortion — as a multiplicative factor in
 * either direction.
 */
const MAX_ASPECT_DISTORTION = 4;

/** Resolved host size in pixels, or `null` on an axis to mean "default (100%)". */
export interface ResolvedDimensions {
  /** Host width in px, or `null` to fall back to 100% of the container. */
  readonly width: number | null;
  /** Host height in px, or `null` to fall back to 100% of the container. */
  readonly height: number | null;
  /** Human-readable messages for every rejected value (for the console). */
  readonly errors: readonly string[];
}

/**
 * Validates the consumer-requested pixel width/height.
 *
 * Pure and non-mutating. A value must be a positive, finite number of at least
 * {@link MIN_DIMENSION_PX}px; when both axes are given, their ratio must stay
 * within {@link MAX_ASPECT_DISTORTION}× of the diagram's natural ratio. If any
 * value is invalid or the pair would significantly distort the display, a
 * message is collected and the diagram falls back to its default size (100% of
 * the container on both axes) — so a bad override never renders a broken box.
 *
 * @param requestedWidth Requested width in px, or `null`/`undefined` when unset.
 * @param requestedHeight Requested height in px, or `null`/`undefined` when unset.
 * @returns Resolved px sizes (or `null` per axis) plus any error messages.
 */
export function resolveDimensions(
  requestedWidth: number | null | undefined,
  requestedHeight: number | null | undefined,
): ResolvedDimensions {
  const errors: string[] = [];
  const width = checkDimension('width', requestedWidth, errors);
  const height = checkDimension('height', requestedHeight, errors);

  // Judge the aspect ratio only when both axes survived as explicit px values.
  if (width !== null && height !== null) {
    const requested = width / height;
    const factor = requested / NATURAL_ASPECT_RATIO;
    if (factor > MAX_ASPECT_DISTORTION || factor < 1 / MAX_ASPECT_DISTORTION) {
      errors.push(
        `Requested size ${width}×${height}px distorts the diagram ` +
          `(aspect ratio ${requested.toFixed(2)}:1 vs. its natural ` +
          `${NATURAL_ASPECT_RATIO.toFixed(2)}:1). Falling back to the default size.`,
      );
    }
  }

  // Any problem at all: render at the default size (100% of the container).
  if (errors.length > 0) return { width: null, height: null, errors };
  return { width, height, errors };
}

/**
 * Validates one axis. Returns the value in px when acceptable, or `null`
 * (meaning "use the default") after pushing an error otherwise. An unset value
 * yields `null` with no error.
 */
function checkDimension(
  name: 'width' | 'height',
  value: number | null | undefined,
  errors: string[],
): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value) || value <= 0) {
    errors.push(`Ignoring invalid ${name} (${String(value)}): expected a positive number of pixels.`);
    return null;
  }
  if (value < MIN_DIMENSION_PX) {
    errors.push(`Ignoring ${name} ${value}px: below the minimum legible size of ${MIN_DIMENSION_PX}px.`);
    return null;
  }
  return value;
}