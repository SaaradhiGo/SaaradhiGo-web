/**
 * Pricing & fares (module 8): the commission matrix, rules, and fare cards.
 *
 * Pure helpers and the API shapes, so the pages stay thin and the arithmetic
 * that matters (what a draft would change, what a rider would pay) is tested
 * in one place. Nothing here talks to the network.
 *
 *   * money is integer minor units plus a currency, formatted per currency
 *     (`formatMinor`); the console never adds across currencies;
 *   * the commission shown is the one in force: the matrix is the server's
 *     resolution (most specific active rule wins), never recomputed here;
 *   * a draft is only ever a REQUEST: nothing here writes a rate.
 */
import { can, type AdminAccess } from './adminScope';
import { formatMinor } from './trips';

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

/** Drafting and submitting. Super Admin and City Ops hold it. */
export const canDraftPricing = (access: AdminAccess | null) => can(access, 'pricing.write');

// ---------------------------------------------------------------------------
// Commission: shapes
// ---------------------------------------------------------------------------

export type MatrixRow = {
  country: string; city: string; city_name: string; vehicle_type: number; vehicle_type_name: string;
  percent: string | null; source: string | null; rule_id: number | null; version: number | null;
  effective_from: string | null;
  next_change: { rule_id: number; percent: string; effective_from: string } | null;
};

export type RuleStatus = 'draft' | 'pending_approval' | 'active' | 'archived';
export type RuleState = 'draft' | 'pending_approval' | 'scheduled' | 'live' | 'superseded';

export type Rule = {
  id: number; country: string; city: string | null; city_name: string | null; scope_node: string | null;
  vehicle_type: number | null; vehicle_type_name: string | null;
  level: 'country' | 'city' | 'vehicle' | 'city_vehicle'; kind: string; percent: string;
  status: RuleStatus; state: RuleState; version: number;
  effective_from: string; effective_to: string | null; reason: string;
  created_by: { id: number | null; email: string; label: string; role: string };
  approval_request_id: number | null; submitted_at: string | null; activated_at: string | null;
  effective_from_adjusted: boolean; created_at: string;
};

export type CountryConfig = {
  country: string; configured: boolean; notice_days: number; max_percent: string | null;
  cap_status: string; version: number; updated_at: string | null; updated_by: string;
};

export type KindInfo = { kind: string; supported: boolean; label: string; note?: string };

export type Matrix = {
  rows: MatrixRow[];
  country_defaults: { country: string; rule: Rule | null }[];
  config: CountryConfig[];
  vehicle_types: { id: number; name: string }[];
  kinds: KindInfo[];
};

export type PreviewBucket = {
  trips_affected: number; drivers_affected: number; total_change_minor: number; average_change_minor: number;
};
export type EarningsPreview = {
  window_days: number; since: string; percent: string; by_currency: Record<string, PreviewBucket>;
  note: string; increase: boolean; notice_days: number; rule: Rule;
};

export type RuleDetail = {
  rule: Rule; history: Rule[]; config: CountryConfig;
  driver_notices: { id: number; status: string; old_percent: string | null; new_percent: string;
    effective_from: string; created_at: string }[];
  driver_notice_note: string;
};

// ---------------------------------------------------------------------------
// Commission: words and checks
// ---------------------------------------------------------------------------

export const STATE_WORDS: Record<RuleState, string> = {
  draft: 'Draft', pending_approval: 'Waiting for a checker', scheduled: 'Scheduled',
  live: 'In force', superseded: 'Superseded',
};

export const LEVEL_WORDS: Record<Rule['level'], string> = {
  country: 'Country default', city: 'City override', vehicle: 'Vehicle-class override',
  city_vehicle: 'City + vehicle class',
};

/** The cap line a country shows: a number, or the plain admission that legal has not confirmed it. */
export function capWords(c: CountryConfig | undefined | null): string {
  if (!c || c.max_percent === null) return 'cap not confirmed (legal)';
  return `cap ${Number(c.max_percent)}%`;
}

export function noticeWords(days: number): string {
  return days === 0 ? 'no notice period' : `${days} day${days === 1 ? '' : 's'} notice for an increase`;
}

export const pct = (v: string | number | null | undefined): string =>
  v === null || v === undefined || v === '' ? '—' : `${Number(v)}%`;

/** Cities and vehicle classes of a matrix, in the order they first appear, for a grid. */
export function gridOf(rows: MatrixRow[], country: string) {
  const mine = rows.filter((r) => r.country === country);
  const cities: { code: string; name: string }[] = [];
  const classes: { id: number; name: string }[] = [];
  const cell = new Map<string, MatrixRow>();
  for (const r of mine) {
    if (!cities.some((c) => c.code === r.city)) cities.push({ code: r.city, name: r.city_name });
    if (!classes.some((c) => c.id === r.vehicle_type)) classes.push({ id: r.vehicle_type, name: r.vehicle_type_name });
    cell.set(`${r.city}|${r.vehicle_type}`, r);
  }
  return { cities, classes, cell: (city: string, vt: number) => cell.get(`${city}|${vt}`) ?? null };
}

/** How many cells of a country have no rule: a city the readiness checklist will refuse. */
export function unconfiguredCells(rows: MatrixRow[], country: string): number {
  return rows.filter((r) => r.country === country && r.percent === null).length;
}

/** Whole days between two instants, rounded up: "7 days". */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.ceil((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86_400_000);
}

export type RuleDraft = { percent: string; effectiveFrom: string; reason: string };

/**
 * What stops a draft being sent, in words, or null. The server re-checks every
 * one of these (cap, notice, kind) against the world as it is at approval; this
 * only spares a round trip.
 */
export function ruleProblem(
  d: RuleDraft, config: CountryConfig | undefined | null,
  opts: { increase?: boolean; now?: Date } = {},
): string | null {
  const text = d.percent.trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) return 'Enter the rate as a number, like 15 or 12.5.';
  const value = Number(text);
  if (value < 0 || value > 100) return 'The rate must be between 0 and 100.';
  if (config && config.max_percent !== null && value > Number(config.max_percent)) {
    return `${value}% is above this country's cap of ${Number(config.max_percent)}%.`;
  }
  if (d.reason.trim().length < 5) return 'Say why, in a few words.';
  if (opts.increase && config && d.effectiveFrom) {
    const now = opts.now ?? new Date();
    const earliest = now.getTime() + config.notice_days * 86_400_000;
    if (new Date(d.effectiveFrom).getTime() < earliest - 60_000) {
      return `An increase needs ${config.notice_days} days notice for drivers; pick a later date or leave it blank.`;
    }
  }
  return null;
}

/** Is `value` above the rate now in force for the same scope? (the server decides; this previews). */
export function isIncrease(current: string | null | undefined, next: string): boolean {
  return current !== null && current !== undefined && Number(next) > Number(current);
}

/** Body for creating a draft. Blank optional fields are left out. */
export function draftBody(
  scope: { country: string; city: string; vehicleType: string }, d: RuleDraft,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    country: scope.country, kind: 'percentage', percent: d.percent.trim(), reason: d.reason.trim(),
  };
  if (scope.city) body.city = scope.city;
  if (scope.vehicleType) body.vehicle_type = Number(scope.vehicleType);
  if (d.effectiveFrom) body.effective_from = new Date(d.effectiveFrom).toISOString();
  return body;
}

// ---------------------------------------------------------------------------
// Driver-earnings preview
// ---------------------------------------------------------------------------

export type PreviewLine = {
  currency: string; trips: number; drivers: number; total: string; average: string;
  direction: 'more' | 'less' | 'same';
};

/**
 * The preview, one line per currency, never summed across currencies.
 * A positive change means drivers would have kept MORE.
 */
export function previewLines(p: EarningsPreview): PreviewLine[] {
  return Object.keys(p.by_currency).sort().map((currency) => {
    const b = p.by_currency[currency];
    return {
      currency, trips: b.trips_affected, drivers: b.drivers_affected,
      total: formatMinor(b.total_change_minor, currency, { signed: true }),
      average: formatMinor(b.average_change_minor, currency, { signed: true }),
      direction: b.total_change_minor > 0 ? 'more' : b.total_change_minor < 0 ? 'less' : 'same',
    };
  });
}

export function previewSentence(line: PreviewLine, windowDays: number): string {
  const who = `${line.trips} trip${line.trips === 1 ? '' : 's'} by ${line.drivers} driver${line.drivers === 1 ? '' : 's'}`;
  const what = line.direction === 'same' ? 'no change in driver earnings'
    : line.direction === 'more' ? `drivers would have kept ${line.total} more in total (${line.average} a trip)`
      : `drivers would have kept ${line.total.replace('-', '')} less in total (${line.average.replace('-', '')} a trip)`;
  return `Last ${windowDays} days, ${line.currency}: ${who} would be affected: ${what}.`;
}

// ---------------------------------------------------------------------------
// Fare cards
// ---------------------------------------------------------------------------

export const FARE_FIELDS = [
  { key: 'base_fare', label: 'Base fare', money: true },
  { key: 'per_km_fare', label: 'Per km', money: true },
  { key: 'per_min_fare', label: 'Per minute', money: true },
  { key: 'min_fare', label: 'Minimum fare', money: true },
  { key: 'night_surge_multiplier', label: 'Night multiplier', money: false },
  { key: 'night_surge_start_hour', label: 'Night starts (hour)', money: false },
  { key: 'night_surge_end_hour', label: 'Night ends (hour)', money: false },
  { key: 'surge_cap_multiplier', label: 'Surge cap', money: false },
  { key: 'gst_percent', label: 'Tax rate (%)', money: false },
] as const;

export type FareKey = typeof FARE_FIELDS[number]['key'];
export type FareValues = Record<FareKey, string>;

export type CardRow = FareValues & {
  id: number; version: number; is_active: boolean; effective_from: string; effective_to: string | null;
  state: 'live' | 'scheduled' | 'superseded' | 'retired'; notes: string;
};
export type FareClass = {
  vehicle_type: number; vehicle_type_name: string; live: CardRow | null; scheduled: CardRow | null;
  history: CardRow[];
};
export type FareZone = {
  zone: number; code: string; name: string; country: string; currency: string; distance_unit: string;
  classes: FareClass[];
};

export type FarePreviewRow = {
  distance_km: number; minutes: number; period: 'off_peak' | 'night';
  old_minor: number | null; new_minor: number; change_minor: number | null; night_applied: boolean;
};
export type FarePreview = {
  zone: string; vehicle_type: string; current_card: number | null;
  preview: { currency: string; assumes: string; rows: FarePreviewRow[] };
};

export const valuesOf = (card: FareValues): FareValues =>
  Object.fromEntries(FARE_FIELDS.map((f) => [f.key, String(card[f.key])])) as FareValues;

/** The fields a draft changes, for "this request will change". */
export function fareChanges(current: FareValues | null, draft: FareValues) {
  return FARE_FIELDS.filter((f) => !current || Number(current[f.key]) !== Number(draft[f.key]))
    .map((f) => ({ key: f.key, label: f.label, from: current ? Number(current[f.key]) : null, to: Number(draft[f.key]) }));
}

export function fareProblem(d: FareValues, reason: string, current: FareValues | null): string | null {
  for (const f of FARE_FIELDS) {
    const v = d[f.key].trim();
    if (v === '' || !/^\d+(\.\d+)?$/.test(v)) return `${f.label}: enter a number.`;
  }
  if (Number(d.surge_cap_multiplier) < 1) return 'The surge cap cannot be below 1.00.';
  for (const k of ['night_surge_start_hour', 'night_surge_end_hour'] as const) {
    const h = Number(d[k]);
    if (!Number.isInteger(h) || h < 0 || h > 23) return 'Night hours are whole hours from 0 to 23.';
  }
  if (current && fareChanges(current, d).length === 0) return 'Nothing differs from the live card.';
  if (reason.trim().length < 5) return 'Say why, in a few words.';
  return null;
}

/** The sample trips as a grid: one row per distance, the two periods side by side. */
export function previewGrid(rows: FarePreviewRow[]) {
  const km = Array.from(new Set(rows.map((r) => r.distance_km))).sort((a, b) => a - b);
  return km.map((d) => ({
    distance_km: d,
    off_peak: rows.find((r) => r.distance_km === d && r.period === 'off_peak') ?? null,
    night: rows.find((r) => r.distance_km === d && r.period === 'night') ?? null,
  }));
}

/** "₹120.00 → ₹132.00 (+₹12.00)", or just the new fare when there is no old card. */
export function fareChangeText(row: FarePreviewRow | null, currency: string): string {
  if (!row) return '—';
  const now = formatMinor(row.new_minor, currency);
  if (row.old_minor === null) return now;
  const was = formatMinor(row.old_minor, currency);
  if (row.change_minor === 0) return `${now} (no change)`;
  return `${was} → ${now} (${formatMinor(row.change_minor, currency, { signed: true })})`;
}

/** Body for the fare-card write: the draft values plus the reason; the zone and class come from the card. */
export function cardBody(d: FareValues, reason: string, effectiveFrom: string): Record<string, unknown> {
  const body: Record<string, unknown> = { reason: reason.trim() };
  for (const f of FARE_FIELDS) body[f.key] = d[f.key].trim();
  if (effectiveFrom) body.effective_from = new Date(effectiveFrom).toISOString();
  return body;
}
