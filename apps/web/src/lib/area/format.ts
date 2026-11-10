/**
 * Money and dates on the signed-in screens (owner, 2026-11-08).
 *
 * Money: the trip's own currency, in the reader's locale, through
 * Intl.NumberFormat, always with the currency's own decimals ("₹0.00",
 * "₹631.55"; owner, 8 Nov).
 *
 * Dates: always in the trip's market time zone, in the reader's locale.
 * A list row has two lines: "Today" / "Yesterday" over the full date and time
 * ("Sun, 8 Nov · 9:12 am"), or the date over the time; anything older than
 * seven days carries the year when it is not this year. A trip without a
 * time zone uses the market's (marketZone), and a date that cannot be read
 * shows nothing rather than breaking the page.
 */
export type When = { first: string; second: string };

const DAY = 86_400_000;

export function money(amount: string | number | null | undefined, currency: string | null | undefined, locale: string): string | null {
  if (amount === null || amount === undefined || amount === '' || !currency) return null;
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
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

/**
 * The market's time zone, for a trip or row that carries none. Every live
 * market is in India today, so it starts as India's; the driver pages set it
 * from the earnings API's `timezone` once that answers.
 */
let market = 'Asia/Kolkata';
export function setMarketZone(zone: string | null | undefined) {
  if (zone && valid(zone)) market = zone;
}
export const marketZone = () => market;

function valid(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

function tz(timeZone?: string | null): string {
  return timeZone && valid(timeZone) ? timeZone : market;
}

const readable = (iso: string | null | undefined): iso is string => !!iso && !Number.isNaN(Date.parse(iso));

/** "9:12 am" in the reader's locale. */
export function clock(iso: string, locale: string, timeZone?: string | null): string {
  if (!readable(iso)) return '';
  return new Intl.DateTimeFormat(locale, { timeZone: tz(timeZone), hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

/** "Sun, 8 Nov", with the year when it is not the current one. */
export function dateLabel(iso: string, locale: string, timeZone?: string | null, now = new Date(), withYear = false): string {
  if (!readable(iso)) return '';
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
  if (!readable(iso)) return null;
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

/**
 * Numeric dates by market (10 Nov v2): India dd/mm/yyyy, USA mm/dd/yyyy, whatever the browser's
 * own locale. Stored and sent as ISO (YYYY-MM-DD).
 */
export type DateOrder = 'dmy' | 'mdy';
export const dateOrder = (country: string | null | undefined): DateOrder => (country === 'US' ? 'mdy' : 'dmy');
export const datePlaceholder = (order: DateOrder) => (order === 'mdy' ? 'mm/dd/yyyy' : 'dd/mm/yyyy');

export function numericDate(iso: string | null | undefined, order: DateOrder): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return '';
  return order === 'mdy' ? `${m[2]}/${m[3]}/${m[1]}` : `${m[3]}/${m[2]}/${m[1]}`;
}

/** What the driver typed, as ISO; null when it is not a real date. */
export function parseNumericDate(text: string, order: DateOrder): string | null {
  const m = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\s*$/.exec(text);
  if (!m) return null;
  const [a, b, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const [d, mo] = order === 'mdy' ? [b, a] : [a, b];
  const at = new Date(Date.UTC(y, mo - 1, d));
  if (at.getUTCFullYear() !== y || at.getUTCMonth() !== mo - 1 || at.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** "10 Nov" from an ISO instant, for "Uploaded 10 Nov". */
export function dayMonth(iso: string | null | undefined, locale: string): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return '';
  return new Intl.DateTimeFormat(locale, { timeZone: marketZone(), day: 'numeric', month: 'short' }).format(new Date(iso));
}
