/**
 * Clock and calendar in the region the operator is looking at.
 *
 * One console serves Hyderabad and Austin. A trip requested "at 14:05" is
 * a different fact in each, and an operator in one city reading the other
 * city's board must see that city's local time, not their own browser's.
 * The time zone follows the SELECTED scope; when nothing narrower than the
 * whole platform is selected it falls back to the browser's.
 *
 * The map is by scope-code prefix, deepest match first. It is small
 * because the platform is: a new state in a new time zone is one line.
 */
const ZONES: Array<[prefix: string, tz: string]> = [
  ['US-TX', 'America/Chicago'],
  ['US', 'America/New_York'],
  ['IN', 'Asia/Kolkata'],
];

export function timeZoneFor(scopeCode: string | null | undefined): string | undefined {
  if (!scopeCode) return undefined;
  const hit = ZONES
    .filter(([prefix]) => scopeCode === prefix || scopeCode.startsWith(prefix + '-'))
    .sort((a, b) => b[0].length - a[0].length)[0];
  return hit?.[1];
}

/** "IST", "CDT" -- the short name a person would say. */
export function zoneAbbreviation(timeZone: string | undefined): string {
  try {
    const parts = new Intl.DateTimeFormat('en', { timeZone, timeZoneName: 'short' })
      .formatToParts(new Date());
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 24-hour clock, e.g. "14:05". */
export function clock(iso: string | null | undefined, timeZone?: string): string {
  const d = parse(iso);
  if (!d) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(d);
  } catch {
    return iso!.slice(11, 16);
  }
}

/** "27 Oct, 14:05" -- date and time, for a list that spans days. */
export function stamp(iso: string | null | undefined, timeZone?: string): string {
  const d = parse(iso);
  if (!d) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(d).replace(',', ',');
  } catch {
    return iso!.replace('T', ' ').slice(0, 16);
  }
}

/** "Monday 27 October" for the page header. */
export function longDate(date: Date, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone, weekday: 'long', day: 'numeric', month: 'long',
    }).format(date);
  } catch {
    return date.toDateString();
  }
}
