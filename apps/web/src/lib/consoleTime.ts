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

/**
 * 15 Nov (owner): a US city's times in US style ("Nov 14, 7:58 PM MST"); India keeps "14 Nov, 19:58 IST".
 */
const usZone = (timeZone: string | null | undefined) => !!timeZone && timeZone.startsWith('America/');
/** Intl puts a narrow no-break space before AM/PM; a plain space reads and searches the same. */
const plain = (s: string) => s.replace(/[  ]/g, ' ');

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "14:05"; a US city's "2:05 PM". */
export function clock(iso: string | null | undefined, timeZone?: string | null): string {
  const d = parse(iso);
  if (!d) return '—';
  try {
    if (usZone(timeZone)) {
      return plain(new Intl.DateTimeFormat('en-US', { timeZone: timeZone!, hour: 'numeric', minute: '2-digit', hour12: true }).format(d));
    }
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
    const text = usZone(tz)
      ? plain(new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(d))
      : new Intl.DateTimeFormat('en-GB', {
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
    return new Intl.DateTimeFormat(usZone(timeZone) ? 'en-US' : 'en-GB', {
      timeZone, weekday: 'long', day: 'numeric', month: 'long',
    }).format(date);
  } catch {
    return date.toDateString();
  }
}

/**
 * A calendar date ("2028-10-31" or an ISO timestamp) as the market writes it: "31 Oct 2028" for
 * India (the default; owner 22 Nov), "Oct 31, 2028" for the USA. Never shifted by a time zone.
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
  if (country.toUpperCase() === 'US') return `${month} ${Number(d)}, ${y}`;
  return `${Number(d)} ${month} ${y}`;
}
