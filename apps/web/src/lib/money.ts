/**
 * Money, the way the design system shows it.
 *
 * WHOLE UNITS. The design shows "₹248", never "₹248.00" and never "INR
 * 248.00": a rider comparing four vehicle classes is reading the difference
 * between them, and two decimal places that are always "00" are two digits
 * of noise in front of that. The paise are not lost -- the server holds the
 * exact amount and the receipt states it -- they are just not what a price
 * list is for.
 *
 * ROUNDED, NOT TRUNCATED. A fare displayed lower than it will be charged is
 * the one rounding error a fare-lock promise cannot survive.
 *
 * Every rendered number carries `font-variant-numeric: tabular-nums` through
 * the `sg-num` class or a `sg-` component, so a column of fares lines up on
 * the decimal and a changing ETA does not make the row jiggle.
 */

/**
 * The symbol for a currency code.
 *
 * `base/countries.py` on the server is the source of truth for currencies
 * and `/pricing/countries/` exposes `currency_symbol` for each market, so
 * this is a display shortcut for the codes the quote endpoints return
 * inline, NOT a second list of supported currencies. An unknown code falls
 * back to the code itself: "USD 20" is honest, where a guessed glyph would
 * not be.
 */
const SYMBOLS: Record<string, string> = {
  INR: '₹',
};

export function currencySymbol(currency?: string | null): string {
  if (!currency) return '';
  return SYMBOLS[currency.toUpperCase()] ?? currency.toUpperCase();
}

/** The whole-unit digits of an amount, grouped for the locale. */
export function fareDigits(amount: string | number | null | undefined): string | null {
  if (amount === null || amount === undefined || amount === '') return null;
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  return Math.round(n).toLocaleString('en-IN');
}

/**
 * A complete price, symbol and digits together: "₹248".
 *
 * Returns null when there is no amount to show. A caller that gets null must
 * say so -- "Fare unavailable" -- rather than printing a zero, because a
 * rider cannot tell a free ride from a failed quote.
 */
export function formatFare(
  amount: string | number | null | undefined,
  currency?: string | null,
): string | null {
  const digits = fareDigits(amount);
  if (digits === null) return null;
  const symbol = currencySymbol(currency);
  // A symbol sits flush against the digits; a three-letter code needs a gap.
  return symbol.length === 1 ? `${symbol}${digits}` : `${symbol} ${digits}`.trim();
}

/** A duration in minutes, as the design writes it: "4 min". */
export function formatMinutes(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return null;
  const mins = Math.max(1, Math.round(seconds / 60));
  return `${mins} min`;
}

/** A distance, in the unit the zone uses: "12.4 km". */
export function formatDistance(
  value: number | null | undefined,
  unit: string | null | undefined = 'km',
): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return `${value.toFixed(1)} ${unit ?? 'km'}`;
}
