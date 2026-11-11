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
export function zoneAbbreviation(timeZone: string | null | undefined): string {
  return zoneLabelAt(new Date(), timeZone || 'UTC');
}

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 24-hour clock, e.g. "14:05". */
export function clock(iso: string | null | undefined, timeZone?: string | null): string {
  const d = parse(iso);
  if (!d) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timeZone || 'UTC', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(d);
  } catch {
    return iso!.slice(11, 16);
  }
}

/** The zone's short name AT that moment ("IST", "CST" in winter, "CDT" in summer). */
export function zoneLabelAt(d: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en', { timeZone, timeZoneName: 'short' }).formatToParts(d);
    const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
    // Intl spells India "GMT+5:30" in the 'en' locale; people say IST.
    return timeZone === 'Asia/Kolkata' ? 'IST' : name;
  } catch {
    return '';
  }
}

/** "27 Oct, 14:05 IST" -- date and time with its zone, for a list that spans days.
 *  No zone given means UTC, labelled; never the viewer's browser zone. */
export function stamp(iso: string | null | undefined, timeZone?: string | null): string {
  const d = parse(iso);
  if (!d) return '—';
  const tz = timeZone || 'UTC';
  try {
    const text = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(d);
    const label = zoneLabelAt(d, tz);
    return label ? `${text} ${label}` : text;
  } catch {
    return `${iso!.replace('T', ' ').slice(0, 16)} UTC`;
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
