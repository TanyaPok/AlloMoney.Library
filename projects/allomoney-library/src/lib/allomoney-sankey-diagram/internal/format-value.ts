/**
 * Builds the value formatter shared by the layout engine and the legend. When a
 * non-empty ISO 4217 currency code is supplied, values are formatted as currency
 * in the host locale via {@link Intl.NumberFormat} (e.g. `"$10.00"`). An unknown
 * code makes `Intl` throw, so we fall back to a plain fixed-2 number.
 * Dependency-free — `Intl` is a JavaScript platform built-in.
 *
 * @param currency Optional ISO 4217 code; empty/`null`/unknown → plain fixed-2.
 * @returns A pure `(value) => string` formatter.
 */
export function makeValueFormatter(currency: string | null | undefined): (value: number) => string {
  const code = typeof currency === 'string' ? currency.trim() : '';
  if (code.length > 0) {
    try {
      const nf = new Intl.NumberFormat(undefined, { style: 'currency', currency: code });
      return (value) => nf.format(value);
    } catch {
      // Unknown/invalid currency code — fall through to plain formatting.
    }
  }
  return (value) => value.toFixed(2);
}
