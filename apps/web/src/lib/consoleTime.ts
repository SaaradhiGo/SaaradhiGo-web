/**
 * Clock and calendar in the region the operator is looking at.
 *
 * One console serves Hyderabad and Austin. A trip requested "at 14:05" is
 * a different fact in each, and an operator in one city reading the other
 * city's board must see that city's local time, not their own browser's.
 * The time zone follows the record's city, else the SELECTED scope. When there
 * is neither (a platform-wide list) it is UTC, and it says so: an operator's
 * browser zone is never used (owner, 2026-11-03). Every stamp carries its zone
 * label ("14:05 IST"), so a time is never ambiguous.
 *
 * The map is by scope-code prefix, deepest match first. It is small
 * because the platform is: a new state in a new time zone is one line.
 */
const ZONES: Array<[prefix: string, tz: string]> = [
  // 14 Nov (owner): the Treasure Valley (US-ID-TV) is Boise, Mountain time. The console showed its
  // support case at "19:58 EST" because every US code fell to New York.
  ['US-ID', 'America/Boise'],
  ['US-TX', 'America/Chicago'],
  // A US-wide row: the backend's US default (base/countries.py), Boise, the only US market.
  ['US', 'America/Boise'],
  ['IN', 'Asia/Kolkata'],
];

export function timeZoneFor(scopeCode: string | null | undefined): string | undefined {
  if (!scopeCode) return undefined;
  const hit = ZONES
    .filter(([prefix]) => scopeCode === prefix || scopeCode.startsWith(prefix + '-'))
    .sort((a, b) => b[0].length - a[0].length)[0];
  return hit?.[1];
}

/**
 * The zone a row's city keeps: the IANA name the API sent with it when it did (`timezone`, from
 * the city's service zone), else the one its code maps to. No city: undefined, so `stamp` keeps
 * today's behaviour (UTC, labelled) or the caller's scope zone.
 */
export function cityTimeZone(
  city: { code?: string | null; timezone?: string | null } | string | null | undefined,
): string | undefined {
  if (!city) return undefined;
  if (typeof city === 'string') return timeZoneFor(city);
  return city.timezone || timeZoneFor(city.code);
}

/** "IST", "CDT" -- the short name a person would say. */
export function zoneAbbreviation(timeZone: string | null | undefined): string {
  return zoneLabelAt(new Date(), timeZone || 'UTC');
}

/** Intl puts a narrow no-break space before AM/PM; a plain space reads and searches the same. */
const plain = (s: string) => s.replace(/[  ]/g, ' ');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The parts of a moment in a zone: one formatter, so every console stamp agrees. */
function partsIn(d: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  }).formatToParts(d);
  const get = (t: string) => f.find((p) => p.type === t)?.value ?? '';
  return {
    date: `${Number(get('day'))} ${MON[Number(get('month')) - 1]} ${get('year')}`,
    time: `${Number(get('hour'))}:${get('minute')} ${get('dayPeriod').toUpperCase()}`,
  };
}

/** "9:37 PM" in the zone (UTC when none). Owner 24 Nov: one console format for every staff member. */
export function clock(iso: string | null | undefined, timeZone?: string | null): string {
  const d = parse(iso);
  if (!d) return '—';
  try { return partsIn(d, timeZone || 'UTC').time; } catch { return iso!.slice(11, 16); }
}

/** The zone's short name AT that moment ("IST", "MST" in winter, "MDT" in summer). */
export function zoneLabelAt(d: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }).formatToParts(d);
    const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
    return timeZone === 'Asia/Kolkata' ? 'IST' : plain(name);
  } catch {
    return '';
  }
}

/** "16 Nov 2026, 9:37 PM IST": the one console format (owner 24 Nov). No zone given means UTC,
 *  labelled; never the viewer's browser zone. */
export function stamp(iso: string | null | undefined, timeZone?: string | null): string {
  const d = parse(iso);
  if (!d) return '—';
  const tz = timeZone || 'UTC';
  try {
    const { date, time } = partsIn(d, tz);
    const label = zoneLabelAt(d, tz);
    return `${date}, ${time}${label ? ` ${label}` : ''}`;
  } catch {
    return `${iso!.replace('T', ' ').slice(0, 16)} UTC`;
  }
}

/** "16 Nov 2026": the day a moment falls on in the zone (UTC when none). */
export function dayIn(iso: string | null | undefined, timeZone?: string | null): string {
  const d = parse(iso);
  if (!d) return '—';
  try { return partsIn(d, timeZone || 'UTC').date; } catch { return iso!.slice(0, 10); }
}

/** "Monday 27 October" for the page header. */
export function longDate(date: Date, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }).format(date);
  } catch {
    return date.toDateString();
  }
}

/**
 * A calendar date ("2028-10-31" or an ISO timestamp) as the console writes it: "31 Oct 2028" in
 * every market (owner 24 Nov). Never shifted by a time zone.
 */
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "20 Nov 2026", "Nov 20, 2026" or "2026-11-20" -> "2026-11-20"; anything else -> null. */
export function parseMarketDate(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ');
  let y: number, m: number, d: number;
  let hit = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (hit) { y = +hit[1]; m = +hit[2]; d = +hit[3]; } else {
    hit = /^(\d{1,2}) ([a-z]{3})[a-z]* (\d{4})$/.exec(t);
    if (hit) { d = +hit[1]; m = MONTHS.indexOf(hit[2]) + 1; y = +hit[3]; } else {
      hit = /^([a-z]{3})[a-z]* (\d{1,2}) (\d{4})$/.exec(t);
      if (!hit) return null;
      m = MONTHS.indexOf(hit[1]) + 1; d = +hit[2]; y = +hit[3];
    }
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (m < 1 || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function marketDate(iso: string | null | undefined, country: string = 'IN'): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return iso ?? '';
  const [, y, mo, d] = m;
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(mo) - 1];
  if (!month) return iso ?? '';
  void country; // owner 24 Nov: the console writes every date one way, whatever the market
  return `${Number(d)} ${month} ${y}`;
}
