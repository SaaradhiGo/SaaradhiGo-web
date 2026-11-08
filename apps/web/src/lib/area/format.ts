/**
 * Money and dates on the signed-in screens (owner, 2026-11-08).
 *
 * Money: the trip's own currency, in the reader's locale, through
 * Intl.NumberFormat; whole amounts without decimals ("₹118"), others with
 * the currency's own.
 *
 * Dates: always in the trip's market time zone, in the reader's locale.
 * A list row has two lines: "Today" / "Yesterday" over the full date and time
 * ("Sun, 8 Nov · 9:12 am"), or the date over the time; anything older than
 * seven days carries the year when it is not this year.
 */
export type When = { first: string; second: string };

const DAY = 86_400_000;

export function money(amount: string | number | null | undefined, currency: string | null | undefined, locale: string): string | null {
  if (amount === null || amount === undefined || amount === '' || !currency) return null;
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  const whole = Number.isInteger(n);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      ...(whole ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}),
    }).format(n);
  } catch {
    return null;
  }
}

/** The calendar date (YYYY-MM-DD) of an instant in a time zone. */
function ymd(at: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
}

function tz(timeZone?: string | null): string | undefined {
  if (!timeZone) return undefined;
  try {
    new Intl.DateTimeFormat('en', { timeZone }).format(0);
    return timeZone;
  } catch {
    return undefined;
  }
}

/** "9:12 am" in the reader's locale. */
export function clock(iso: string, locale: string, timeZone?: string | null): string {
  return new Intl.DateTimeFormat(locale, { timeZone: tz(timeZone), hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

/** "Sun, 8 Nov", with the year when it is not the current one. */
export function dateLabel(iso: string, locale: string, timeZone?: string | null, now = new Date(), withYear = false): string {
  const zone = tz(timeZone);
  const at = new Date(iso);
  const otherYear = ymd(at, zone).slice(0, 4) !== ymd(now, zone).slice(0, 4);
  return new Intl.DateTimeFormat(locale, {
    timeZone: zone, weekday: 'short', day: 'numeric', month: 'short',
    ...(otherYear || withYear ? { year: 'numeric' } : {}),
  }).format(at);
}

/** The two lines of a trip, payout or receipt row. */
export function listWhen(
  iso: string | null | undefined,
  locale: string,
  timeZone: string | null | undefined,
  words: { today: string; yesterday: string },
  now = new Date(),
): When | null {
  if (!iso || Number.isNaN(Date.parse(iso))) return null;
  const zone = tz(timeZone);
  const ago = daysBetween(ymd(new Date(iso), zone), ymd(now, zone));
  const date = dateLabel(iso, locale, zone, now);
  const time = clock(iso, locale, zone);
  if (ago === 0) return { first: words.today, second: `${date} · ${time}` };
  if (ago === 1) return { first: words.yesterday, second: `${date} · ${time}` };
  // Older than seven days: the year too, when it is not this year (dateLabel).
  return { first: date, second: time };
}

/** "Mon 2", for the 7-day chart; `date` is a local YYYY-MM-DD. */
export function chartDay(date: string, locale: string): string {
  const at = new Date(`${date}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'short', day: 'numeric' }).formatToParts(at);
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const d = parts.find((p) => p.type === 'day')?.value ?? '';
  return `${wd} ${d}`.trim();
}

/** "Mon 2 – Sun 8 Nov" for a period; `start`/`end` are local YYYY-MM-DD. */
export function rangeLabel(start: string, end: string, locale: string): string {
  const fmt = (d: string, month: boolean) => {
    const at = new Date(`${d}T12:00:00Z`);
    const parts = new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC', weekday: 'short', day: 'numeric', ...(month ? { month: 'short' } : {}),
    }).formatToParts(at);
    const pick = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    return [pick('weekday'), pick('day'), month ? pick('month') : ''].filter(Boolean).join(' ');
  };
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return `${fmt(start, !sameMonth)} – ${fmt(end, true)}`;
}

/** "November 2026", for "Rider since …". */
export function monthYear(iso: string | null | undefined, locale: string): string | null {
  if (!iso || Number.isNaN(Date.parse(iso))) return null;
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(iso));
}
